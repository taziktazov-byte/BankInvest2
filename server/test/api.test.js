// Интеграционные тесты сервера на SQL Server: поднимают сервер на отдельном порту
// и отдельную базу (по умолчанию BankInvestTest), проходят сценарий
// «вход → портфель → покупка → продажа → отзыв» и проверяют права доступа.
//
// Запуск (в папке server):
//   set MSSQL_PASSWORD=…   (Windows)  /  export MSSQL_PASSWORD=…  (Linux/macOS)
//   npm test
//
// Переменные (как у сервера): MSSQL_SERVER, MSSQL_USER, MSSQL_PASSWORD,
// MSSQL_TEST_DATABASE (по умолчанию BankInvestTest), BANKINVEST_TEST_PORT.
// Тестовая база создаётся и наполняется автоматически (db/schema.sql + db/seed.sql).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const sql = require('mssql');

const PORT = Number(process.env.BANKINVEST_TEST_PORT || 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_NAME = process.env.MSSQL_TEST_DATABASE || 'BankInvestTest';

const SERVER = process.env.MSSQL_SERVER || 'localhost';
const USER = process.env.MSSQL_USER || '';
const PASSWORD = process.env.MSSQL_PASSWORD ?? '';
const TRUST = String(process.env.MSSQL_TRUST_CERT ?? '1') !== '0';
const ENCRYPT = String(process.env.MSSQL_ENCRYPT ?? '0').toLowerCase();

function masterConfig() {
  let server = SERVER, port;
  const comma = server.indexOf(',');
  if (comma > 0) { port = Number(server.slice(comma + 1)); server = server.slice(0, comma); }
  const options = { encrypt: ['1', 'true', 'yes', 'on'].includes(ENCRYPT), trustServerCertificate: TRUST, enableArithAbort: true };
  if (process.env.MSSQL_INSTANCE) options.instanceName = process.env.MSSQL_INSTANCE;
  else if (port) options.port = port;
  const cfg = { server, database: 'master', options, pool: { max: 4, min: 0 } };
  if (USER) { cfg.user = USER; cfg.password = PASSWORD; } else cfg.authentication = { type: 'default' };
  return cfg;
}

let child;
let available = false;

async function waitForServer(tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch { /* ещё не поднялся */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

async function call(p, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + '/api' + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function recreateDatabase() {
  const pool = await new sql.ConnectionPool(masterConfig()).connect();
  try {
    await pool.request().batch(`
      IF DB_ID('${DB_NAME}') IS NOT NULL
      BEGIN
        ALTER DATABASE [${DB_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
        DROP DATABASE [${DB_NAME}];
      END
      CREATE DATABASE [${DB_NAME}];`);
  } finally {
    await pool.close();
  }
}

test.before(async () => {
  try {
    await recreateDatabase();
  } catch (e) {
    available = false;
    console.log(`\n  SQL Server недоступен (${e.message}).`);
    console.log('  Тесты требуют SQL Server: задайте MSSQL_SERVER / MSSQL_USER / MSSQL_PASSWORD.\n');
    return;
  }
  available = true;
  child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      MSSQL_DATABASE: DB_NAME,
      BANKINVEST_AUTO_SCHEMA: '1',
      BANKINVEST_AUTO_SEED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  child.on('exit', code => { if (code) console.log(log); });
  await waitForServer();
});

test.after(async () => {
  child?.kill();
  await new Promise(r => setTimeout(r, 300));
  try {
    const pool = await new sql.ConnectionPool(masterConfig()).connect();
    await pool.request().batch(`ALTER DATABASE [${DB_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${DB_NAME}];`);
    await pool.close();
  } catch { /* база могла не создаться */ }
});

const skip = () => (available ? false : 'SQL Server недоступен в этой среде');

test('служебные точки: /api/health, /api/ping, /api/i18n', { skip: skip() }, async () => {
  const h = await call('/health');
  assert.equal(h.status, 200);
  assert.equal(h.data.app, 'BankInvest');
  assert.equal(h.data.database, 'sqlserver');

  const p = await call('/ping');
  assert.ok(p.data.securities > 0, 'демо-бумаги созданы');
  assert.ok(p.data.clients > 0, 'демо-клиенты созданы');

  const i = await call('/i18n');
  assert.deepEqual(i.data.languages, ['ru', 'en', 'be']);
  assert.equal(i.data.dict['m.Home'].length, 3);
  assert.equal(i.data.dict['b.Buy'][0], 'Купить');
  assert.ok(i.data.dict['db.connect'], 'есть тексты ошибок SQL Server');
});

test('веб-приложение отдаётся с сервера', { skip: skip() }, async () => {
  const res = await fetch(BASE + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /app\.js/);
  const js = await fetch(BASE + '/app.js');
  assert.equal(js.status, 200);
  assert.match(await js.text(), /BankInvest/);
});

test('вход: неверный пароль и успешный вход клиента/сотрудника/админа', { skip: skip() }, async () => {
  const bad = await call('/auth/login', { method: 'POST', body: { id: 'client', password: 'wrong', mode: 'user' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error.key, 'login.fail');

  for (const [id, pw, role] of [['client', 'client123', 'Client'], ['employee', 'emp123', 'Employee'], ['admin', 'admin123', 'Admin']]) {
    const r = await call('/auth/login', { method: 'POST', body: { id, password: pw, mode: 'user' } });
    assert.equal(r.status, 200, id);
    assert.equal(r.data.role, role);
    assert.ok(r.data.token.length > 20);
  }

  assert.equal((await call('/auth/me')).status, 401, 'без токена доступа нет');
});

test('вход по Company ID (УНП)', { skip: skip() }, async () => {
  const r = await call('/auth/login', { method: 'POST', body: { id: '100200300', password: 'client123', mode: 'company' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.clientName, 'ООО «Альфа»');
});

test('портфель, главная и график возвращают данные', { skip: skip() }, async () => {
  const { data: s } = await call('/auth/login', { method: 'POST', body: { id: '190456789', password: 'client123', mode: 'company' } });
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

  // даты приходят строками, как их ждут десктоп и веб
  const chart = await call('/stock/BYN-GB1/chart?grain=1', { token: t });
  assert.ok(chart.data.points.length >= 20, 'история наполнена');
  assert.match(String(chart.data.points[0].t), /^\d{4}-\d{2}-\d{2}/);
  for (const grain of [0, 2, 3, 4]) {
    const g = await call(`/stock/BYN-GB1/chart?grain=${grain}`, { token: t });
    assert.ok(Array.isArray(g.data.points), 'grain ' + grain);
  }
});

test('покупка через usp_BuyListing и продажа обновляют портфель и транзакции', { skip: skip() }, async () => {
  const { data: buyer } = await call('/auth/login', { method: 'POST', body: { id: '291234567', password: 'client123', mode: 'company' } });
  const { data: admin } = await call('/auth/login', { method: 'POST', body: { id: 'admin', password: 'admin123', mode: 'user' } });
  const t = buyer.token;

  const offers = await call('/offers', { token: t });
  assert.ok(offers.data.length > 0);
  const offer = offers.data[0];

  // своё же предложение купить нельзя — проверка и в сервере, и в процедуре
  const mineBefore = await call('/my-offers', { token: t });
  assert.ok(mineBefore.data.length > 0, 'у клиента есть свои предложения');
  const own = await call('/trade/buy', { method: 'POST', token: t, body: { listingId: mineBefore.data[0].Id, qty: 1 } });
  assert.equal(own.data.error.key, 'e.own');

  const txsBefore = (await call('/transactions', { token: t })).data.length;
  const buy = await call('/trade/buy', { method: 'POST', token: t, body: { listingId: offer.Id, qty: 5 } });
  assert.equal(buy.status, 200, JSON.stringify(buy.data));
  assert.equal(buy.data.qty, 5);
  assert.equal(buy.data.commission, Math.round(offer.Price * 5 * 0.005 * 100) / 100);

  const txsAfter = (await call('/transactions', { token: t })).data;
  assert.equal(txsAfter.length, txsBefore + 1, 'покупка попала в историю операций');
  assert.equal(txsAfter[0].Type, 'Buy');
  assert.equal(txsAfter[0].Status, 'Исполнена', 'статус ставит usp_BuyListing');
  assert.match(String(txsAfter[0].Date), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

  // слишком большое количество — RAISERROR ERR_QTY из процедуры
  const tooMuch = await call('/trade/buy', { method: 'POST', token: t, body: { listingId: offer.Id, qty: 999999 } });
  assert.equal(tooMuch.status, 400);
  assert.equal(tooMuch.data.error.key, 'e.qty');

  // продажа: выставляем свои бумаги, затем отзываем
  const sellable = await call('/sellable', { token: t });
  const have = sellable.data.find(x => x.Free > 0);
  assert.ok(have, 'есть свободные бумаги');
  const sell = await call('/trade/sell', { method: 'POST', token: t, body: { securityId: have.Id, qty: 1, price: have.Price } });
  assert.equal(sell.status, 200, JSON.stringify(sell.data));

  const badPrice = await call('/trade/sell', { method: 'POST', token: t, body: { securityId: have.Id, qty: 1, price: have.Price * 100 } });
  assert.equal(badPrice.data.error.key, 'e.price');

  const mine = await call('/my-offers', { token: t });
  assert.ok(mine.data.some(x => x.Price === sell.data.price));

  const w = await call('/trade/withdraw', { method: 'POST', token: t, body: { listingId: mine.data[0].Id } });
  assert.equal(w.status, 200);
  const afterWithdraw = await call('/my-offers', { token: t });
  assert.ok(!afterWithdraw.data.some(x => x.Id === mine.data[0].Id), 'предложение отозвано');

  const allTx = await call('/transactions', { token: admin.token });
  assert.ok(allTx.data.length >= txsAfter.length);
});

test('целевые доли сохраняются, сумма больше 100 % отклоняется', { skip: skip() }, async () => {
  const { data: s } = await call('/auth/login', { method: 'POST', body: { id: '100987654', password: 'client123', mode: 'company' } });
  const t = s.token;
  const pf = await call('/portfolio', { token: t });
  const rows = pf.data.rows.map((r, i) => ({ id: r.Id, targetPct: i === 0 ? 40 : r.TargetPct }));
  assert.equal((await call('/portfolio/targets', { method: 'POST', token: t, body: { rows } })).status, 200);

  const again = await call('/portfolio', { token: t });
  assert.equal(again.data.rows[0].TargetPct, 40);
  assert.ok(Math.abs(again.data.rows[0].TargetValue - Math.round(again.data.total * 0.4 * 100) / 100) < 0.011);

  const bad = await call('/portfolio/targets', {
    method: 'POST', token: t,
    body: { rows: [{ id: pf.data.rows[0].Id, targetPct: 90 }, { id: pf.data.rows[1].Id, targetPct: 90 }] },
  });
  assert.equal(bad.data.error.key, 'e.sum100');
});

test('права доступа: клиент не видит клиентов, сотрудников и админку', { skip: skip() }, async () => {
  const { data: c } = await call('/auth/login', { method: 'POST', body: { id: 'client', password: 'client123', mode: 'user' } });
  const { data: e } = await call('/auth/login', { method: 'POST', body: { id: 'employee', password: 'emp123', mode: 'user' } });
  const { data: a } = await call('/auth/login', { method: 'POST', body: { id: 'admin', password: 'admin123', mode: 'user' } });

  assert.equal((await call('/clients', { token: c.token })).status, 403);
  assert.equal((await call('/clients', { token: e.token })).status, 200);
  assert.equal((await call('/users', { token: e.token })).status, 403);
  assert.equal((await call('/users', { token: a.token })).status, 200);
  assert.equal((await call('/report', { token: c.token })).status, 403);
  assert.equal((await call('/projects', { token: e.token })).status, 200);

  const own = await call('/transactions', { token: c.token });
  const all = await call('/transactions', { token: e.token });
  assert.ok(own.data.length <= all.data.length);
  assert.ok(own.data.every(x => x.Client === c.clientName));
});

test('регистрация нового клиента и повторная попытка с тем же УНП', { skip: skip() }, async () => {
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

test('отчёты и инвест-проекты считаются сервером', { skip: skip() }, async () => {
  const { data: a } = await call('/auth/login', { method: 'POST', body: { id: 'admin', password: 'admin123', mode: 'user' } });
  const rep = await call('/report', { token: a.token });
  assert.ok(rep.data.some(r => r.metric === 'r.ops'));
  assert.ok(rep.data.some(r => r.metric === 'r.income'));

  const pr = await call('/projects', { token: a.token });
  const p = pr.data.find(x => x.Project === 'Модернизация склада');
  assert.ok(p, 'проект из демо-данных');
  const npv = -150000 + 45000 / 1.12 + 60000 / 1.12 ** 2 + 70000 / 1.12 ** 3 + 50000 / 1.12 ** 4;
  assert.ok(Math.abs(p.NPV - Math.round(npv * 100) / 100) < 0.02, `NPV ${p.NPV} vs ${npv}`);
  assert.ok(p.IRR > 0 && p.PI > 1);
});

test('журнал действий и выход из системы', { skip: skip() }, async () => {
  const { data: s } = await call('/auth/login', { method: 'POST', body: { id: 'admin', password: 'admin123', mode: 'user' } });
  const log = await call('/audit', { token: s.token });
  assert.ok(log.data.length > 0);
  assert.match(String(log.data[0].Time), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

  assert.equal((await call('/auth/me', { token: s.token })).status, 200);
  await call('/auth/logout', { method: 'POST', token: s.token });
  assert.equal((await call('/auth/me', { token: s.token })).status, 401);
});
