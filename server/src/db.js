// Database layer for the BankInvest server: Microsoft SQL Server.
//
// The schema is the original one (db/schema.sql — Database.sql + Update_v2/3/4),
// and the business rules live in the database itself:
//   * usp_BuyListing  — покупка по предложению (одна транзакция)
//   * usp_UpdatePrices — почасовое «тиканье» цен
// Both the web client and the desktop client reach this layer through the same
// REST API, so both write to the same SQL Server database.
//
// Connection settings (environment variables):
//   MSSQL_SERVER    localhost            — хост или хост\экземпляр, можно с портом: localhost,1433
//   MSSQL_DATABASE  BankInvest
//   MSSQL_USER / MSSQL_PASSWORD          — SQL-логин приложения (для локального SQL Server задайте оба)
//   MSSQL_INSTANCE  SQLEXPRESS           — именованный экземпляр (необязательно)
//   MSSQL_ENCRYPT / MSSQL_TRUST_CERT     — по умолчанию false / true (локальный сервер)
//   MSSQL_POOL_MAX 10                    — размер пула соединений
//   BANKINVEST_CONNECTION                — полная строка подключения (перекрывает всё выше)
//   BANKINVEST_AUTO_SCHEMA    1          — при первом запуске выполнить db/schema.sql
//   BANKINVEST_AUTO_SEED      1          — если база пустая, загрузить db/seed.sql
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const sql = require('mssql');

// ---------------------------------------------------------------- configuration
const SERVER = process.env.MSSQL_SERVER || process.env.BANKINVEST_SQL_SERVER || 'localhost';
const DATABASE = process.env.MSSQL_DATABASE || 'BankInvest';
const USER = process.env.MSSQL_USER || process.env.BANKINVEST_SQL_USER || '';
const PASSWORD = process.env.MSSQL_PASSWORD ?? process.env.BANKINVEST_SQL_PASSWORD ?? '';
const INSTANCE = process.env.MSSQL_INSTANCE || '';
const POOL_MAX = Number(process.env.MSSQL_POOL_MAX || 10);
const AUTO_SCHEMA = String(process.env.BANKINVEST_AUTO_SCHEMA ?? '1') !== '0';
const AUTO_SEED = String(process.env.BANKINVEST_AUTO_SEED ?? '1') !== '0';

const boolEnv = (name, def) => {
  const v = process.env[name];
  if (v == null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

function buildConfig() {
  const pool = { max: POOL_MAX, min: 0, idleTimeoutMillis: 30000 };
  if (process.env.BANKINVEST_CONNECTION) {
    return { connectionString: process.env.BANKINVEST_CONNECTION, pool, options: {} };
  }
  // "host,1433" — порт, "host\\INSTANCE" — именованный экземпляр
  let server = SERVER;
  let port;
  const comma = server.indexOf(',');
  if (comma > 0) { port = Number(server.slice(comma + 1)); server = server.slice(0, comma); }
  const options = {
    encrypt: boolEnv('MSSQL_ENCRYPT', false),
    trustServerCertificate: boolEnv('MSSQL_TRUST_CERT', true),
    enableArithAbort: true,
    useUTC: false,                       // GETDATE() — локальное время сервера, как были написаны процедуры
  };
  if (INSTANCE) options.instanceName = INSTANCE;
  else if (port) options.port = port;
  const cfg = { server, database: DATABASE, options, pool };
  if (USER) { cfg.user = USER; cfg.password = PASSWORD; }
  else cfg.authentication = { type: 'default' };   // без логина: текущий пользователь Windows (обычно SQL Server его не примет)
  return cfg;
}

const CONFIG = buildConfig();
const DB_FILE = process.env.BANKINVEST_CONNECTION
  ? '(строка подключения из BANKINVEST_CONNECTION)'
  : `${CONFIG.server || SERVER}${CONFIG.options?.port ? ',' + CONFIG.options.port : ''}${CONFIG.options?.instanceName ? '\\' + CONFIG.options.instanceName : ''}/${DATABASE}`;

let pool = null;

// ---------------------------------------------------------------- pooling
async function ensurePool() {
  if (pool && pool.connected) return pool;
  if (!pool) pool = new sql.ConnectionPool(CONFIG);
  try {
    await pool.connect();
  } catch (e) {
    pool = null;
    // Базы может не быть (свежий SQL Server, контейнер Docker): создаём её в master
    // и повторяем подключение. schema.sql создаёт только таблицы, не саму базу.
    if (e && e.number === 4060 && (USER || process.env.BANKINVEST_CREATE_DB !== '0')) {
      await createDatabase(e);
      return ensurePool();
    }
    throw sqlError(e);
  }
  return pool;
}

/** Создать пустую базу DATABASE, если её ещё нет (подключение через master). */
async function createDatabase(originalError) {
  const master = Object.assign({}, CONFIG, { database: 'master' });
  let probe = null;
  try {
    probe = new sql.ConnectionPool(master);
    await probe.connect();
    await probe.request().query(
      `IF DB_ID(N'${String(DATABASE).replace(/'/g, "''")}') IS NULL CREATE DATABASE [${String(DATABASE).replace(/]/g, ']]')}];`);
  } catch (e) {
    // нет прав dbcreator или базы правда нет иными причинами — сообщаем исходную ошибку
    throw sqlError(originalError);
  } finally {
    if (probe) { try { await probe.close(); } catch { /* уже закрыт */ } }
  }
}

async function closePool() {
  if (!pool) return;
  try { await pool.close(); } catch { /* уже закрыт */ }
  pool = null;
}

// Ошибки SQL Server превращаем в понятные подсказки (ключи переводятся в i18n.json).
function sqlError(e) {
  const out = new ApiError('db.error', 500);
  out.cause = e;
  out.dbNumber = e && (e.number || e.code);
  out.dbMessage = String((e && e.message) || e);
  if (['ELOGIN', 'ELOGINFAILED', 'ESOCKET', 'ECONNCLOSED', 'ETIMEOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EINSTLOOKUP'].includes(String(e && e.code))) {
    out.key = 'db.connect';
    out.hint = `Сервер не отвечает: ${DB_FILE}. Проверьте службу SQL Server и TCP/IP (порт 1433).`;
    return out;
  }
  if (e && e.number === 4060) { out.key = 'db.connect'; out.hint = `База «${DATABASE}» не найдена — создайте её или разрешите BANKINVEST_AUTO_SCHEMA`; return out; }
  if (e && e.number === 18456) { out.key = 'db.login'; out.hint = `Пользователь «${USER || 'Windows'}» не прошёл проверку подлинности (MSSQL_USER / MSSQL_PASSWORD)`; return out; }
  // 229/262/230 — нет прав; 15151 — нет права на изменение объекта
  if (e && (e.number === 229 || e.number === 262 || e.number === 230 || e.number === 15151)) {
    out.key = 'db.permission';
    out.hint = 'Нужны права db_datareader, db_datawriter, а для изменения процедур — db_ddladmin (или владелец схемы dbo)';
    return out;
  }
  // 2714 — объект уже есть (повторный CREATE), 156/102/1038 — синтаксис/пакет
  if (e && e.number === 2714) { out.key = 'db.exists'; out.hint = 'Объект уже существует — используйте CREATE OR ALTER или DROP перед CREATE'; return out; }
  if (e && (e.number === 156 || e.number === 102)) { out.key = 'db.syntax'; out.hint = 'Синтаксическая ошибка в тексте пакета SQL'; return out; }
  return out;
}

/** Человекочитаемое описание ошибки SQL: номер, строка и текст сервера (для db:check и старта). */
function describeError(e) {
  if (!e) return '';
  const num = e.dbNumber || (e.cause && (e.cause.number || e.cause.code)) || e.number;
  const line = e.cause && e.cause.lineNumber;
  const text = e.dbMessage || (e.cause && e.cause.message) || e.message || String(e);
  const parts = [];
  if (num) parts.push(`[${num}]`);
  parts.push(text);
  if (line) parts.push(`(строка ${line})`);
  return parts.join(' ');
}

// ---------------------------------------------------------------- helpers
// mssql НЕ понимает '?': он ждёт именованные параметры (@p1), которые объявляет
// в sp_executesql. Плейсхолдеры переводим по порядку, не задевая '?' в литералах.
function namedParams(text) {
  let n = 0;
  return String(text).replace(/'(?:[^']|'')*'|\?/g, m => (m === '?' ? '@p' + (++n) : m));
}

function bind(req, params) {
  for (let i = 0; i < params.length; i++) {
    const v = params[i];
    if (v === null || v === undefined) req.input('p' + (i + 1), sql.NVarChar(400), null);
    else if (typeof v === 'number') req.input('p' + (i + 1), Number.isInteger(v) && Math.abs(v) <= 2147483647 ? sql.Int : sql.Float, v);
    else if (typeof v === 'bigint') req.input('p' + (i + 1), sql.BigInt, v);
    else if (typeof v === 'boolean') req.input('p' + (i + 1), sql.Bit, v);
    else if (v instanceof Date) req.input('p' + (i + 1), sql.DateTime, v);
    else {
      const str = String(v);
      // длину подбираем по значению: nvarchar(max) в сравнении мешает поиску по индексу
      req.input('p' + (i + 1), str.length <= 400 ? sql.NVarChar(400) : sql.NVarChar(sql.MAX), str);
    }
  }
  return req;
}

// --- результат запроса -> массив объектов {Колонка: значение}
// mssql по умолчанию (arrayRowMode = false) отдаёт recordset как МАССИВ объектов:
//   SELECT name FROM sys.tables  ->  [{ name: 'Clients' }, ...]
// Настройку arrayRowMode намеренно не включаем: она включает построчные массивы,
// а драйвер сам предупреждает, что она несовместима с useColumnNames.
// Функция терпима к обоим форматам, чтобы не зависеть от режима драйвера.
function toObjects(recordset) {
  if (!recordset) return [];
  // вариант 1: массив объектов (обычный режим mssql) — это и есть результат
  if (Array.isArray(recordset)) {
    return recordset.map(row => {
      if (row instanceof Date || typeof row !== 'object' || row === null) return { value: row };
      if (Array.isArray(row)) return toObjectsFromArrays([row])[0] || {};
      return Object.assign({}, row);
    });
  }
  // вариант 2: { rows: [...], columns: [...] } (arrayRowMode / старые сборки)
  if (Array.isArray(recordset.rows)) return toObjectsFromArrays(recordset.rows, recordset.columns);
  return [];
}

function toObjectsFromArrays(rows, columns) {
  const cols = Array.isArray(columns) && columns.length
    ? columns.map(c => (c && (c.name || c.colName)) || String(c))
    : null;
  return rows.map(row => {
    if (!cols) return Object.assign({}, row);
    const o = {};
    for (let i = 0; i < cols.length; i++) o[cols[i]] = row[i] === undefined ? null : row[i];
    return o;
  });
}

// ---------------------------------------------------------------- query API
// conn — соединение из tx(); по умолчанию берётся пул.
// Первый непустой набор строк из ответа mssql (у процедур бывает несколько).
function firstRows(raw) {
  if (!raw) return [];
  const set = raw.recordset !== undefined ? raw.recordset : raw.recordsets && raw.recordsets[0];
  const rows = toObjects(set);
  if (rows.length) return rows;
  for (const extra of (raw.recordsets || [])) {
    const more = toObjects(extra);
    if (more.length) return more;
  }
  return rows;
}

async function query(text, params = [], conn = null) {
  const p = conn || await ensurePool();
  const req = bind(p.request(), params);
  try {
    const r = await req.query(namedParams(text));
    return { rows: firstRows(r), raw: r };
  } catch (e) {
    const mapped = tradeError(e);
    if (mapped) throw new ApiError(mapped, 400);
    throw sqlError(e);
  }
}

async function all(text, ...params) {
  return (await query(text, params)).rows;
}

async function get(text, ...params) {
  const list = (await query(text, params)).rows;
  return list.length ? list[0] : null;
}

async function scalar(text, ...params) {
  const row = await get(text, ...params);
  if (!row) return null;
  const v = Object.values(row)[0];
  return v === undefined ? null : v;
}

/** DML: { changes, id } — id из OUTPUT INSERTED.Id, если запрос его вернул. */
async function run(text, ...params) {
  const { rows: list, raw } = await query(text, params);
  const row = list[0] || null;
  const id = row ? (row.Id ?? Object.values(row)[0]) : null;
  const changes = Array.isArray(raw.rowsAffected) ? raw.rowsAffected.reduce((a, b) => a + b, 0) : null;
  return { changes, id: id == null ? null : Number(id) };
}

/** Выполнить текст как есть (EXEC процедуры и т.п.). */
async function exec(text, params = [], conn = null) {
  const p = conn || await ensurePool();
  const req = bind(p.request(), params);
  try {
    return await req.query(namedParams(text));
  } catch (e) {
    const mapped = tradeError(e);
    if (mapped) throw new ApiError(mapped, 400);
    throw sqlError(e);
  }
}

// Коды ошибок из процедур: RAISERROR(N'ERR_OWN',16,1) -> e.own и т.д.
const TRADE_CODES = {
  ERR_NOLISTING: 'e.nolisting', ERR_OWN: 'e.own', ERR_QTY: 'e.qty',
  ERR_ACC: 'e.noaccount', ERR_SELLERQTY: 'e.sellerqty', ERR_FREE: 'e.free', ERR_PRICE: 'e.price',
};
function tradeError(e) {
  const msg = String((e && e.message) || '');
  for (const [code, key] of Object.entries(TRADE_CODES)) if (msg.includes(code)) return key;
  return null;
}

/** Транзакция на отдельном соединении: fn(conn) получает его для всех запросов внутри. */
async function tx(fn) {
  const p = await ensurePool();
  const conn = await p.connect().catch(e => { throw sqlError(e); });
  const t = new sql.Transaction(conn);
  try {
    await t.begin();
    const wrapped = {
      all: (text, ...params) => allOn(conn, text, params),
      get: (text, ...params) => getOn(conn, text, params),
      scalar: (text, ...params) => scalarOn(conn, text, params),
      run: (text, ...params) => runOn(conn, text, params),
      exec: (text, params = []) => exec(text, params, conn),
    };
    const r = await fn(wrapped);
    await t.commit();
    return r;
  } catch (e) {
    try { await t.rollback(); } catch { /* уже откатана */ }
    throw e instanceof ApiError ? e : sqlError(e);
  } finally {
    try { conn.release(); } catch { /* пул сам закроет */ }
  }
}

async function allOn(conn, text, params) { return (await query(text, params, conn)).rows; }
async function getOn(conn, text, params) { const l = (await query(text, params, conn)).rows; return l.length ? l[0] : null; }
async function scalarOn(conn, text, params) { const r = await getOn(conn, text, params); if (!r) return null; const v = Object.values(r)[0]; return v === undefined ? null : v; }
async function runOn(conn, text, params) {
  const { rows: list, raw } = await query(text, params, conn);
  const row = list[0] || null;
  const id = row ? (row.Id ?? Object.values(row)[0]) : null;
  const changes = Array.isArray(raw.rowsAffected) ? raw.rowsAffected.reduce((a, b) => a + b, 0) : null;
  return { changes, id: id == null ? null : Number(id) };
}

function hash(password) {
  return crypto.createHash('sha256').update(String(password), 'utf8').digest('hex').toUpperCase();
}

/** Текущее время SQL Server в том же формате, что отдавалось клиентам раньше: "2026-11-23 18:09:18". */
async function now() {
  const d = await scalar('SELECT GETDATE()');
  return toIso(d);
}

/** Привести дату/время из SQL Server к строке "ГГГГ-ММ-ДД чч:мм:сс".
    Время уже в нужном часовом поясе (mssql.options.useUTC = false), поэтому
    локальные геттеры дают ровно то, что записано в базе. */
function toIso(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    const p = n => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ` +
           `${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  return String(v);
}

// ---------------------------------------------------------------- errors with i18n keys
class ApiError extends Error {
  constructor(key, status = 400, params) {
    super(key);
    this.key = key;
    this.status = status;
    this.params = params;
  }
}
const err = (key, status = 400, params) => new ApiError(key, status, params);

// ---------------------------------------------------------------- schema / seed
function readSqlFile(name) {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'db', name), 'utf8');
}

/** Разбить скрипт на пакеты по GO (как это делает sqlcmd). */
function batches(script) {
  return script.split(/^\s*GO\s*$/im).map(s => s.trim()).filter(Boolean);
}

async function runScript(script, label) {
  const list = batches(script);
  for (const [i, batch] of list.entries()) {
    try {
      await exec(batch);
    } catch (e) {
      const hint = e instanceof ApiError
        ? `${e.key}${e.hint ? ' — ' + e.hint : ''}${e.dbMessage ? ' | ' + describeError(e) : ''}`
        : String(e && e.message);
      const err2 = new Error(`db/${label}.sql, пакет ${i + 1}: ${hint}`);
      err2.dbNumber = e && e.dbNumber;
      err2.dbMessage = e && describeError(e);
      throw err2;
    }
  }
  return list.length;
}

async function init() {
  await ensurePool();
  let fresh = false;
  if (!(await scalar("SELECT OBJECT_ID('Clients','U')"))) {
    if (!AUTO_SCHEMA) {
      throw new ApiError('db.noschema', 500);
    }
    await runScript(readSqlFile('schema.sql'), 'schema');
  }
  const empty = Number(await scalar('SELECT COUNT(*) FROM Clients')) === 0;
  if (empty) {
    if (!AUTO_SEED) throw new ApiError('db.empty', 500);
    await runScript(readSqlFile('seed.sql'), 'seed');
    fresh = true;
  }
  return { dbFile: DB_FILE, fresh };
}

/** Аналог EXEC usp_UpdatePrices: число добавленных точек истории цен. */
async function updatePrices() {
  try {
    const r = await exec('EXEC usp_UpdatePrices');
    const set = firstRows(r);
    const first = set.length ? Object.values(set[0])[0] : 0;
    return Number(first) || 0;
  } catch {
    return 0;
  }
}

async function audit(login, action, details = '') {
  try {
    await run(`INSERT INTO AuditLog(UserLogin, Action, Details) OUTPUT INSERTED.Id AS Id VALUES (?, ?, ?)`,
      login || '', action, String(details || '').slice(0, 500));
  } catch { /* журнал не должен ломать операцию */ }
}

module.exports = {
  sql, ensurePool, closePool, init, updatePrices, audit,
  query, all, get, scalar, run, exec, tx,
  hash, now, toIso, err, ApiError, describeError,
  toObjects, firstRows, namedParams,   // экспортируются для тестов
  DB_FILE, DATABASE, SERVER, CONFIG,
};
