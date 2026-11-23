// Database layer for BankInvest server.
// Uses the built-in node:sqlite (Node >= 22.5, no npm dependencies at all).
// The schema mirrors the SQL Server database used by the desktop client
// (Clients, DepoAccounts, Securities, PriceHistory, Holdings, Listings,
//  Transactions, Users, InvestmentProjects, AuditLog).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.BANKINVEST_DATA || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = process.env.BANKINVEST_DB || path.join(DATA_DIR, 'bankinvest.db');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// ---------- helpers ----------
function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}
function get(sql, ...params) {
  return db.prepare(sql).get(...params) ?? null;
}
function scalar(sql, ...params) {
  const row = get(sql, ...params);
  if (!row) return null;
  const v = Object.values(row)[0];
  return v === undefined ? null : v;
}
function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  }
}
function hash(password) {
  return crypto.createHash('sha256').update(String(password), 'utf8').digest('hex').toUpperCase();
}
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ---------- errors with i18n keys ----------
// Messages are translation keys from i18n.json, so both the web client and the
// desktop client can show the text in the language the user picked.
class ApiError extends Error {
  constructor(key, status = 400, params) {
    super(key);
    this.key = key;
    this.status = status;
    this.params = params;
  }
}
const err = (key, status = 400, params) => new ApiError(key, status, params);

// ---------- schema ----------
function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS Clients (
    Id        INTEGER PRIMARY KEY AUTOINCREMENT,
    Name      TEXT NOT NULL,
    UNP       TEXT NOT NULL UNIQUE,
    Address   TEXT NOT NULL DEFAULT '',
    Contacts  TEXT NOT NULL DEFAULT '',
    Kind      TEXT NOT NULL DEFAULT 'Company' CHECK (Kind IN ('Company','Personal')),
    Status    TEXT NOT NULL DEFAULT 'Активен',
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS Issuers (
    Id   INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS Securities (
    Id         INTEGER PRIMARY KEY AUTOINCREMENT,
    IssuerId   INTEGER NOT NULL REFERENCES Issuers(Id),
    Symbol     TEXT NOT NULL UNIQUE,
    Name       TEXT NOT NULL,
    Kind       TEXT NOT NULL DEFAULT 'Облигация',
    Segment    TEXT NOT NULL DEFAULT 'Corp Bonds',
    Nominal    REAL NOT NULL DEFAULT 100,
    Volume     INTEGER NOT NULL DEFAULT 0,
    Rate       REAL NOT NULL DEFAULT 0,
    ExpenseRatio REAL NOT NULL DEFAULT 0,
    Price      REAL NOT NULL DEFAULT 100,
    PrevPrice  REAL NOT NULL DEFAULT 100,
    Status     TEXT NOT NULL DEFAULT 'Размещён'
  );
  CREATE TABLE IF NOT EXISTS DepoAccounts (
    Id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ClientId INTEGER NOT NULL REFERENCES Clients(Id) ON DELETE CASCADE,
    Number   TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS Holdings (
    Id            INTEGER PRIMARY KEY AUTOINCREMENT,
    DepoAccountId INTEGER NOT NULL REFERENCES DepoAccounts(Id) ON DELETE CASCADE,
    SecurityId    INTEGER NOT NULL REFERENCES Securities(Id),
    Quantity      INTEGER NOT NULL DEFAULT 0 CHECK (Quantity >= 0),
    TargetPct     REAL NULL CHECK (TargetPct IS NULL OR (TargetPct >= 0 AND TargetPct <= 100)),
    UNIQUE (DepoAccountId, SecurityId)
  );
  CREATE TABLE IF NOT EXISTS Listings (
    Id             INTEGER PRIMARY KEY AUTOINCREMENT,
    SellerClientId INTEGER NOT NULL REFERENCES Clients(Id) ON DELETE CASCADE,
    SecurityId     INTEGER NOT NULL REFERENCES Securities(Id),
    Quantity       INTEGER NOT NULL CHECK (Quantity > 0),
    Price          REAL NOT NULL CHECK (Price > 0),
    Status         TEXT NOT NULL DEFAULT 'Активно',
    CreatedAt      TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS Transactions (
    Id            INTEGER PRIMARY KEY AUTOINCREMENT,
    DepoAccountId INTEGER NOT NULL REFERENCES DepoAccounts(Id) ON DELETE CASCADE,
    SecurityId    INTEGER NOT NULL REFERENCES Securities(Id),
    Type          TEXT NOT NULL CHECK (Type IN ('Buy','Sell')),
    Quantity      INTEGER NOT NULL,
    Price         REAL NOT NULL,
    Commission    REAL NOT NULL DEFAULT 0,
    Status        TEXT NOT NULL DEFAULT 'Исполнена',
    Date          TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS Users (
    Id           INTEGER PRIMARY KEY AUTOINCREMENT,
    CompanyId    TEXT NOT NULL,
    Login        TEXT NOT NULL,
    PasswordHash TEXT NOT NULL,
    Role         TEXT NOT NULL DEFAULT 'Client' CHECK (Role IN ('Client','Employee','Admin')),
    ClientId     INTEGER NULL REFERENCES Clients(Id) ON DELETE SET NULL,
    IsActive     INTEGER NOT NULL DEFAULT 1,
    CreatedAt    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS UX_Users_Company_Login ON Users(CompanyId, Login);
  CREATE TABLE IF NOT EXISTS PriceHistory (
    Id         INTEGER PRIMARY KEY AUTOINCREMENT,
    SecurityId INTEGER NOT NULL REFERENCES Securities(Id) ON DELETE CASCADE,
    At         TEXT NOT NULL,
    Price      REAL NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS UX_PriceHistory ON PriceHistory(SecurityId, At);
  CREATE TABLE IF NOT EXISTS InvestmentProjects (
    Id        INTEGER PRIMARY KEY AUTOINCREMENT,
    Name      TEXT NOT NULL,
    Rate      REAL NOT NULL DEFAULT 10,
    CashFlows TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS AuditLog (
    Id         INTEGER PRIMARY KEY AUTOINCREMENT,
    At         TEXT NOT NULL DEFAULT (datetime('now')),
    UserLogin  TEXT NOT NULL DEFAULT '',
    Action     TEXT NOT NULL,
    Details    TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS Sessions (
    Token     TEXT PRIMARY KEY,
    UserId    INTEGER NOT NULL REFERENCES Users(Id) ON DELETE CASCADE,
    Login     TEXT NOT NULL,
    Role      TEXT NOT NULL,
    ClientId  INTEGER NULL,
    Client    TEXT NOT NULL DEFAULT '',
    Lang      INTEGER NOT NULL DEFAULT 0,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    SeenAt    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS IX_Listings_Seller ON Listings(SellerClientId, Status);
  CREATE INDEX IF NOT EXISTS IX_Transactions_Depo ON Transactions(DepoAccountId);
  `);
}

// ---------- demo data ----------
const SECURITIES = [
  // symbol, name, kind, segment, nominal, volume, rate, expenseRatio, price, issuer
  ['ASB-GB-2027', 'Гособлигации Беларуси 2027', 'Облигация', 'Gov Bonds', 100, 500000, 9.5, 0.0, 101.20, 'Министерство финансов РБ'],
  ['ASB-GB-2030', 'Гособлигации Беларуси 2030', 'Облигация', 'Gov Bonds', 100, 300000, 10.2, 0.0, 98.40, 'Министерство финансов РБ'],
  ['ASB-CB-ASB27', 'Облигации Беларусбанка 2027', 'Облигация', 'Corp Bonds', 100, 200000, 12.0, 0.1, 102.60, 'ОАО «АСБ Беларусбанк»'],
  ['ASB-CB-BPS28', 'Облигации Белпромстройбанка 2028', 'Облигация', 'Corp Bonds', 100, 150000, 13.4, 0.2, 99.80, 'ОАО «Белпромстройбанк»'],
  ['ASB-CB-MTS29', 'Облигации МТС 2029', 'Облигация', 'Corp Bonds', 100, 120000, 14.1, 0.2, 100.55, 'ООО «МТС»'],
  ['ASB-EQ-BNB', 'Акции Беларусбанка', 'Акция', 'Equities', 10, 800000, 0, 0.3, 12.84, 'ОАО «АСБ Беларусбанк»'],
  ['ASB-EQ-MTS', 'Акции МТС', 'Акция', 'Equities', 10, 600000, 0, 0.3, 8.15, 'ООО «МТС»'],
  ['ASB-EQ-BMK', 'Акции Белметаллург', 'Акция', 'Equities', 10, 400000, 0, 0.4, 24.30, 'ОАО «Белметаллург»'],
  ['ASB-EQ-AKB', 'Акции Агрокомбината «Днепр»', 'Акция', 'Equities', 10, 350000, 0, 0.4, 5.62, 'ОАО «Агрокомбинат Днепр»'],
  ['ASB-EQ-FNB', 'Акции Финбанка', 'Акция', 'Equities', 10, 250000, 0, 0.35, 17.05, 'ОАО «Финбанк»'],
  ['ASB-CB-GRB27', 'Облигации Гроднооблгаза 2027', 'Облигация', 'Corp Bonds', 100, 90000, 11.6, 0.15, 100.10, 'ОАО «Гроднооблгаз»'],
  ['ASB-EQ-BKZ', 'Акции Белкалий', 'Акция', 'Equities', 10, 180000, 0, 0.4, 31.90, 'ОАО «Белкалий»'],
];

const CLIENTS = [
  // name, unp, address, contacts, kind
  ['ООО «Вектор Плюс»', '100234567', 'г. Минск, ул. Тимирязева, 65Б', '+375 17 234-56-78', 'Company'],
  ['ОАО «Стройинвест»', '190987654', 'г. Минск, пр-т Победителей, 23', '+375 17 345-67-89', 'Company'],
  ['ООО «БелАгроТрейд»', '191345678', 'г. Гомель, ул. Советская, 14', '+375 232 56-78-90', 'Company'],
  ['Иванов Иван Иванович', '900012345', 'г. Минск, ул. Некрасова, 8', '+375 29 123-45-67', 'Personal'],
  ['Ковалёва Мария Сергеевна', '900054321', 'г. Гродно, ул. Замковая, 3', '+375 29 765-43-21', 'Personal'],
];

const STARTER_HOLDINGS = {
  'ООО «Вектор Плюс»': [['ASB-GB-2027', 15000], ['ASB-CB-ASB27', 8000], ['ASB-EQ-BNB', 25000], ['ASB-EQ-MTS', 12000]],
  'ОАО «Стройинвест»': [['ASB-GB-2030', 20000], ['ASB-CB-BPS28', 5000], ['ASB-EQ-BMK', 9000]],
  'ООО «БелАгроТрейд»': [['ASB-CB-MTS29', 6000], ['ASB-EQ-AKB', 18000], ['ASB-CB-GRB27', 4000]],
  'Иванов Иван Иванович': [['ASB-EQ-BNB', 4200], ['ASB-EQ-FNB', 700], ['ASB-GB-2027', 1200]],
  'Ковалёва Мария Сергеевна': [['ASB-EQ-BKZ', 300], ['ASB-EQ-AKB', 2500], ['ASB-CB-ASB27', 900]],
};

const DEMO_ACCOUNTS = [
  // login, password, role, clientName (null for pure staff)
  ['admin', 'admin123', 'Admin', null],
  ['employee', 'employee123', 'Employee', null],
  ['client', 'client123', 'Client', 'ООО «Вектор Плюс»'],
];

function seed() {
  if (scalar('SELECT COUNT(*) FROM Securities') > 0) return false;
  tx(() => {
    // issuers
    const issuerNames = [...new Set(SECURITIES.map(s => s[9]))];
    for (const n of issuerNames) run('INSERT INTO Issuers(Name) VALUES (?)', n);
    const issuerId = Object.fromEntries(all('SELECT Id, Name FROM Issuers').map(r => [r.Name, r.Id]));

    for (const [sym, name, kind, seg, nom, vol, rate, exp, price, issuer] of SECURITIES) {
      run(`INSERT INTO Securities(IssuerId,Symbol,Name,Kind,Segment,Nominal,Volume,Rate,ExpenseRatio,Price,PrevPrice,Status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,'Размещён')`,
        issuerId[issuer], sym, name, kind, seg, nom, vol, rate, exp, price, price);
    }

    for (const [name, unp, addr, contacts, kind] of CLIENTS) {
      const info = run(`INSERT INTO Clients(Name,UNP,Address,Contacts,Kind,Status) VALUES (?,?,?,?,?,'Активен')`, name, unp, addr, contacts, kind);
      const clientId = Number(info.lastInsertRowid);
      run(`INSERT INTO DepoAccounts(ClientId,Number) VALUES (?,?)`, clientId, 'DEPO-' + unp);
      for (const [sym, qty] of STARTER_HOLDINGS[name] || []) {
        const secId = scalar('SELECT Id FROM Securities WHERE Symbol=?', sym);
        run('INSERT INTO Holdings(DepoAccountId,SecurityId,Quantity) VALUES ((SELECT Id FROM DepoAccounts WHERE ClientId=?),?,?)', clientId, secId, qty);
      }
      // портфель клиента: целевые доли (картина «докупить/продать» на главной)
      if (kind === 'Personal') {
        run(`UPDATE Holdings SET TargetPct = 40 WHERE DepoAccountId=(SELECT Id FROM DepoAccounts WHERE ClientId=?) AND Id=(SELECT MIN(Id) FROM Holdings WHERE DepoAccountId=(SELECT Id FROM DepoAccounts WHERE ClientId=?))`, clientId, clientId);
      }
    }

    // demo users: staff + one client per company
    const clientByName = Object.fromEntries(all('SELECT Id, Name FROM Clients').map(r => [r.Name, r.Id]));
    for (const [login, pass, role, clientName] of DEMO_ACCOUNTS) {
      const clientId = clientName ? clientByName[clientName] : null;
      run(`INSERT INTO Users(CompanyId,Login,PasswordHash,Role,ClientId) VALUES (?,?,?,?,?)`,
        clientId ? 'ASB' : 'ASB', login, hash(pass), role, clientId);
    }
    // по логину на каждого клиента (Company ID = УНП, на случай проверки)
    for (const [name, unp] of CLIENTS) {
      const cid = clientByName[name];
      const login = unp;
      run(`INSERT OR IGNORE INTO Users(CompanyId,Login,PasswordHash,Role,ClientId) VALUES (?,?,?,?,?)`,
        unp, login, hash('client123'), 'Client', cid);
    }

    run(`INSERT INTO InvestmentProjects(Name,Rate,CashFlows) VALUES (?,?,?)`, 'Модернизация склада', 12, '-150000;45000;60000;70000;50000');
    run(`INSERT INTO InvestmentProjects(Name,Rate,CashFlows) VALUES (?,?,?)`, 'Солнечная электростанция', 10, '-300000;80000;90000;95000;100000;60000');
    run(`INSERT INTO InvestmentProjects(Name,Rate,CashFlows) VALUES (?,?,?)`, 'Логистический хаб «Запад»', 15, '-500000;120000;180000;220000;240000;160000');

    // предложения на рынке (от клиентов)
    const listings = [
      ['ООО «Вектор Плюс»', 'ASB-EQ-BNB', 3000, 12.40],
      ['ОАО «Стройинвест»', 'ASB-EQ-BMK', 1500, 24.90],
      ['Иванов Иван Иванович', 'ASB-EQ-FNB', 200, 16.60],
      ['ООО «БелАгроТрейд»', 'ASB-EQ-AKB', 5000, 5.40],
      ['Ковалёва Мария Сергеевна', 'ASB-EQ-BKZ', 100, 32.80],
      ['ООО «Вектор Плюс»', 'ASB-CB-ASB27', 2000, 101.90],
      ['ОАО «Стройинвест»', 'ASB-GB-2030', 4000, 98.10],
      ['Иванов Иван Иванович', 'ASB-EQ-BNB', 800, 13.10],
    ];
    for (const [client, sym, qty, price] of listings) {
      run(`INSERT INTO Listings(SellerClientId,SecurityId,Quantity,Price,Status) VALUES (?,?,?,?,'Активно')`,
        clientByName[client], scalar('SELECT Id FROM Securities WHERE Symbol=?', sym), qty, price);
    }
  });
  return true;
}

// ---------- цена: история и пересчёт Price/PrevPrice ----------
// Полный аналог usp_UpdatePrices из SQL Server.
function updatePrices() {
  const hourMs = 3600 * 1000;
  const startOfHour = d => new Date(Math.floor(d.getTime() / hourMs) * hourMs);
  const iso = d => d.toISOString().replace('T', ' ').slice(0, 19);

  return tx(() => {
    const nowHour = startOfHour(new Date());
    const secs = all(`SELECT Id, Nominal, Segment, Price FROM Securities WHERE Status='Размещён' AND Price > 0`);
    let added = 0;
    const maxBack = 24 * 30; // не более месяца назад за один вызов, но и весь пропуск тоже

    for (const s of secs) {
      let last = get('SELECT At, Price FROM PriceHistory WHERE SecurityId=? ORDER BY At DESC LIMIT 1', s.Id);
      if (!last) {
        run('INSERT INTO PriceHistory(SecurityId,At,Price) VALUES (?,?,?)', s.Id, iso(nowHour), s.Price);
        added++;
        continue;
      }
      let t = new Date(last.At.replace(' ', 'T') + 'Z');
      let prev = last.Price;
      const everyMs = s.Segment === 'Gov Bonds' || s.Segment === 'Corp Bonds' ? 24 * hourMs : hourMs; // по истории 1 точка в сутки для бумаг с низкой волатильностью? нет: каждый час
      let guard = 0;
      while (true) {
        t = new Date(t.getTime() + hourMs);
        if (t > nowHour) break;
        if (++guard > 24 * 60) break;
        const step = s.Segment === 'Gov Bonds' ? 0.0005 : s.Segment === 'Corp Bonds' ? 0.0010 : 0.0035;
        const f = 1 + step * ((Math.random() * 2001 - 1000) / 1000.0);
        const lo = (s.Segment === 'Gov Bonds' || s.Segment === 'Corp Bonds') ? 0.85 : 0.35;
        const hi = (s.Segment === 'Gov Bonds' || s.Segment === 'Corp Bonds') ? 1.15 : 3.00;
        let p = prev * f;
        if (p < s.Nominal * lo) p = s.Nominal * lo;
        if (p > s.Nominal * hi) p = s.Nominal * hi;
        p = Math.round(p * 100) / 100;
        run('INSERT OR IGNORE INTO PriceHistory(SecurityId,At,Price) VALUES (?,?,?)', s.Id, iso(t), p);
        prev = p;
        added++;
      }
    }

    // Price = последняя точка, PrevPrice = последняя точка не позже «сейчас - 24ч»
    const nowIso = iso(new Date());
    const before24 = iso(new Date(Date.now() - 24 * hourMs));
    for (const s of secs) {
      const lastP = scalar('SELECT Price FROM PriceHistory WHERE SecurityId=? ORDER BY At DESC LIMIT 1', s.Id) ?? s.Price;
      const prevP = scalar('SELECT Price FROM PriceHistory WHERE SecurityId=? AND At <= ? ORDER BY At DESC LIMIT 1', s.Id, before24) ?? s.Price;
      run('UPDATE Securities SET Price=?, PrevPrice=? WHERE Id=?', lastP, prevP, s.Id);
    }
    return added;
  });
}

function backfillHistory(days = 30, years = 5) {
  // Первый запуск: наполняем историю цен, чтобы график и «изменение за 24 ч» были осмысленными.
  // Последние `days` дней — по часам (вкладка «часы»), более ранний период — по дням
  // (вкладки «дни», «недели», «месяцы», «годы»).
  const hourMs = 3600 * 1000;
  const dayMs = 24 * hourMs;
  const iso = d => d.toISOString().replace('T', ' ').slice(0, 19);
  const nowHour = new Date(Math.floor(Date.now() / hourMs) * hourMs);
  tx(() => {
    for (const s of all(`SELECT Id, Nominal, Segment, Price FROM Securities WHERE Status='Размещён'`)) {
      if (scalar('SELECT COUNT(*) FROM PriceHistory WHERE SecurityId=?', s.Id) > 0) continue;
      const step = s.Segment === 'Gov Bonds' ? 0.0004 : s.Segment === 'Corp Bonds' ? 0.0009 : 0.0045;
      const lo = (s.Segment === 'Gov Bonds' || s.Segment === 'Corp Bonds') ? 0.85 : 0.35;
      const hi = (s.Segment === 'Gov Bonds' || s.Segment === 'Corp Bonds') ? 1.15 : 3.00;
      // сначала строим ряд «назад от текущей цены», затем пишем в хронологическом порядке
      const times = [];
      for (let d = years * 365; d > days; d--) times.push([new Date(nowHour.getTime() - d * dayMs), step * 1.6]);
      for (let h = days * 24; h >= 0; h--) times.push([new Date(nowHour.getTime() - h * hourMs), step]);
      let price = s.Price;
      const pts = new Array(times.length);
      for (let i = times.length - 1; i >= 0; i--) {
        pts[i] = [iso(times[i][0]), Math.round(price * 100) / 100];
        price = price * (1 + times[i][1] * ((Math.random() * 2001 - 1000) / 1000.0));
        price = Math.min(Math.max(price, s.Nominal * lo), s.Nominal * hi);
      }
      for (const [at, p] of pts) run('INSERT OR IGNORE INTO PriceHistory(SecurityId,At,Price) VALUES (?,?,?)', s.Id, at, p);
    }
  });
}

function audit(login, action, details = '') {
  try { run('INSERT INTO AuditLog(UserLogin,Action,Details) VALUES (?,?,?)', login || '', action, details); } catch { /* журнал не должен ломать операцию */ }
}

function init() {
  migrate();
  const fresh = seed();
  if (fresh) backfillHistory(30, 5);
  updatePrices();
  return { dbFile: DB_FILE, fresh };
}

module.exports = {
  db, all, get, scalar, run, tx, hash, now, err, ApiError,
  init, seed, updatePrices, backfillHistory, audit, DB_FILE, DATA_DIR,
};
