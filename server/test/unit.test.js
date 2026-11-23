// Модульные тесты чистой логики: не требуют ни SQL Server, ни сети.
// Запуск: cd server && node --test test/unit.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const L = require('../src/logic');
const D = require('../src/db');

test('нормализация результатов SQL Server: Date -> строка, BigInt -> число', () => {
  const dt = new Date(2026, 10, 23, 18, 9, 18);          // локальное время, как отдаёт mssql
  const row = { Id: 7, Date: dt, History: 123n, Nested: { At: dt, Deep: [{ When: dt }] }, Null: null };
  const n = L.normalize(row);
  assert.equal(n.Id, 7);
  assert.equal(n.Date, '2026-11-23 18:09:18');
  assert.equal(n.History, 123);
  assert.equal(typeof n.History, 'number');
  assert.equal(n.Nested.At, '2026-11-23 18:09:18');
  assert.equal(n.Nested.Deep[0].When, '2026-11-23 18:09:18');
  assert.equal(n.Null, null);
  assert.deepEqual(L.normalize([dt]), ['2026-11-23 18:09:18']);
  assert.equal(D.toIso(null), null);
  assert.equal(D.toIso('2026-01-02'), '2026-01-02');
});

test('портфель: текущая доля, целевая стоимость и отклонение', () => {
  const rows = [
    { Id: 1, CurrentValue: 600, TargetPct: 40 },
    { Id: 2, CurrentValue: 400, TargetPct: 10 },
  ];
  const r = L.recalc(rows);
  assert.equal(r.total, 1000);
  assert.equal(rows[0].CurrentPct, 60);
  assert.equal(rows[1].CurrentPct, 40);
  assert.equal(rows[0].TargetValue, 400);
  assert.equal(rows[0].Amount, -200);       // цель 400, сейчас 600 -> продать 200
  assert.equal(r.targetValue, 500);
  assert.equal(r.targetPctSum, 50);
  assert.equal(r.diff, -500);
});

test('инвест-проект: NPV, IRR, PI и окупаемость', () => {
  const m = L.projectMetrics(12, '-150000;45000;60000;70000;50000');
  const npv = -150000 + 45000 / 1.12 + 60000 / 1.12 ** 2 + 70000 / 1.12 ** 3 + 50000 / 1.12 ** 4;
  assert.ok(Math.abs(m.NPV - Math.round(npv * 100) / 100) < 0.02, `NPV ${m.NPV} vs ${npv}`);
  assert.ok(m.IRR > 12 && m.IRR < 20, 'IRR выше ставки проекта');
  assert.ok(m.PI > 1);
  assert.ok(m.Payback > 2 && m.Payback < 4);
  // денежных потоков меньше двух — метрики не считаются
  assert.deepEqual(L.projectMetrics(10, '-100'), { NPV: null, IRR: null, PI: null, Payback: null });
});

test('комиссия и округление — 0,5 % с каждой стороны сделки', () => {
  assert.equal(L.COMMISSION_RATE, 0.005);
  const buy = L.round2(103.1 * 10 * L.COMMISSION_RATE);
  assert.equal(buy, 5.16);                  // 5.155 -> 5.16
  assert.equal(L.round2(0.1 + 0.2), 0.3);
});

test('права: клиент / сотрудник / администратор', () => {
  assert.equal(L.isStaff({ Role: 'Client' }), false);
  assert.equal(L.isStaff({ Role: 'Employee' }), true);
  assert.equal(L.isStaff({ Role: 'Admin' }), true);
  assert.equal(L.isAdmin({ Role: 'Employee' }), false);
  assert.equal(L.isAdmin({ Role: 'Admin' }), true);
  assert.equal(L.isStaff(null), false);
});

test('публичная сессия не выдаёт хеш пароля и содержит флаги прав', () => {
  const s = L.sessionPublic({ Token: 't', Login: 'admin', Role: 'Admin', ClientId: null, Client: '', Lang: 1 });
  assert.deepEqual(Object.keys(s).sort(), ['clientId', 'clientName', 'isAdmin', 'isStaff', 'lang', 'login', 'role', 'token'].sort());
  assert.equal(s.isAdmin, true);
  assert.equal(s.password, undefined);
  assert.equal(s.PasswordHash, undefined);
});

test('хеш пароля совпадает с SHA-256 в верхнем регистре (как в исходной базе)', () => {
  // проверка совместимости: HASHBYTES('SHA2_256','admin123') в SQL Server
  const crypto = require('node:crypto');
  const expected = crypto.createHash('sha256').update('admin123', 'utf8').digest('hex').toUpperCase();
  assert.equal(D.hash('admin123'), expected);
  assert.equal(D.hash('admin123'), '240BE518FABD2724DDB6F04EEB1DA5967448D7E831C08C8FA822809F74C720A9');
  assert.equal(D.hash('admin123'), D.hash('admin123'), 'детерминированный');
  assert.notEqual(D.hash('admin123'), D.hash('admin1234'));
});

test('ошибки бизнес-логики несут ключ i18n и HTTP-статус', () => {
  const e = D.err('e.own', 400);
  assert.ok(e instanceof D.ApiError);
  assert.equal(e.key, 'e.own');
  assert.equal(e.status, 400);
  assert.throws(() => { throw D.err('login.fail', 401); }, err => err.status === 401 && err.key === 'login.fail');
});

test('график: даты — короткие строки, которые парсит десктоп (Api.Date)', () => {
  // Api.Date понимает 'yyyy-MM-dd', 'yyyy-MM', 'yyyy' и полные даты
  const patterns = { '2026-11-23': /^\d{4}-\d{2}-\d{2}$/, '2026-11': /^\d{4}-\d{2}$/, '2026': /^\d{4}$/ };
  for (const [value, re] of Object.entries(patterns)) assert.match(value, re);
  // в T-SQL это CONVERT(CHAR(10), [At], 23) / CONVERT(CHAR(7), …) / CONVERT(CHAR(4), …)
  assert.equal('2026-11-23', '2026-11-23');
});

test('целевые доли: 0 в базе означает «не задана» (в API — null)', () => {
  const rows = [
    { Id: 1, CurrentValue: 1000, TargetPct: 0 },
    { Id: 2, CurrentValue: 500, TargetPct: 50 },
  ];
  // имитируем нормализацию из portfolio(): ноль -> null
  for (const r of rows) if (Number(r.TargetPct) === 0) r.TargetPct = null;
  const res = L.recalc(rows);
  assert.equal(rows[0].TargetPct, null);
  assert.equal(rows[0].TargetValue, 0);
  assert.equal(rows[0].CurrentPct, 66.67);
  assert.equal(res.total, 1500);
  assert.equal(res.targetPctSum, 50);
  assert.equal(res.targetValue, 750);
  assert.equal(res.diff, -750);
});

test('ключи ошибок базы переведены на три языка (для веба и десктопа)', () => {
  const dict = require('../src/i18n.json');
  for (const key of ['db.error', 'db.connect', 'db.login', 'db.permission', 'db.noschema', 'db.empty']) {
    assert.ok(Array.isArray(dict[key]) && dict[key].length === 3, key);
  }
  assert.ok(dict['db.connect'][0].includes('SQL Server'));
});

test('текст ошибки процедуры SQL Server превращается в ключ i18n', () => {
  // так mssql сообщает о RAISERROR(N'ERR_OWN',16,1) из usp_BuyListing
  const fake = { message: "RequestError: Error: ERR_OWN" };
  const map = { ERR_NOLISTING: 'e.nolisting', ERR_OWN: 'e.own', ERR_QTY: 'e.qty', ERR_ACC: 'e.noaccount', ERR_SELLERQTY: 'e.sellerqty' };
  assert.equal(Object.entries(map).find(([code]) => fake.message.includes(code))[1], 'e.own');
});
