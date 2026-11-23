// Интеграционные тесты сервера: запускают сервер на отдельном порту и
// проходят полный сценарий «вход → портфель → покупка → продажа → отзыв»,
// плюс проверяют права доступа. Запуск: npm test (в папке server).
//
// Используется встроенный node:test — дополнительных зависимостей не нужно.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'bankinvest-test-'));

let child;

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch { /* ещё не поднялся */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

test.before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), BANKINVEST_DATA: DATA, HOST: '127.0.0.1' },
    stdio: 'ignore',
  });
  await waitForServer();
});

test.after(() => {
  child?.kill();
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* ok */ }
});

test('служебные точки: /api/health, /api/ping, /api/i18n', async () => {
  const h = await call('/health');
  assert.equal(h.status, 200);
  assert.equal(h.data.app, 'BankInvest');

  const p = await call('/ping');
  assert.ok(p.data.securities > 0, 'демо-бумаги созданы');
  assert.ok(p.data.clients > 0, 'демо-клиенты созданы');

  const i = await call('/i18n');
  assert.deepEqual(i.data.languages, ['ru', 'en', 'be']);
  assert.equal(i.data.dict['m.Home'].length, 3);
  assert.equal(i.data.dict['b.Buy'][0], 'Купить');
});

test('веб-приложение отдаётся с сервера', async () => {
  const res = await fetch(BASE + '/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /app\.js/);
  const js = await fetch(BASE + '/app.js');
  assert.equal(js.status, 200);
  assert.match(await js.text(), /BankInvest/);
});

test('вход: неверный пароль и успешный вход клиента/сотрудника/админа', async () => {
  const bad = await call('/auth/login', { method: 'POST', body: { id: 'client', password: 'wrong', mode: 'user' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error.key, 'login.fail');

  for (const [id, pw, role] of [['client', 'client123', 'Client'], ['employee', 'employee123', 'Employee'], ['admin', 'admin123', 'Admin']]) {
    const r = await call('/auth/login', { method: 'POST', body: { id, password: pw, mode: 'user' } });
    assert.equal(r.status, 200, id);
    assert.equal(r.data.role, role);
    assert.ok(r.data.token.length > 20);
  }

  const me = await call('/auth/me');
  assert.equal(me.status, 401, 'без токена доступа нет');
});

test('вход по Company ID (УНП)', async () => {
  const r = await call('/auth/login', { method: 'POST', body: { id: '100234567', password: 'client123', mode: 'company' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.clientName, 'ООО «Вектор Плюс»');
});

test('портфель, главная и график возвращают данные', async () => {
  const { data: s } = await call('/auth/login', { method: 'POST', body: { id: 'client', password: 'client123', mode: 'user' } });
  const t = s.token;

  const home = await call('/home', { token: t });
  assert.equal(home.data.kpis.length, 4);
  assert.ok(home.data.up.length + home.data.down.length > 0);

  const pf = await call('/portfolio', { token: t });
  assert.ok(pf.data.rows.length > 0);
  assert.ok(pf.data.total > 0);
  for (const r of pf.data.rows) {
    assert.ok('CurrentPct' in r && 'TargetValue' in r && 'Amount' in r);
  }

  const chart = await call('/stock/ASB-EQ-BNB/chart?grain=1', { token: t });
  assert.ok(chart.data.points.length >= 20, 'история наполнена');
  const yearly = await call('/stock/ASB-EQ-BNB/chart?grain=4', { token: t });
  assert.ok(Array.isArray(yearly.data.points));
});

test('покупка по предложению и продажа обновляют портфель и транзакции', async () => {
  const { data: buyer } = await call('/auth/login', { method: 'POST', body: { id: 'client', password: 'client123', mode: 'user' } });
  const { data: admin } = await call('/auth/login', { method: 'POST', body: { id: 'admin', password: 'admin123', mode: 'user' } });
  const t = buyer.token;

  const offers = await call('/offers', { token: t });
  assert.ok(offers.data.length > 0);
  const offer = offers.data[0];

  // своё же предложение купить нельзя
  const mineBefore = await call('/my-offers', { token: t });
  assert.ok(mineBefore.data.length > 0, 'у клиента есть свои предложения');
  const own = await call('/trade/buy', { method: 'POST', token: t, body: { listingId: mineBefore.data[0].Id, qty: 1 } });
  assert.equal(own.data.error.key, 'e.own');
  // и свои предложения не видны в общем списке для покупки
  const visible = await call('/offers', { token: t });
  assert.ok(!visible.data.some(o => o.Id === mineBefore.data[0].Id));

  const txsBefore = (await call('/transactions', { token: t })).data.length;

  const buy = await call('/trade/buy', { method: 'POST', token: t, body: { listingId: offer.Id, qty: 5 } });
  assert.equal(buy.status, 200, JSON.stringify(buy.data));
  assert.equal(buy.data.qty, 5);
  assert.equal(buy.data.commission, Math.round(offer.Price * 5 * 0.005 * 100) / 100);

  const txsAfter = (await call('/transactions', { token: t })).data;
  assert.equal(txsAfter.length, txsBefore + 1, 'покупка попала в историю операций');
  assert.equal(txsAfter[0].Type, 'Buy');

  // слишком большое количество — ошибка бизнес-логики
  const tooMuch = await call('/trade/buy', { method: 'POST', token: t, body: { listingId: offer.Id, qty: 999999 } });
  assert.equal(tooMuch.status, 400);
  assert.equal(tooMuch.data.error.key, 'e.qty');

  // продажа: выставляем свои бумаги, затем отзываем
  const sellable = await call('/sellable', { token: t });
  const have = sellable.data.find(x => x.Free > 0);
  assert.ok(have, 'есть свободные бумаги');
  const sell = await call('/trade/sell', { method: 'POST', token: t, body: { securityId: have.Id, qty: 1, price: have.Price } });
  assert.equal(sell.status, 200, JSON.stringify(sell.data));

  // цена вне коридора 0,3–3 от рынка отклоняется
  const badPrice = await call('/trade/sell', { method: 'POST', token: t, body: { securityId: have.Id, qty: 1, price: have.Price * 100 } });
  assert.equal(badPrice.data.error.key, 'e.price');

  const mine = await call('/my-offers', { token: t });
  assert.ok(mine.data.some(x => x.Price === sell.data.price));

  const w = await call('/trade/withdraw', { method: 'POST', token: t, body: { listingId: mine.data[0].Id } });
  assert.equal(w.status, 200);
  const afterWithdraw = await call('/my-offers', { token: t });
  assert.ok(!afterWithdraw.data.some(x => x.Id === mine.data[0].Id), 'предложение отозвано');

  // администратор видит историю всех клиентов
  const all = await call('/transactions', { token: admin.token });
  assert.ok(all.data.length >= txsAfter.length);
});

test('целевые доли сохраняются, сумма больше 100 % отклоняется', async () => {
  const { data: s } = await call('/auth/login', { method: 'POST', body: { id: 'client', password: 'client123', mode: 'user' } });
  const t = s.token;
  const pf = await call('/portfolio', { token: t });
  const rows = pf.data.rows.map((r, i) => ({ id: r.Id, targetPct: i === 0 ? 40 : r.TargetPct }));
  const okRes = await call('/portfolio/targets', { method: 'POST', token: t, body: { rows } });
  assert.equal(okRes.status, 200);

  const again = await call('/portfolio', { token: t });
  assert.equal(again.data.rows[0].TargetPct, 40);
  assert.ok(Math.abs(again.data.rows[0].TargetValue - Math.round(again.data.total * 0.4 * 100) / 100) < 0.011);

  const bad = await call('/portfolio/targets', {
    method: 'POST', token: t,
    body: { rows: [{ id: pf.data.rows[0].Id, targetPct: 90 }, { id: pf.data.rows[1].Id, targetPct: 90 }] },
  });
  assert.equal(bad.data.error.key, 'e.sum100');
});

test('права доступа: клиент не видит клиентов, сотрудников и админку', async () => {
  const { data: c } = await call('/auth/login', { method: 'POST', body: { id: 'client', password: 'client123', mode: 'user' } });
  const { data: e } = await call('/auth/login', { method: 'POST', body: { id: 'employee', password: 'employee123', mode: 'user' } });
  const { data: a } = await call('/auth/login', { method: 'POST', body: { id: 'admin', password: 'admin123', mode: 'user' } });

  assert.equal((await call('/clients', { token: c.token })).status, 403);
  assert.equal((await call('/clients', { token: e.token })).status, 200);
  assert.equal((await call('/users', { token: e.token })).status, 403);
  assert.equal((await call('/users', { token: a.token })).status, 200);
  assert.equal((await call('/report', { token: c.token })).status, 403);
  assert.equal((await call('/projects', { token: e.token })).status, 200);

  // клиент видит только свои транзакции
  const own = await call('/transactions', { token: c.token });
  const all = await call('/transactions', { token: e.token });
  assert.ok(own.data.length <= all.data.length);
  assert.ok(own.data.every(x => x.Client === c.clientName));
});

test('регистрация нового клиента и повторная попытка с тем же УНП', async () => {
  const body = { kind: 'company', name: 'ООО «Тест»', unp: '555666777', password: 'secret1', password2: 'secret1' };
  const r = await call('/auth/register', { method: 'POST', body });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.login, '555666777');

  const again = await call('/auth/register', { method: 'POST', body });
  assert.equal(again.data.error.key, 'reg.e.exists');

  const badUnp = await call('/auth/register', { method: 'POST', body: { ...body, unp: '12' } });
  assert.equal(badUnp.data.error.key, 'reg.e.unp');

  const login = await call('/auth/login', { method: 'POST', body: { id: '555666777', password: 'secret1', mode: 'company' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.clientName, 'ООО «Тест»');
});

test('отчёты и инвест-проекты считаются сервером', async () => {
  const { data: a } = await call('/auth/login', { method: 'POST', body: { id: 'admin', password: 'admin123', mode: 'user' } });
  const rep = await call('/report', { token: a.token });
  assert.ok(rep.data.some(r => r.metric === 'r.ops'));
  assert.ok(rep.data.some(r => r.metric === 'r.income'));

  const pr = await call('/projects', { token: a.token });
  const p = pr.data[0];
  const npv = -150000 + 45000 / 1.12 + 60000 / 1.12 ** 2 + 70000 / 1.12 ** 3 + 50000 / 1.12 ** 4;
  assert.ok(Math.abs(p.NPV - Math.round(npv * 100) / 100) < 0.02, `NPV ${p.NPV} vs ${npv}`);
  assert.ok(p.IRR > 0 && p.PI > 1);
});

test('выход закрывает сессию', async () => {
  const { data: s } = await call('/auth/login', { method: 'POST', body: { id: 'client', password: 'client123', mode: 'user' } });
  assert.equal((await call('/auth/me', { token: s.token })).status, 200);
  await call('/auth/logout', { method: 'POST', token: s.token });
  assert.equal((await call('/auth/me', { token: s.token })).status, 401);
});
