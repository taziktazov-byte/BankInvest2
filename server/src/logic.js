// Business logic: everything the desktop client used to do directly against
// SQL Server now lives here, so the web client and the desktop client work
// on the very same data with the very same rules.
'use strict';

const crypto = require('node:crypto');
const D = require('./db');
const { all, get, scalar, run, tx, hash, err } = D;

const COMMISSION_RATE = 0.005;                 // 0,5 % с каждой стороны сделки
const round2 = v => Math.round(Number(v) * 100) / 100;
const isStaff = s => s && s.Role !== 'Client';
const isAdmin = s => s && s.Role === 'Admin';

// ---------------------------------------------------------------- auth
function sessionPublic(s) {
  return {
    token: s.Token, login: s.Login, role: s.Role, clientId: s.ClientId,
    clientName: s.Client, lang: s.Lang,
    isStaff: s.Role !== 'Client', isAdmin: s.Role === 'Admin',
  };
}

function readToken(token) {
  if (!token) return null;
  const s = get('SELECT * FROM Sessions WHERE Token=?', token);
  if (!s) return null;
  run('UPDATE Sessions SET SeenAt=datetime(\'now\') WHERE Token=?', token);
  return s;
}

function login(id, password, mode) {
  id = String(id || '').trim();
  password = String(password || '');
  if (!id || !password) throw err('reg.e.empty');
  const rows = mode === 'company'
    ? all(`SELECT Id,Login,Role,ClientId,PasswordHash,CompanyId FROM Users WHERE CompanyId=? AND Login=? AND Role='Client' AND IsActive=1`, id, id)
    : all(`SELECT Id,Login,Role,ClientId,PasswordHash,CompanyId FROM Users WHERE Login=? AND CompanyId IN ('ASB','PERSONAL') AND IsActive=1`, id);
  const user = rows.length === 1 ? rows[0] : null;
  if (!user || user.PasswordHash !== hash(password)) {
    D.audit(id, 'Неудачная попытка входа', (mode === 'company' ? 'Company=' : 'User=') + id);
    throw err('login.fail', 401);
  }
  const client = user.ClientId ? scalar('SELECT Name FROM Clients WHERE Id=?', user.ClientId) : '';
  const token = crypto.randomBytes(24).toString('hex');
  run(`INSERT INTO Sessions(Token,UserId,Login,Role,ClientId,Client) VALUES (?,?,?,?,?,?)`,
    token, user.Id, user.Login, user.Role, user.ClientId, client || '');
  D.audit(user.Login, 'Вход в систему', 'API');
  return sessionPublic(readToken(token));
}

function logout(session) {
  if (!session) return;
  run('DELETE FROM Sessions WHERE Token=?', session.Token);
  D.audit(session.Login, 'Выход');
}

function setLang(session, lang) {
  run('UPDATE Sessions SET Lang=? WHERE Token=?', Number(lang) || 0, session.Token);
}

function register(body) {
  const company = body.kind === 'company';
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const password2 = String(body.password2 ?? body.password ?? '');
  const address = String(body.address || '').trim();
  const contacts = String(body.contacts || '').trim();
  if (!name || !password) throw err('reg.e.empty');
  if (password !== password2 || password.length < 6) throw err('reg.e.pass');
  const h = hash(password);

  if (company) {
    const unp = String(body.unp || '').trim();
    if (!/^\d{9}$/.test(unp)) throw err('reg.e.unp');
    if (scalar('SELECT 1 FROM Clients WHERE UNP=?', unp) || scalar("SELECT 1 FROM Users WHERE CompanyId=?", unp)) throw err('reg.e.exists');
    const clientId = tx(() => {
      const c = run(`INSERT INTO Clients(Name,UNP,Address,Contacts,Kind) VALUES (?,?,?,?,'Company')`, name, unp, address, contacts);
      const id = Number(c.lastInsertRowid);
      run(`INSERT INTO DepoAccounts(ClientId,Number) VALUES (?,?)`, id, 'DEPO-' + unp);
      run(`INSERT INTO Users(CompanyId,Login,PasswordHash,Role,ClientId) VALUES (?,?,?,'Client',?)`, unp, unp, h, id);
      return id;
    });
    D.audit(unp, 'Регистрация', 'Company');
    return { login: unp, company: true, clientId };
  }

  const loginId = String(body.login || '').trim();
  if (!loginId) throw err('reg.e.empty');
  if (loginId.length < 3) throw err('reg.e.login');
  if (scalar("SELECT 1 FROM Users WHERE Login=? AND CompanyId IN ('ASB','PERSONAL')", loginId)) throw err('reg.e.exists');
  let unp;
  do { unp = '9' + String(crypto.randomInt(0, 100000000)).padStart(8, '0'); }
  while (scalar('SELECT 1 FROM Clients WHERE UNP=?', unp));
  const clientId = tx(() => {
    const c = run(`INSERT INTO Clients(Name,UNP,Address,Contacts,Kind) VALUES (?,?,?,?,'Personal')`, name, unp, address, contacts);
    const id = Number(c.lastInsertRowid);
    run(`INSERT INTO DepoAccounts(ClientId,Number) VALUES (?,?)`, id, 'DEPO-' + unp);
    run(`INSERT INTO Users(CompanyId,Login,PasswordHash,Role,ClientId) VALUES ('PERSONAL',?,?,'Client',?)`, loginId, h, id);
    return id;
  });
  D.audit(loginId, 'Регистрация', 'Personal');
  return { login: loginId, company: false, clientId };
}

// ---------------------------------------------------------------- home
function home(s) {
  const c = isStaff(s) ? null : s.ClientId;
  const M = v => round2(v ?? 0);
  const pv = scalar(`SELECT IFNULL(SUM(h.Quantity*sec.Price),0) FROM Holdings h
                     JOIN DepoAccounts d ON d.Id=h.DepoAccountId JOIN Securities sec ON sec.Id=h.SecurityId
                     WHERE (? IS NULL OR d.ClientId=?)`, c, c);
  const offers = scalar(`SELECT COUNT(*) FROM Listings WHERE Status='Активно' AND (? IS NULL OR SellerClientId=?)`, c, c);
  const kpis = [];
  if (isStaff(s)) {
    kpis.push({ key: 'k.clients', value: String(scalar('SELECT COUNT(*) FROM Clients')), kind: 'count', accent: 'blue' });
    kpis.push({ key: 'k.aum', value: M(pv).toFixed(2) + ' BYN', kind: 'money', accent: 'green' });
    kpis.push({ key: 'k.offers', value: String(offers), kind: 'count', accent: 'orange' });
    kpis.push({ key: 'k.income', value: M(scalar("SELECT IFNULL(SUM(Commission),0) FROM Transactions WHERE Status='Исполнена'")).toFixed(2) + ' BYN', kind: 'money', accent: 'purple' });
  } else {
    const secs = scalar(`SELECT COUNT(*) FROM Holdings h JOIN DepoAccounts d ON d.Id=h.DepoAccountId WHERE d.ClientId=? AND h.Quantity>0`, c);
    const ops = scalar(`SELECT COUNT(*) FROM Transactions t JOIN DepoAccounts d ON d.Id=t.DepoAccountId WHERE d.ClientId=?`, c);
    kpis.push({ key: 'k.pv', value: M(pv).toFixed(2) + ' BYN', kind: 'money', accent: 'green' });
    kpis.push({ key: 'k.secs', value: String(secs), kind: 'count', accent: 'blue' });
    kpis.push({ key: 'k.myops', value: String(ops), kind: 'count', accent: 'purple' });
    kpis.push({ key: 'k.myoffers', value: String(offers), kind: 'count', accent: 'orange' });
  }
  const cols = `Symbol, Name, Price, ROUND((Price-PrevPrice)*100.0/NULLIF(PrevPrice,0),2) AS Change`;
  const up = all(`SELECT ${cols} FROM Securities WHERE Status='Размещён' AND Price>PrevPrice ORDER BY Change DESC LIMIT 8`);
  const down = all(`SELECT ${cols} FROM Securities WHERE Status='Размещён' AND Price<PrevPrice ORDER BY Change ASC LIMIT 8`);
  return { kpis, up, down };
}

// ---------------------------------------------------------------- clients
function clients() {
  return all(`SELECT c.Id, c.Name, CASE WHEN c.Kind='Personal' THEN NULL ELSE c.UNP END AS UNP,
                     c.Address, c.Contacts, c.Status, c.Kind,
                     (SELECT Number FROM DepoAccounts d WHERE d.ClientId=c.Id ORDER BY d.Id LIMIT 1) AS Depo
              FROM Clients c ORDER BY c.Name`);
}

function clientsLite() {
  return all('SELECT Id, Name FROM Clients ORDER BY Name');
}

function addClient(body) {
  const name = String(body.name || '').trim();
  const unp = String(body.unp || '').trim();
  const addr = String(body.address || '').trim();
  const contacts = String(body.contacts || '').trim();
  const password = String(body.password || '');
  if (!/^\d{9}$/.test(unp)) throw err('reg.e.unp');
  if (!name || password.length < 6) throw err('reg.e.empty');
  if (scalar('SELECT 1 FROM Clients WHERE UNP=?', unp)) throw err('reg.e.exists');
  return tx(() => {
    const c = run(`INSERT INTO Clients(Name,UNP,Address,Contacts,Kind) VALUES (?,?,?,?,'Company')`, name, unp, addr, contacts);
    const id = Number(c.lastInsertRowid);
    run('INSERT INTO DepoAccounts(ClientId,Number) VALUES (?,?)', id, 'DEPO-' + unp);
    run(`INSERT INTO Users(CompanyId,Login,PasswordHash,Role,ClientId) VALUES (?,?,?,'Client',?)`, unp, unp, hash(password), id);
    return { id };
  });
}

function deleteClient(s, id) {
  if (!isAdmin(s)) throw err('e.self', 403);
  tx(() => {
    const deps = all('SELECT Id FROM DepoAccounts WHERE ClientId=?', id).map(r => r.Id);
    for (const d of deps) run('DELETE FROM Transactions WHERE DepoAccountId=?', d);
    run('DELETE FROM Listings WHERE SellerClientId=?', id);
    run('DELETE FROM Users WHERE ClientId=?', id);
    run('DELETE FROM DepoAccounts WHERE ClientId=?', id);   // Holdings каскадом
    run('DELETE FROM Clients WHERE Id=?', id);
  });
  D.audit(s.Login, 'Удаление клиента', 'Id=' + id);
  return { ok: true };
}

function profile(s) {
  const r = get(`SELECT Name, CASE WHEN Kind='Personal' THEN NULL ELSE UNP END AS UNP, Address, Contacts, Status, Kind
                 FROM Clients WHERE Id=?`, s.ClientId);
  if (!r) throw err('nodata', 404);
  return r;
}

// ---------------------------------------------------------------- portfolio
function portfolio(s, clientId) {
  const c = isStaff(s) ? (clientId ?? null) : s.ClientId;
  if (c == null) throw err('e.noaccount');
  const rows = all(`SELECT h.Id, sec.Symbol, sec.Name, sec.Segment, h.Quantity AS Qty,
                     IFNULL((SELECT SUM(l.Quantity) FROM Listings l WHERE l.SellerClientId=d.ClientId AND l.SecurityId=h.SecurityId AND l.Status='Активно'),0) AS ForSale,
                     sec.Price AS Price, sec.ExpenseRatio, round(h.Quantity*sec.Price,2) AS CurrentValue, h.TargetPct
                     FROM Holdings h JOIN DepoAccounts d ON d.Id=h.DepoAccountId JOIN Securities sec ON sec.Id=h.SecurityId
                     WHERE d.ClientId=? ORDER BY sec.Symbol`, c);
  return recalc(rows);
}

function recalc(rows) {
  const total = rows.reduce((a, r) => a + Number(r.CurrentValue || 0), 0);
  for (const r of rows) {
    const tp = r.TargetPct == null ? 0 : Number(r.TargetPct);
    r.CurrentPct = total === 0 ? 0 : Math.round(Number(r.CurrentValue) / total * 10000) / 100;
    r.TargetValue = Math.round(total * tp / 100 * 100) / 100;
    r.Amount = round2(Number(r.TargetValue) - Number(r.CurrentValue));
  }
  const tv = rows.reduce((a, r) => a + Number(r.TargetValue || 0), 0);
  const tpSum = rows.reduce((a, r) => a + (r.TargetPct == null ? 0 : Number(r.TargetPct)), 0);
  return { rows, total: round2(total), targetValue: round2(tv), targetPctSum: round2(tpSum), diff: round2(tv - total) };
}

function saveTargets(s, clientId, rows) {
  const c = isStaff(s) ? clientId : s.ClientId;
  if (!c) throw err('e.noaccount');
  const sum = (rows || []).reduce((a, r) => a + Number(r.targetPct || 0), 0);
  if (sum > 100) throw err('e.sum100');
  tx(() => {
    for (const r of rows || []) {
      // обновляем только строки своего клиента
      run(`UPDATE Holdings SET TargetPct=? WHERE Id=? AND DepoAccountId IN (SELECT Id FROM DepoAccounts WHERE ClientId=?)`,
        r.targetPct === '' || r.targetPct == null ? null : Number(r.targetPct), r.id, c);
    }
  });
  D.audit(s.Login, 'Сохранены целевые доли', 'Client=' + c);
  return { ok: true };
}

function addHolding(s, body) {
  const c = isStaff(s) ? Number(body.clientId) : s.ClientId;
  const q = Number(body.qty);
  if (!Number.isInteger(q) || q <= 0) throw err('e.qty');
  const acc = scalar('SELECT Id FROM DepoAccounts WHERE ClientId=? ORDER BY Id LIMIT 1', c);
  if (!acc) throw err('e.noaccount');
  const sec = scalar('SELECT Id FROM Securities WHERE Symbol=?', String(body.symbol || '').trim());
  if (!sec) throw err('e.nosec');
  tx(() => {
    if (scalar('SELECT 1 FROM Holdings WHERE DepoAccountId=? AND SecurityId=?', acc, sec))
      run('UPDATE Holdings SET Quantity=Quantity+? WHERE DepoAccountId=? AND SecurityId=?', q, acc, sec);
    else
      run('INSERT INTO Holdings(DepoAccountId,SecurityId,Quantity) VALUES (?,?,?)', acc, sec, q);
  });
  D.audit(s.Login, 'Добавлен актив', body.symbol);
  return { ok: true };
}

// ---------------------------------------------------------------- securities / stock page
function securities() {
  return all(`SELECT Id, Symbol, Name FROM Securities WHERE Status='Размещён' ORDER BY Symbol`);
}

function stock(symbol) {
  const r = get(`SELECT sec.Id, sec.Symbol, sec.Name, sec.Kind, sec.Segment, sec.Nominal, sec.Volume, sec.Rate,
                        sec.Price, sec.PrevPrice, sec.ExpenseRatio, i.Name AS Issuer
                 FROM Securities sec JOIN Issuers i ON i.Id=sec.IssuerId WHERE sec.Symbol=?`, symbol);
  if (!r) throw err('e.nosec', 404);
  return r;
}

function chart(symbol, grain) {
  const sec = get('SELECT Id FROM Securities WHERE Symbol=?', symbol);
  if (!sec) throw err('e.nosec', 404);
  grain = Number(grain) || 0;
  // 0 — 48 часов по часам, 1 — 30 дней, 2 — 26 недель, 3 — 24 месяца, 4 — 5 лет
  const week = `date(At, '-' || ((CAST(strftime('%w', At) AS INTEGER) + 6) % 7) || ' days')`;
  const sql = {
    0: `SELECT At AS t, Price AS p FROM PriceHistory WHERE SecurityId=? AND At >= datetime('now','-48 hours') ORDER BY At`,
    1: `SELECT date(At) AS t, Price AS p FROM (SELECT At, Price, ROW_NUMBER() OVER (PARTITION BY date(At) ORDER BY At DESC) rn
          FROM PriceHistory WHERE SecurityId=? AND At >= datetime('now','-30 days')) WHERE rn=1 ORDER BY t`,
    2: `SELECT ${week} AS t, Price AS p FROM (SELECT At, Price,
          ROW_NUMBER() OVER (PARTITION BY ${week} ORDER BY At DESC) rn
          FROM PriceHistory WHERE SecurityId=? AND At >= datetime('now','-182 days')) WHERE rn=1 ORDER BY t`,
    3: `SELECT strftime('%Y-%m', At) AS t, Price AS p FROM (SELECT At, Price,
          ROW_NUMBER() OVER (PARTITION BY strftime('%Y-%m', At) ORDER BY At DESC) rn
          FROM PriceHistory WHERE SecurityId=?) WHERE rn=1 ORDER BY t DESC LIMIT 24`,
    4: `SELECT strftime('%Y', At) AS t, Price AS p FROM (SELECT At, Price,
          ROW_NUMBER() OVER (PARTITION BY strftime('%Y', At) ORDER BY At DESC) rn
          FROM PriceHistory WHERE SecurityId=?) WHERE rn=1 ORDER BY t`,
  }[grain] || null;
  if (!sql) throw err('e.bad');
  let rows = all(sql, sec.Id);
  if (grain === 3) rows = rows.reverse();   // месяцы: брали последние 24 по убыванию — показываем по возрастанию
  return { grain, points: rows };
}

function offers(session, securitySymbol, clientId) {
  // собственные предложения клиента исключаем (в т.ч. когда сотрудник смотрит от имени клиента)
  const c = isStaff(session) ? (clientId ?? null) : session.ClientId;
  const secId = securitySymbol ? scalar('SELECT Id FROM Securities WHERE Symbol=?', securitySymbol) : null;
  return all(`SELECT l.Id, l.SecurityId, sec.Symbol, sec.Name,
                     CASE WHEN cl.Kind='Personal' THEN 'Personal' ELSE cl.Name END AS Seller,
                     l.Quantity AS Available, l.Price AS Price,
                     CAST(round((l.Price - sec.Price) * 100.0 / NULLIF(sec.Price,0), 2) AS REAL) AS VsMarket
              FROM Listings l JOIN Securities sec ON sec.Id=l.SecurityId JOIN Clients cl ON cl.Id=l.SellerClientId
              WHERE l.Status='Активно' AND l.Quantity>0 AND (? IS NULL OR l.SellerClientId<>?) AND (? IS NULL OR l.SecurityId=?)
              ORDER BY sec.Symbol, l.Price`, c, c, secId, secId);
}

function myOffers(s, clientId) {
  const c = isStaff(s) ? clientId : s.ClientId;
  return all(`SELECT l.Id, sec.Symbol, sec.Name, l.Quantity AS Qty, l.Price AS Price, l.CreatedAt
              FROM Listings l JOIN Securities sec ON sec.Id=l.SecurityId
              WHERE l.SellerClientId=? AND l.Status='Активно' ORDER BY l.CreatedAt DESC`, c);
}

function sellable(s, clientId) {
  const c = isStaff(s) ? clientId : s.ClientId;
  if (!c) return [];
  return all(`SELECT sec.Id, sec.Symbol, sec.Name, sec.Price,
                     h.Quantity - IFNULL((SELECT SUM(l.Quantity) FROM Listings l
                        WHERE l.SellerClientId=? AND l.SecurityId=h.SecurityId AND l.Status='Активно'),0) AS Free
              FROM Holdings h JOIN DepoAccounts d ON d.Id=h.DepoAccountId JOIN Securities sec ON sec.Id=h.SecurityId
              WHERE d.ClientId=? AND sec.Status='Размещён' ORDER BY sec.Symbol`, c, c);
}

// ---------------------------------------------------------------- trading
const TRADE_ERRORS = {
  ERR_NOLISTING: 'e.nolisting', ERR_OWN: 'e.own', ERR_QTY: 'e.qty', ERR_ACC: 'e.noaccount',
  ERR_SELLERQTY: 'e.sellerqty', ERR_FREE: 'e.free', ERR_PRICE: 'e.price',
};

function buy(s, body) {
  const listingId = Number(body.listingId);
  const buyerId = isStaff(s) ? Number(body.clientId) : s.ClientId;
  const qty = Number(body.qty);
  if (!buyerId) throw err('e.noaccount');

  const result = tx(() => {
    const l = get('SELECT * FROM Listings WHERE Id=? AND Status=?', listingId, 'Активно');
    if (!l) throw err('e.nolisting');
    if (l.SellerClientId === buyerId) throw err('e.own');
    if (!Number.isInteger(qty) || qty <= 0 || qty > l.Quantity) throw err('e.qty');
    const sa = scalar('SELECT Id FROM DepoAccounts WHERE ClientId=? ORDER BY Id LIMIT 1', l.SellerClientId);
    const ba = scalar('SELECT Id FROM DepoAccounts WHERE ClientId=? ORDER BY Id LIMIT 1', buyerId);
    if (!sa || !ba) throw err('e.noaccount');
    const had = get('SELECT Id, Quantity FROM Holdings WHERE DepoAccountId=? AND SecurityId=?', sa, l.SecurityId);
    if (!had || had.Quantity < qty) throw err('e.sellerqty');
    if (had.Quantity === qty) run('DELETE FROM Holdings WHERE Id=?', had.Id);
    else run('UPDATE Holdings SET Quantity=Quantity-? WHERE Id=?', qty, had.Id);
    if (get('SELECT Id FROM Holdings WHERE DepoAccountId=? AND SecurityId=?', ba, l.SecurityId))
      run('UPDATE Holdings SET Quantity=Quantity+? WHERE DepoAccountId=? AND SecurityId=?', qty, ba, l.SecurityId);
    else
      run('INSERT INTO Holdings(DepoAccountId,SecurityId,Quantity) VALUES (?,?,?)', ba, l.SecurityId, qty);
    const price = Number(l.Price);
    const left = l.Quantity - qty;
    run('UPDATE Listings SET Quantity=?, Status=? WHERE Id=?', left, left === 0 ? 'Продано' : 'Активно', listingId);
    const comm = round2(price * qty * COMMISSION_RATE);
    run(`INSERT INTO Transactions(DepoAccountId,SecurityId,Type,Quantity,Price,Commission,Status) VALUES (?,?,'Buy',?,?,?,'Исполнена')`,
      ba, l.SecurityId, qty, price, comm);
    run(`INSERT INTO Transactions(DepoAccountId,SecurityId,Type,Quantity,Price,Commission,Status) VALUES (?,?,'Sell',?,?,?,'Исполнена')`,
      sa, l.SecurityId, qty, price, comm);
    const symbol = scalar('SELECT Symbol FROM Securities WHERE Id=?', l.SecurityId);
    return { qty, symbol, price, amount: round2(price * qty), commission: comm, total: round2(price * qty + comm) };
  });
  D.audit(s.Login, 'Покупка по предложению', `Listing=${listingId} x${qty}`);
  return result;
}

function sell(s, body) {
  const clientId = isStaff(s) ? Number(body.clientId) : s.ClientId;
  const securityId = Number(body.securityId);
  const qty = Number(body.qty);
  const price = round2(body.price);
  if (!clientId) throw err('e.noaccount');

  const result = tx(() => {
    const acc = scalar('SELECT Id FROM DepoAccounts WHERE ClientId=? ORDER BY Id LIMIT 1', clientId);
    const have = get('SELECT Quantity FROM Holdings WHERE DepoAccountId=? AND SecurityId=?', acc, securityId);
    const reserved = scalar(`SELECT IFNULL(SUM(Quantity),0) FROM Listings WHERE SellerClientId=? AND SecurityId=? AND Status='Активно'`, clientId, securityId);
    const sec = get('SELECT Price, Symbol FROM Securities WHERE Id=?', securityId);
    if (!sec) throw err('e.nosec');
    const free = (have ? have.Quantity : 0) - reserved;
    if (!Number.isInteger(qty) || qty <= 0 || qty > free) throw err('e.free');
    const mp = Number(sec.Price);
    if (!(price > 0) || price < mp * 0.3 || price > mp * 3) throw err('e.price');
    run('INSERT INTO Listings(SellerClientId,SecurityId,Quantity,Price) VALUES (?,?,?,?)', clientId, securityId, qty, price);
    return { symbol: sec.Symbol, qty, price, amount: round2(price * qty), commission: round2(price * qty * COMMISSION_RATE), receive: round2(price * qty * (1 - COMMISSION_RATE)) };
  });
  D.audit(s.Login, 'Выставлено на продажу', `Security=${securityId} x${qty} @ ${price}`);
  return result;
}

function withdraw(s, listingId, clientId) {
  const c = isStaff(s) ? clientId : s.ClientId;
  const info = run(`UPDATE Listings SET Status='Отозвано' WHERE Id=? AND SellerClientId=? AND Status='Активно'`, listingId, c);
  if (info.changes === 0) throw err('e.noorder');
  D.audit(s.Login, 'Предложение отозвано', 'Id=' + listingId);
  return { ok: true };
}

// ---------------------------------------------------------------- transactions
function transactions(s, clientId) {
  const c = isStaff(s) ? (clientId ?? null) : s.ClientId;
  return all(`SELECT t.Id, t.Date AS Date, cl.Name AS Client, sec.Symbol AS Security, t.Type AS Type,
                     t.Quantity AS Qty, t.Price AS Price, t.Commission AS Commission, t.Status AS Status
              FROM Transactions t JOIN DepoAccounts d ON d.Id=t.DepoAccountId
              JOIN Clients cl ON cl.Id=d.ClientId JOIN Securities sec ON sec.Id=t.SecurityId
              WHERE (? IS NULL OR cl.Id=?)
              ORDER BY t.Date DESC, t.Id DESC`, c, c);
}

// ---------------------------------------------------------------- projects (NPV/IRR/PI/Payback)
function projectMetrics(rate, cashFlows) {
  const cf = String(cashFlows).split(';').map(x => Number(x.trim())).filter(x => !Number.isNaN(x));
  if (cf.length < 2) return { NPV: null, IRR: null, PI: null, Payback: null };
  const q = Number(rate) / 100;
  const npv = r => cf.reduce((a, c, i) => a + c / Math.pow(1 + r, i), 0);
  let lo = -0.99, hi = 10;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
  const pi = cf.slice(1).reduce((a, c, i) => a + c / Math.pow(1 + q, i + 1), 0) / -cf[0];
  let cum = cf[0], payback = null;
  for (let i = 1; i < cf.length; i++) {
    if (cum + cf[i] >= 0) { payback = (i - 1 + (-cum) / cf[i]); break; }
    cum += cf[i];
  }
  return {
    NPV: Number(npv(q).toFixed(2)),
    IRR: Number((lo * 100).toFixed(2)),
    PI: Number(pi.toFixed(2)),
    Payback: payback == null ? null : Number(payback.toFixed(2)),
  };
}

function projects() {
  return all('SELECT Id, Name AS Project, Rate, CashFlows FROM InvestmentProjects').map(p => ({ ...p, ...projectMetrics(p.Rate, p.CashFlows) }));
}

function addProject(s, body) {
  const name = String(body.name || '').trim();
  const rate = Number(body.rate);
  const flows = String(body.cashFlows || '').trim();
  if (!name || !flows) throw err('reg.e.empty');
  if (Number.isNaN(rate)) throw err('e.bad');
  run('INSERT INTO InvestmentProjects(Name,Rate,CashFlows) VALUES (?,?,?)', name, rate, flows);
  D.audit(s.Login, 'Добавлен инвестпроект', name);
  return { ok: true };
}

// ---------------------------------------------------------------- reports
function report() {
  const rows = all(`SELECT 'r.ops' AS metric, CAST(COUNT(*) AS REAL) AS value FROM Transactions
                    WHERE Status='Исполнена' AND Date >= datetime('now','-30 days')
                    UNION ALL
                    SELECT 'r.income', IFNULL(SUM(Commission),0) FROM Transactions
                    WHERE Status='Исполнена' AND Date >= datetime('now','-30 days')`);
  const top = all(`SELECT sec.Symbol, CAST(COUNT(*) AS REAL) AS value FROM Transactions t
                   JOIN Securities sec ON sec.Id=t.SecurityId
                   WHERE t.Date >= datetime('now','-30 days')
                   GROUP BY sec.Symbol ORDER BY COUNT(*) DESC LIMIT 3`);
  return [...rows, ...top.map(t => ({ metric: 'r.top:' + t.Symbol, value: t.value }))];
}

// ---------------------------------------------------------------- admin
function users() {
  return all('SELECT Id, CompanyId AS Company, Login, Role, IsActive AS Active FROM Users ORDER BY Role, Login');
}

function addEmployee(s, body) {
  if (!isAdmin(s)) throw err('e.self', 403);
  const login = String(body.login || '').trim();
  const password = String(body.password || '');
  if (login.length < 3 || password.length < 6) throw err('reg.e.empty');
  if (scalar("SELECT 1 FROM Users WHERE Login=? AND CompanyId IN ('ASB','PERSONAL')", login)) throw err('reg.e.exists');
  run(`INSERT INTO Users(CompanyId,Login,PasswordHash,Role) VALUES ('ASB',?,?,?)`, login, hash(password), body.role === 'Admin' ? 'Admin' : 'Employee');
  D.audit(s.Login, 'Создан сотрудник', login);
  return { ok: true };
}

function deleteUser(s, id) {
  if (!isAdmin(s)) throw err('e.self', 403);
  const u = get('SELECT Login FROM Users WHERE Id=?', id);
  if (!u) throw err('nodata', 404);
  if (u.Login === s.Login) throw err('e.self');
  run('DELETE FROM Sessions WHERE UserId=?', id);
  run('DELETE FROM Users WHERE Id=?', id);
  D.audit(s.Login, 'Удалена учётная запись', 'Id=' + id);
  return { ok: true };
}

function auditLog() {
  return all('SELECT At AS Time, UserLogin AS User, Action, Details FROM AuditLog ORDER BY Id DESC LIMIT 500');
}

// ---------------------------------------------------------------- server-sent events fan-out
const listeners = new Set();
function broadcast(event) {
  const payload = `data: ${JSON.stringify({ ...event, at: D.now() })}\n\n`;
  for (const res of [...listeners]) {
    try { res.write(payload); } catch { listeners.delete(res); }
  }
}
function subscribe(res) {
  listeners.add(res);
  return () => listeners.delete(res);
}
function publish(s, action, details) {
  D.audit(s.Login, action, details);
  broadcast({ type: 'changed', action, details, user: s.Login });
}

module.exports = {
  COMMISSION_RATE, round2, isStaff, isAdmin, sessionPublic, readToken,
  login, logout, setLang, register,
  home, clients, clientsLite, addClient, deleteClient, profile,
  portfolio, saveTargets, addHolding,
  securities, stock, chart, offers, myOffers, sellable,
  buy, sell, withdraw, TRADE_ERRORS,
  transactions, projects, addProject, report,
  users, addEmployee, deleteUser, auditLog,
  subscribe, broadcast, publish,
};
