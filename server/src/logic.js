// Business logic on top of SQL Server.
//
// The rules that used to live in usp_BuyListing / usp_UpdatePrices stay in the
// database: покупка по предложению -> EXEC usp_BuyListing, «тиканье» цен ->
// EXEC usp_UpdatePrices. Всё остальное (портфель, отчёты, права, проекты)
// считается здесь, а данные берутся из тех же таблиц SQL Server, что и у
// десктопной версии, поэтому веб и десктоп работают с одной базой.
'use strict';

const crypto = require('node:crypto');
const D = require('./db');
const { all, get, scalar, run, exec, tx, hash, err } = D;

const COMMISSION_RATE = 0.005;                 // 0,5 % с каждой стороны сделки
const round2 = v => Math.round(Number(v) * 100) / 100;
const isStaff = s => !!s && s.Role !== 'Client';
const isAdmin = s => !!s && s.Role === 'Admin';

// ---------------------------------------------------------------- result normalisation
// SQL Server отдаёт даты как Date, BIGINT — как BigInt. Клиентам (веб и десктоп)
// нужны строки "ГГГГ-ММ-ДД чч:мм:сс" и обычные числа — как раньше отдавал API.
function normalize(v) {
  if (v instanceof Date) return D.toIso(v);
  if (typeof v === 'bigint') return Number(v);
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = normalize(v[k]);
    return o;
  }
  return v;
}
const allN = async (text, ...params) => normalize(await all(text, ...params));
const getN = async (text, ...params) => normalize(await get(text, ...params));

// ---------------------------------------------------------------- auth
function sessionPublic(s) {
  return {
    token: s.Token, login: s.Login, role: s.Role, clientId: s.ClientId,
    clientName: s.Client, lang: s.Lang,
    isStaff: s.Role !== 'Client', isAdmin: s.Role === 'Admin',
  };
}

async function readToken(token) {
  if (!token) return null;
  const s = await get('SELECT TOP 1 * FROM Sessions WHERE Token=?', token);
  if (!s) return null;
  run('UPDATE Sessions SET SeenAt=GETDATE() WHERE Token=?', token).catch(() => {});
  return s;
}

async function login(id, password, mode) {
  id = String(id || '').trim();
  password = String(password || '');
  if (!id || !password) throw err('reg.e.empty');
  const rows = mode === 'company'
    ? await all(`SELECT TOP 1 Id,Login,Role,ClientId,PasswordHash,CompanyId FROM Users
                 WHERE CompanyId=? AND Login=? AND Role='Client' AND IsActive=1`, id, id)
    : await all(`SELECT TOP 1 Id,Login,Role,ClientId,PasswordHash,CompanyId FROM Users
                 WHERE Login=? AND CompanyId IN ('ASB','PERSONAL') AND IsActive=1`, id);
  const user = rows.length === 1 ? rows[0] : null;
  const given = hash(password);
  if (!user || String(user.PasswordHash).trim().toUpperCase() !== given) {
    await D.audit(id, 'Неудачная попытка входа', (mode === 'company' ? 'Company=' : 'User=') + id);
    throw err('login.fail', 401);
  }
  const client = user.ClientId ? await scalar('SELECT Name FROM Clients WHERE Id=?', user.ClientId) : '';
  const token = crypto.randomBytes(24).toString('hex');
  await run(`INSERT INTO Sessions(Token,UserId,Login,Role,ClientId,Client) VALUES (?,?,?,?,?,?)`,
    token, user.Id, user.Login, user.Role, user.ClientId, client || '');
  await D.audit(user.Login, 'Вход в систему', 'API');
  return sessionPublic(await readToken(token));
}

async function logout(session) {
  if (!session) return;
  await run('DELETE FROM Sessions WHERE Token=?', session.Token);
  await D.audit(session.Login, 'Выход из системы', 'API');
}

async function setLang(session, lang) {
  await run('UPDATE Sessions SET Lang=? WHERE Token=?', Number(lang) || 0, session.Token);
}

async function register(body) {
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
    if (await scalar('SELECT TOP 1 1 FROM Clients WHERE UNP=?', unp) ||
        await scalar('SELECT TOP 1 1 FROM Users WHERE CompanyId=?', unp)) throw err('reg.e.exists');
    const clientId = await tx(async t => {
      const c = await t.run(`INSERT INTO Clients(Name,UNP,Address,Contacts,Kind) OUTPUT INSERTED.Id AS Id VALUES (?,?,?,?,'Company')`,
        name, unp, address, contacts);
      const id = c.id;
      await t.run('INSERT INTO DepoAccounts(ClientId,Number) VALUES (?,?)', id, 'DEPO-' + unp);
      await t.run(`INSERT INTO Users(CompanyId,Login,PasswordHash,Role,ClientId) VALUES (?,?,?,'Client',?)`, unp, unp, h, id);
      return id;
    });
    await D.audit(unp, 'Регистрация', 'Company');
    return { login: unp, company: true, clientId };
  }

  const loginId = String(body.login || '').trim();
  if (!loginId) throw err('reg.e.empty');
  if (loginId.length < 3) throw err('reg.e.login');
  if (await scalar("SELECT TOP 1 1 FROM Users WHERE Login=? AND CompanyId IN ('ASB','PERSONAL')", loginId)) throw err('reg.e.exists');
  let unp;
  do { unp = '9' + String(crypto.randomInt(0, 100000000)).padStart(8, '0'); }
  while (await scalar('SELECT TOP 1 1 FROM Clients WHERE UNP=?', unp));
  const clientId = await tx(async t => {
    const c = await t.run(`INSERT INTO Clients(Name,UNP,Address,Contacts,Kind) OUTPUT INSERTED.Id AS Id VALUES (?,?,?,?,'Personal')`,
      name, unp, address, contacts);
    const id = c.id;
    await t.run('INSERT INTO DepoAccounts(ClientId,Number) VALUES (?,?)', id, 'DEPO-' + unp);
    await t.run(`INSERT INTO Users(CompanyId,Login,PasswordHash,Role,ClientId) VALUES ('PERSONAL',?,?,'Client',?)`, loginId, h, id);
    return id;
  });
  await D.audit(loginId, 'Регистрация', 'Personal');
  return { login: loginId, company: false, clientId };
}

// ---------------------------------------------------------------- home
async function home(s) {
  const c = isStaff(s) ? null : s.ClientId;
  const M = v => round2(v ?? 0);
  const pv = await scalar(`SELECT ISNULL(SUM(h.Quantity*sec.Price),0) FROM Holdings h
                     JOIN DepoAccounts d ON d.Id=h.DepoAccountId JOIN Securities sec ON sec.Id=h.SecurityId
                     WHERE (? IS NULL OR d.ClientId=?)`, c, c);
  const offers = await scalar(`SELECT COUNT(*) FROM Listings WHERE Status='Активно' AND (? IS NULL OR SellerClientId=?)`, c, c);
  const kpis = [];
  if (isStaff(s)) {
    kpis.push({ key: 'k.clients', value: String(await scalar('SELECT COUNT(*) FROM Clients')), kind: 'count', accent: 'blue' });
    kpis.push({ key: 'k.aum', value: M(pv).toFixed(2) + ' BYN', kind: 'money', accent: 'green' });
    kpis.push({ key: 'k.offers', value: String(offers), kind: 'count', accent: 'orange' });
    kpis.push({ key: 'k.income', value: M(await scalar("SELECT ISNULL(SUM(Commission),0) FROM Transactions WHERE Status='Исполнена'")).toFixed(2) + ' BYN', kind: 'money', accent: 'purple' });
  } else {
    const secs = await scalar(`SELECT COUNT(*) FROM Holdings h JOIN DepoAccounts d ON d.Id=h.DepoAccountId WHERE d.ClientId=? AND h.Quantity>0`, c);
    const ops = await scalar(`SELECT COUNT(*) FROM Transactions t JOIN DepoAccounts d ON d.Id=t.DepoAccountId WHERE d.ClientId=?`, c);
    kpis.push({ key: 'k.pv', value: M(pv).toFixed(2) + ' BYN', kind: 'money', accent: 'green' });
    kpis.push({ key: 'k.secs', value: String(secs), kind: 'count', accent: 'blue' });
    kpis.push({ key: 'k.myops', value: String(ops), kind: 'count', accent: 'purple' });
    kpis.push({ key: 'k.myoffers', value: String(offers), kind: 'count', accent: 'orange' });
  }
  const cols = `Symbol, Name, Price, ROUND((Price-PrevPrice)*100.0/NULLIF(PrevPrice,0),2) AS Change`;
  const up = await allN(`SELECT TOP (8) ${cols} FROM Securities WHERE Status='Размещён' AND Price>PrevPrice ORDER BY Change DESC`);
  const down = await allN(`SELECT TOP (8) ${cols} FROM Securities WHERE Status='Размещён' AND Price<PrevPrice ORDER BY Change ASC`);
  return { kpis, up, down };
}

// ---------------------------------------------------------------- clients
async function clients() {
  return allN(`SELECT c.Id, c.Name, CASE WHEN c.Kind='Personal' THEN NULL ELSE c.UNP END AS UNP,
                     c.Address, c.Contacts, c.Status, c.Kind,
                     (SELECT TOP (1) Number FROM DepoAccounts d WHERE d.ClientId=c.Id ORDER BY d.Id) AS Depo
              FROM Clients c ORDER BY c.Name`);
}

async function clientsLite() {
  return allN('SELECT Id, Name FROM Clients ORDER BY Name');
}

async function addClient(body) {
  const name = String(body.name || '').trim();
  const unp = String(body.unp || '').trim();
  const addr = String(body.address || '').trim();
  const contacts = String(body.contacts || '').trim();
  const password = String(body.password || '');
  if (!/^\d{9}$/.test(unp)) throw err('reg.e.unp');
  if (!name || password.length < 6) throw err('reg.e.empty');
  if (await scalar('SELECT TOP 1 1 FROM Clients WHERE UNP=?', unp)) throw err('reg.e.exists');
  const id = await tx(async t => {
    const c = await t.run(`INSERT INTO Clients(Name,UNP,Address,Contacts,Kind) OUTPUT INSERTED.Id AS Id VALUES (?,?,?,?,'Company')`,
      name, unp, addr, contacts);
    await t.run('INSERT INTO DepoAccounts(ClientId,Number) VALUES (?,?)', c.id, 'DEPO-' + unp);
    await t.run(`INSERT INTO Users(CompanyId,Login,PasswordHash,Role,ClientId) VALUES (?,?,?,'Client',?)`,
      unp, unp, hash(password), c.id);
    return c.id;
  });
  return { id };
}

async function deleteClient(s, id) {
  if (!isAdmin(s)) throw err('e.self', 403);
  await tx(async t => {
    const deps = (await t.all('SELECT Id FROM DepoAccounts WHERE ClientId=?', id)).map(r => r.Id);
    for (const d of deps) await t.run('DELETE FROM Transactions WHERE DepoAccountId=?', d);
    await t.run('DELETE FROM Listings WHERE SellerClientId=?', id);
    await t.run('DELETE FROM Users WHERE ClientId=?', id);
    await t.run('DELETE FROM DepoAccounts WHERE ClientId=?', id);   // Holdings — каскадом
    await t.run('DELETE FROM Clients WHERE Id=?', id);
  });
  await D.audit(s.Login, 'Удаление клиента', 'Id=' + id);
  return { ok: true };
}

async function profile(s) {
  const r = await getN(`SELECT Name, CASE WHEN Kind='Personal' THEN NULL ELSE UNP END AS UNP, Address, Contacts, Status, Kind
                 FROM Clients WHERE Id=?`, s.ClientId);
  if (!r) throw err('nodata', 404);
  return r;
}

// ---------------------------------------------------------------- portfolio
async function portfolio(s, clientId) {
  const c = isStaff(s) ? (clientId ?? null) : s.ClientId;
  if (c == null) throw err('e.noaccount');
  const rows = await allN(`SELECT h.Id, sec.Symbol, sec.Name, sec.Segment, h.Quantity AS Qty,
                     ISNULL((SELECT SUM(l.Quantity) FROM Listings l WHERE l.SellerClientId=d.ClientId AND l.SecurityId=h.SecurityId AND l.Status='Активно'),0) AS ForSale,
                     sec.Price AS Price, sec.ExpenseRatio, ROUND(h.Quantity*sec.Price,2) AS CurrentValue, h.TargetPct
                     FROM Holdings h JOIN DepoAccounts d ON d.Id=h.DepoAccountId JOIN Securities sec ON sec.Id=h.SecurityId
                     WHERE d.ClientId=? ORDER BY sec.Symbol`, c);
  // в исходной схеме TargetPct NOT NULL DEFAULT 0: ноль означает «доля не задана»
  for (const r of rows) if (Number(r.TargetPct) === 0) r.TargetPct = null;
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

async function saveTargets(s, clientId, rows) {
  const c = isStaff(s) ? clientId : s.ClientId;
  if (!c) throw err('e.noaccount');
  const sum = (rows || []).reduce((a, r) => a + Number(r.targetPct || 0), 0);
  if (sum > 100) throw err('e.sum100');
  await tx(async t => {
    for (const r of rows || []) {
      // обновляем только строки своего клиента; в этой базе TargetPct NOT NULL, поэтому «0» = доля не задана
      await t.run(`UPDATE Holdings SET TargetPct=?
                   WHERE Id=? AND DepoAccountId IN (SELECT Id FROM DepoAccounts WHERE ClientId=?)`,
        r.targetPct === '' || r.targetPct == null ? 0 : Number(r.targetPct), r.id, c);
    }
  });
  await D.audit(s.Login, 'Сохранены целевые доли', 'Client=' + c);
  return { ok: true };
}

async function addHolding(s, body) {
  const c = isStaff(s) ? Number(body.clientId) : s.ClientId;
  const q = Number(body.qty);
  if (!Number.isInteger(q) || q <= 0) throw err('e.qty');
  const acc = await scalar('SELECT TOP (1) Id FROM DepoAccounts WHERE ClientId=? ORDER BY Id', c);
  if (!acc) throw err('e.noaccount');
  const sec = await scalar('SELECT Id FROM Securities WHERE Symbol=?', String(body.symbol || '').trim());
  if (!sec) throw err('e.nosec');
  await tx(async t => {
    const had = await t.scalar('SELECT TOP (1) 1 FROM Holdings WHERE DepoAccountId=? AND SecurityId=?', acc, sec);
    if (had) await t.run('UPDATE Holdings SET Quantity=Quantity+? WHERE DepoAccountId=? AND SecurityId=?', q, acc, sec);
    else await t.run('INSERT INTO Holdings(DepoAccountId,SecurityId,Quantity) VALUES (?,?,?)', acc, sec, q);
  });
  await D.audit(s.Login, 'Добавлен актив', body.symbol);
  return { ok: true };
}

// ---------------------------------------------------------------- securities / stock page
async function securities() {
  return allN(`SELECT Id, Symbol, Name FROM Securities WHERE Status='Размещён' ORDER BY Symbol`);
}

async function stock(symbol) {
  const r = await getN(`SELECT sec.Id, sec.Symbol, sec.Name, sec.Kind, sec.Segment, sec.Nominal, sec.Volume, sec.Rate,
                        sec.Price, sec.PrevPrice, sec.ExpenseRatio, i.Name AS Issuer
                 FROM Securities sec JOIN Issuers i ON i.Id=sec.IssuerId WHERE sec.Symbol=?`, symbol);
  if (!r) throw err('e.nosec', 404);
  return r;
}

async function chart(symbol, grain) {
  const sec = await get('SELECT Id FROM Securities WHERE Symbol=?', symbol);
  if (!sec) throw err('e.nosec', 404);
  grain = Number(grain) || 0;
  // 0 — 48 часов по часам, 1 — 30 дней, 2 — 26 недель, 3 — 24 месяца, 4 — годы
  // даты отдаём короткими строками ('2026-11-23', '2026-11', '2026') — так их ждут оба клиента
  const day = `CONVERT(CHAR(10), [At], 23)`;
  const week = `CONVERT(CHAR(10), DATEADD(DAY, -(DATEDIFF(DAY, 0, [At]) % 7), [At]), 23)`;   // понедельник недели
  const month = `CONVERT(CHAR(7), [At], 120)`;
  const year = `CONVERT(CHAR(4), [At], 120)`;
  const sql = {
    0: `SELECT [At] AS t, Price AS p FROM PriceHistory
        WHERE SecurityId=? AND [At] >= DATEADD(HOUR, -48, GETDATE()) ORDER BY [At]`,
    1: `SELECT b AS t, Price AS p FROM (
          SELECT ${day} AS b, [At], Price, ROW_NUMBER() OVER (PARTITION BY ${day} ORDER BY [At] DESC) rn
          FROM PriceHistory WHERE SecurityId=? AND [At] >= DATEADD(DAY, -30, GETDATE())) x
        WHERE rn=1 ORDER BY b`,
    2: `SELECT b AS t, Price AS p FROM (
          SELECT ${week} AS b, [At], Price, ROW_NUMBER() OVER (PARTITION BY ${week} ORDER BY [At] DESC) rn
          FROM PriceHistory WHERE SecurityId=? AND [At] >= DATEADD(DAY, -182, GETDATE())) x
        WHERE rn=1 ORDER BY b`,
    3: `SELECT b AS t, Price AS p FROM (
          SELECT ${month} AS b, [At], Price, ROW_NUMBER() OVER (PARTITION BY ${month} ORDER BY [At] DESC) rn
          FROM PriceHistory WHERE SecurityId=?) x
        WHERE rn=1 ORDER BY b DESC OFFSET 0 ROWS FETCH NEXT 24 ROWS ONLY`,
    4: `SELECT b AS t, Price AS p FROM (
          SELECT ${year} AS b, [At], Price, ROW_NUMBER() OVER (PARTITION BY ${year} ORDER BY [At] DESC) rn
          FROM PriceHistory WHERE SecurityId=?) x
        WHERE rn=1 ORDER BY b`,
  }[grain] || null;
  if (!sql) throw err('e.bad');
  let points = await allN(sql, sec.Id);
  if (grain === 3) points = points.reverse();   // месяцы: брали последние 24 по убыванию — показываем по возрастанию
  return { grain, points };
}

async function offers(session, securitySymbol, clientId) {
  // собственные предложения клиента исключаем (в т.ч. когда сотрудник смотрит от имени клиента)
  const c = isStaff(session) ? (clientId ?? null) : session.ClientId;
  // фильтр по бумаге: веб передаёт символ, десктоп — SecurityId; принимаем оба варианта
  const filter = String(securitySymbol ?? '').trim();
  const secId = !filter ? null
    : /^\d+$/.test(filter) ? Number(filter)
    : await scalar('SELECT Id FROM Securities WHERE Symbol=?', filter);
  return allN(`SELECT l.Id, l.SecurityId, sec.Symbol, sec.Name,
                     CASE WHEN cl.Kind='Personal' THEN 'Personal' ELSE cl.Name END AS Seller,
                     l.Quantity AS Available, l.Price AS Price,
                     ROUND((l.Price - sec.Price) * 100.0 / NULLIF(sec.Price,0), 2) AS VsMarket
              FROM Listings l JOIN Securities sec ON sec.Id=l.SecurityId JOIN Clients cl ON cl.Id=l.SellerClientId
              WHERE l.Status='Активно' AND l.Quantity>0 AND (? IS NULL OR l.SellerClientId<>?) AND (? IS NULL OR l.SecurityId=?)
              ORDER BY sec.Symbol, l.Price`, c, c, secId, secId);
}

async function myOffers(s, clientId) {
  const c = isStaff(s) ? clientId : s.ClientId;
  return allN(`SELECT l.Id, sec.Symbol, sec.Name, l.Quantity AS Qty, l.Price AS Price, l.CreatedAt
              FROM Listings l JOIN Securities sec ON sec.Id=l.SecurityId
              WHERE l.SellerClientId=? AND l.Status='Активно' ORDER BY l.CreatedAt DESC`, c);
}

async function sellable(s, clientId) {
  const c = isStaff(s) ? clientId : s.ClientId;
  if (!c) return [];
  return allN(`SELECT sec.Id, sec.Symbol, sec.Name, sec.Price,
                     h.Quantity - ISNULL((SELECT SUM(l.Quantity) FROM Listings l
                        WHERE l.SellerClientId=? AND l.SecurityId=h.SecurityId AND l.Status='Активно'),0) AS Free
              FROM Holdings h JOIN DepoAccounts d ON d.Id=h.DepoAccountId JOIN Securities sec ON sec.Id=h.SecurityId
              WHERE d.ClientId=? AND sec.Status='Размещён' ORDER BY sec.Symbol`, c, c);
}

// ---------------------------------------------------------------- trading
// Коды ошибок приходят из процедур: RAISERROR(N'ERR_*') -> db.js переводит в ключи i18n.
const TRADE_ERRORS = {
  ERR_NOLISTING: 'e.nolisting', ERR_OWN: 'e.own', ERR_QTY: 'e.qty', ERR_ACC: 'e.noaccount',
  ERR_SELLERQTY: 'e.sellerqty', ERR_FREE: 'e.free', ERR_PRICE: 'e.price',
};

/** Покупка по предложению — целиком в usp_BuyListing (одна транзакция в базе). */
async function buy(s, body) {
  const listingId = Number(body.listingId);
  const buyerId = isStaff(s) ? Number(body.clientId) : s.ClientId;
  const qty = Number(body.qty);
  if (!buyerId) throw err('e.noaccount');

  const before = await get('SELECT * FROM Listings WHERE Id=?', listingId);
  if (!before) throw err('e.nolisting');
  if (Number(before.SellerClientId) === Number(buyerId)) throw err('e.own');

  await exec('EXEC usp_BuyListing @ListingId=?, @BuyerId=?, @Qty=?', listingId, buyerId, qty);

  const price = Number(before.Price);
  const comm = round2(price * qty * COMMISSION_RATE);
  const result = {
    qty, symbol: before.Symbol || await scalar('SELECT Symbol FROM Securities WHERE Id=?', before.SecurityId),
    price, amount: round2(price * qty), commission: comm, total: round2(price * qty + comm),
  };
  await D.audit(s.Login, 'Покупка по предложению', `Listing=${listingId} x${qty}`);
  return result;
}

async function sell(s, body) {
  const clientId = isStaff(s) ? Number(body.clientId) : s.ClientId;
  const securityId = Number(body.securityId);
  const qty = Number(body.qty);
  const price = round2(body.price);
  if (!clientId) throw err('e.noaccount');

  const result = await tx(async t => {
    const acc = await t.scalar('SELECT TOP (1) Id FROM DepoAccounts WHERE ClientId=? ORDER BY Id', clientId);
    // SUM(...) вместо простого SELECT: DECIMAL SUM приходит числом, а не decimal-объектом mssql
    const have = await t.scalar('SELECT ISNULL(SUM(Quantity),0) AS Qty FROM Holdings WHERE DepoAccountId=? AND SecurityId=?', acc, securityId);
    const reserved = await t.scalar(`SELECT ISNULL(SUM(Quantity),0) FROM Listings WHERE SellerClientId=? AND SecurityId=? AND Status='Активно'`, clientId, securityId);
    const sec = await t.get('SELECT Price, Symbol FROM Securities WHERE Id=?', securityId);
    if (!sec) throw err('e.nosec');
    const free = Number(have || 0) - reserved;
    if (!Number.isInteger(qty) || qty <= 0 || qty > free) throw err('e.free');
    const mp = Number(sec.Price);
    if (!(price > 0) || price < mp * 0.3 || price > mp * 3) throw err('e.price');
    await t.run(`INSERT INTO Listings(SellerClientId,SecurityId,Quantity,Price) OUTPUT INSERTED.Id AS Id VALUES (?,?,?,?)`,
      clientId, securityId, qty, price);
    return {
      symbol: sec.Symbol, qty, price, amount: round2(price * qty),
      commission: round2(price * qty * COMMISSION_RATE), receive: round2(price * qty * (1 - COMMISSION_RATE)),
    };
  });
  await D.audit(s.Login, 'Выставлено на продажу', `Security=${securityId} x${qty} @ ${price}`);
  return result;
}

async function withdraw(s, listingId, clientId) {
  const c = isStaff(s) ? clientId : s.ClientId;
  const info = await run(`UPDATE Listings SET Status='Отозвано' WHERE Id=? AND SellerClientId=? AND Status='Активно'`, listingId, c);
  if (!info.changes) throw err('e.noorder');
  await D.audit(s.Login, 'Предложение отозвано', 'Id=' + listingId);
  return { ok: true };
}

// ---------------------------------------------------------------- transactions
async function transactions(s, clientId) {
  const c = isStaff(s) ? (clientId ?? null) : s.ClientId;
  return allN(`SELECT t.Id, t.[Date] AS [Date], cl.Name AS Client, sec.Symbol AS Security, t.Type AS Type,
                     t.Quantity AS Qty, t.Price AS Price, t.Commission AS Commission, t.Status AS Status
              FROM Transactions t JOIN DepoAccounts d ON d.Id=t.DepoAccountId
              JOIN Clients cl ON cl.Id=d.ClientId JOIN Securities sec ON sec.Id=t.SecurityId
              WHERE (? IS NULL OR cl.Id=?)
              ORDER BY t.[Date] DESC, t.Id DESC`, c, c);
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

async function projects() {
  return (await allN('SELECT Id, Name AS Project, Rate, CashFlows FROM InvestmentProjects'))
    .map(p => ({ ...p, ...projectMetrics(p.Rate, p.CashFlows) }));
}

async function addProject(s, body) {
  const name = String(body.name || '').trim();
  const rate = Number(body.rate);
  const flows = String(body.cashFlows || '').trim();
  if (!name || !flows) throw err('reg.e.empty');
  if (Number.isNaN(rate)) throw err('e.bad');
  await run('INSERT INTO InvestmentProjects(Name,Rate,CashFlows) VALUES (?,?,?)', name, rate, flows);
  await D.audit(s.Login, 'Добавлен инвестпроект', name);
  return { ok: true };
}

// ---------------------------------------------------------------- reports
async function report() {
  const rows = await allN(`SELECT 'r.ops' AS metric, CAST(COUNT(*) AS FLOAT) AS value FROM Transactions
                    WHERE Status='Исполнена' AND [Date] >= DATEADD(DAY, -30, GETDATE())
                    UNION ALL
                    SELECT 'r.income', ISNULL(SUM(Commission),0) FROM Transactions
                    WHERE Status='Исполнена' AND [Date] >= DATEADD(DAY, -30, GETDATE())`);
  const top = await allN(`SELECT TOP (3) sec.Symbol, CAST(COUNT(*) AS FLOAT) AS value FROM Transactions t
                   JOIN Securities sec ON sec.Id=t.SecurityId
                   WHERE t.[Date] >= DATEADD(DAY, -30, GETDATE())
                   GROUP BY sec.Symbol ORDER BY COUNT(*) DESC`);
  return [...rows, ...top.map(t => ({ metric: 'r.top:' + t.Symbol, value: t.value }))];
}

// ---------------------------------------------------------------- admin
async function users() {
  return allN(`SELECT Id, CompanyId AS Company, Login, Role,
                      CAST(CASE WHEN IsActive=1 THEN 1 ELSE 0 END AS INT) AS Active
               FROM Users ORDER BY Role, Login`);
}

async function addEmployee(s, body) {
  if (!isAdmin(s)) throw err('e.self', 403);
  const login = String(body.login || '').trim();
  const password = String(body.password || '');
  if (login.length < 3 || password.length < 6) throw err('reg.e.empty');
  if (await scalar("SELECT TOP (1) 1 FROM Users WHERE Login=? AND CompanyId IN ('ASB','PERSONAL')", login)) throw err('reg.e.exists');
  await run(`INSERT INTO Users(CompanyId,Login,PasswordHash,Role) VALUES ('ASB',?,?,?)`,
    login, hash(password), body.role === 'Admin' ? 'Admin' : 'Employee');
  await D.audit(s.Login, 'Создан сотрудник', login);
  return { ok: true };
}

async function deleteUser(s, id) {
  if (!isAdmin(s)) throw err('e.self', 403);
  const u = await get('SELECT Login FROM Users WHERE Id=?', id);
  if (!u) throw err('nodata', 404);
  if (u.Login === s.Login) throw err('e.self');
  await run('DELETE FROM Sessions WHERE UserId=?', id);
  await run('DELETE FROM Users WHERE Id=?', id);
  await D.audit(s.Login, 'Удалена учётная запись', 'Id=' + id);
  return { ok: true };
}

async function auditLog() {
  return allN(`SELECT TOP (500) [At] AS [Time], UserLogin AS [User], Action, Details
               FROM AuditLog ORDER BY Id DESC`);
}

// ---------------------------------------------------------------- server-sent events fan-out
const listeners = new Set();
function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function broadcast(event) {
  const payload = `data: ${JSON.stringify({ ...event, at: stamp() })}\n\n`;
  for (const res of [...listeners]) {
    try { res.write(payload); } catch { listeners.delete(res); }
  }
}
function subscribe(res) {
  listeners.add(res);
  return () => listeners.delete(res);
}
async function publish(s, action, details) {
  await D.audit(s.Login, action, details);
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
  subscribe, broadcast, publish, stamp, normalize, projectMetrics, recalc,
};
