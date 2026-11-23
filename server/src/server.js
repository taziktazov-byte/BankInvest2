// BankInvest server: one HTTP process that serves
//   * the REST API used by the desktop (WinForms) client   -> /api/*
//   * the web version of the same application              -> /  (static files)
//   * server-sent events for live updates                  -> /api/events
// Storage: Microsoft SQL Server (driver mssql, schema in db/schema.sql).
// Both clients go through this API, so every action of the desktop app and of the
// web version lands in the same SQL Server database.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const D = require('./db');
const L = require('./logic');
const i18n = require('./i18n.json');

const PORT = Number(process.env.PORT || process.env.BANKINVEST_PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const WEB_DIR = path.join(__dirname, '..', 'web');

// ---------------------------------------------------------------- helpers
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-BankInvest-Client');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 2 * 1024 * 1024) { reject(Object.assign(new Error('payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('invalid json'), { status: 400, key: 'e.bad' })); }
    });
    req.on('error', reject);
  });
}

function token(req, url) {
  const h = req.headers.authorization || '';
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  return url.searchParams.get('token') || '';
}

async function requireSession(req, url) {
  const s = await L.readToken(token(req, url));
  if (!s) throw D.err('login.fail', 401);
  return s;
}

function requireStaff(s) {
  if (!L.isStaff(s)) throw D.err('e.self', 403);
  return s;
}

// ---------------------------------------------------------------- routes
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, m => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, ...opts });
}

// --- public
route('GET', '/api/health', async () => ({
  ok: true, app: 'BankInvest', version: require('../package.json').version,
  time: await D.now(), database: 'sqlserver', dbFile: D.DB_FILE, web: '/', api: '/api',
}));

route('GET', '/api/ping', async (req, url, ctx) => {
  const sessions = await D.scalar('SELECT COUNT(*) FROM Sessions');
  return {
    ok: true, app: 'BankInvest', time: await D.now(), db: D.DB_FILE, sessions,
    securities: await D.scalar('SELECT COUNT(*) FROM Securities'),
    clients: await D.scalar('SELECT COUNT(*) FROM Clients'),
    auth: ctx.session ? { login: ctx.session.Login, role: ctx.session.Role } : null,
  };
});

route('GET', '/api/i18n', () => ({ languages: ['ru', 'en', 'be'], dict: i18n }));

route('POST', '/api/auth/login', async (req, url) => {
  const b = await readJson(req);
  return await L.login(b.id ?? b.login, b.password, b.mode === 'company' ? 'company' : 'user');
});

route('POST', '/api/auth/register', async (req) => await L.register(await readJson(req)));

route('POST', '/api/auth/logout', async (req, url, ctx) => { await L.logout(ctx.session); return { ok: true }; }, { auth: true });

route('GET', '/api/auth/me', async (req, url, ctx) => L.sessionPublic(ctx.session), { auth: true });

route('POST', '/api/lang', async (req, url, ctx) => {
  const b = await readJson(req);
  await L.setLang(ctx.session, b.lang);
  return { ok: true, lang: Number(b.lang) || 0 };
}, { auth: true });

// --- home / profile
route('GET', '/api/home', async (req, url, ctx) => await L.home(ctx.session), { auth: true });
route('GET', '/api/profile', async (req, url, ctx) => await L.profile(ctx.session), { auth: true });

// --- clients (staff only)
route('GET', '/api/clients', async () => await L.clients(), { auth: true, staff: true });
route('GET', '/api/clients/lite', async () => await L.clientsLite(), { auth: true });
route('POST', '/api/clients', async (req, url, ctx) => {
  const r = await L.addClient(await readJson(req));
  await L.publish(ctx.session, 'Создан клиент + счёт депо', 'client=' + r.id);
  return r;
}, { auth: true, staff: true });
route('DELETE', '/api/clients/:id', async (req, url, ctx) => await L.deleteClient(ctx.session, Number(url.params.id)), { auth: true, staff: true });

// --- portfolio
route('GET', '/api/portfolio', async (req, url, ctx) => await L.portfolio(ctx.session, url.searchParams.get('clientId') ? Number(url.searchParams.get('clientId')) : null), { auth: true });
route('POST', '/api/portfolio/targets', async (req, url, ctx) => {
  const b = await readJson(req);
  const r = await L.saveTargets(ctx.session, b.clientId ? Number(b.clientId) : null, b.rows);
  await L.publish(ctx.session, 'Сохранены целевые доли', 'client=' + (b.clientId ?? ctx.session.ClientId));
  return r;
}, { auth: true });
route('POST', '/api/portfolio/holdings', async (req, url, ctx) => {
  const b = await readJson(req);
  const r = await L.addHolding(ctx.session, b);
  await L.publish(ctx.session, 'Добавлен актив', String(b.symbol || ''));
  return r;
}, { auth: true, staff: true });

// --- securities / stock page
route('GET', '/api/securities', async () => await L.securities(), { auth: true });
route('GET', '/api/stock/:symbol', async (req, url) => await L.stock(decodeURIComponent(url.params.symbol)), { auth: true });
route('GET', '/api/stock/:symbol/chart', async (req, url) => await L.chart(decodeURIComponent(url.params.symbol), url.searchParams.get('grain')), { auth: true });
route('GET', '/api/offers', async (req, url, ctx) => await L.offers(ctx.session,
  url.searchParams.get('security') || null,
  url.searchParams.get('clientId') ? Number(url.searchParams.get('clientId')) : null), { auth: true });
route('GET', '/api/my-offers', async (req, url, ctx) => await L.myOffers(ctx.session, url.searchParams.get('clientId') ? Number(url.searchParams.get('clientId')) : null), { auth: true });
route('GET', '/api/sellable', async (req, url, ctx) => await L.sellable(ctx.session, url.searchParams.get('clientId') ? Number(url.searchParams.get('clientId')) : null), { auth: true });

// --- trading
route('POST', '/api/trade/buy', async (req, url, ctx) => {
  const r = await L.buy(ctx.session, await readJson(req));
  await L.publish(ctx.session, 'Покупка по предложению', `${r.symbol} x${r.qty} @ ${r.price}`);
  return r;
}, { auth: true });
route('POST', '/api/trade/sell', async (req, url, ctx) => {
  const r = await L.sell(ctx.session, await readJson(req));
  await L.publish(ctx.session, 'Выставлено на продажу', `${r.symbol} x${r.qty} @ ${r.price}`);
  return r;
}, { auth: true });
route('POST', '/api/trade/withdraw', async (req, url, ctx) => {
  const b = await readJson(req);
  const r = await L.withdraw(ctx.session, Number(b.listingId), b.clientId ? Number(b.clientId) : null);
  await L.publish(ctx.session, 'Предложение отозвано', 'Id=' + b.listingId);
  return r;
}, { auth: true });

// --- transactions / projects / reports
route('GET', '/api/transactions', async (req, url, ctx) => await L.transactions(ctx.session, url.searchParams.get('clientId') ? Number(url.searchParams.get('clientId')) : null), { auth: true });
route('GET', '/api/projects', async () => await L.projects(), { auth: true, staff: true });
route('POST', '/api/projects', async (req, url, ctx) => {
  const r = await L.addProject(ctx.session, await readJson(req));
  await L.publish(ctx.session, 'Добавлен инвестпроект', '');
  return r;
}, { auth: true, staff: true });
route('GET', '/api/report', async () => await L.report(), { auth: true, staff: true });

// --- admin
route('POST', '/api/audit', async (req, url, ctx) => {
  const b = await readJson(req);
  await D.audit(ctx.session.Login, String(b.action || 'Действие'), String(b.details || ''));
  L.broadcast({ type: 'changed', action: String(b.action || ''), details: String(b.details || ''), user: ctx.session.Login });
  return { ok: true };
}, { auth: true });
route('GET', '/api/users', async () => await L.users(), { auth: true, admin: true });
route('POST', '/api/users', async (req, url, ctx) => {
  const r = await L.addEmployee(ctx.session, await readJson(req));
  await L.publish(ctx.session, 'Создан сотрудник', '');
  return r;
}, { auth: true, admin: true });
route('DELETE', '/api/users/:id', async (req, url, ctx) => await L.deleteUser(ctx.session, Number(url.params.id)), { auth: true, admin: true });
route('GET', '/api/audit', async () => await L.auditLog(), { auth: true, admin: true });

// ---------------------------------------------------------------- static web app
function serveStatic(req, res, pathname) {
  let file = decodeURIComponent(pathname);
  if (file === '/' || file === '') file = '/index.html';
  const full = path.join(WEB_DIR, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(WEB_DIR)) return send(res, 403, { error: { key: 'e.bad' } });
  fs.stat(full, (e, st) => {
    if (e || !st.isFile()) {
      // SPA fallback: всё, что не файл и не /api — отдаём index.html
      if (pathname.startsWith('/api/')) return send(res, 404, { error: { key: 'e.notfound', pretty: 'Not found' } });
      return fs.readFile(path.join(WEB_DIR, 'index.html'), (e2, data) => {
        if (e2) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
        send(res, 200, data, MIME['.html']);
      });
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    fs.createReadStream(full).pipe(res);
  });
}

// ---------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return send(res, 400, { error: { key: 'e.bad' } }); }

  // live updates (server-sent events) — Web and Desktop see each other's actions instantly
  if (url.pathname === '/api/events') {
    const session = await L.readToken(url.searchParams.get('token'));
    if (!session) return send(res, 401, { error: { key: 'login.fail' } });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 3000\n`);
    res.write(`data: ${JSON.stringify({ type: 'hello', at: L.stamp(), user: session.Login })}\n\n`);
    const unsubscribe = L.subscribe(res);
    const ka = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch { /* closed */ } }, 25000);
    req.on('close', () => { clearInterval(ka); unsubscribe(); });
    return;
  }

  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

  const r = routes.find(x => x.method === req.method && x.re.test(url.pathname));
  if (!r) return send(res, 404, { error: { key: 'e.notfound', pretty: 'Not found: ' + req.method + ' ' + url.pathname } });
  {
    const m = r.re.exec(url.pathname);
    const params = {};
    r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
    url.params = params;
    try {
      const ctx = {};
      if (r.auth) {
        ctx.session = await requireSession(req, url);
        if (r.staff) requireStaff(ctx.session);
        if (r.admin && !L.isAdmin(ctx.session)) throw D.err('e.self', 403);
      }
      const out = await r.handler(req, url, ctx);
      return send(res, 200, out);
    } catch (e) {
      if (e instanceof D.ApiError) {
        if (e.key.startsWith('db.')) console.error('[BankInvest][db]', e.key, e.dbMessage || '', e.hint ? '— ' + e.hint : '');
        return send(res, e.status, { error: { key: e.key, params: e.params, hint: e.hint } });
      }
      if (e && e.key) return send(res, e.status || 400, { error: { key: e.key } });
      console.error('[BankInvest]', req.method, url.pathname, e);
      return send(res, 500, { error: { key: 'e.bad', message: String(e && e.message || e) } });
    }
  }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;

async function start() {
  let info;
  try {
    info = await D.init();
  } catch (e) {
    console.error('─'.repeat(64));
    console.error('  Не удалось подключиться к SQL Server / cannot connect to SQL Server');
    console.error('─'.repeat(64));
    console.error(`  Сервер базы : ${D.SERVER}`);
    console.error(`  База данных : ${D.DATABASE}`);
    console.error(`  Причина     : ${(e && (e.dbMessage || e.message)) || e}`);
    console.error(`  Подсказка   : ${(e && (e.hint || '')) || 'см. ниже'}`);
    console.error('─'.repeat(64));
    console.error('  Проверьте:');
    console.error('   1) служба SQL Server запущена (services.msc -> SQL Server (MSSQLSERVER))');
    console.error('   2) TCP/IP включён, порт 1433 (SQL Server Configuration Manager)');
    console.error('   3) логин и пароль приложения: MSSQL_USER / MSSQL_PASSWORD (setx, затем новое окно cmd)');
    console.error('   4) база BankInvest существует, у логина есть права db_datareader/db_datawriter');
    console.error('  Подробнее: README_RU.md, раздел «SQL Server».');
    console.error('─'.repeat(64));
    process.exit(1);
  }

  // цены «тикают» раз в минуту через usp_UpdatePrices, как таймер в десктопном приложении
  setInterval(async () => {
    try {
      const added = await D.updatePrices();
      if (added > 0) L.broadcast({ type: 'prices', added });
    } catch (e) { console.error('[prices]', e.message); }
  }, 60 * 1000).unref();

  server.listen(PORT, HOST, () => {
    const line = '─'.repeat(64);
    console.log(line);
    console.log('  BankInvest server запущен / started');
    console.log(line);
    console.log(`  Веб-версия      : http://localhost:${PORT}/`);
    console.log(`  REST API        : http://localhost:${PORT}/api`);
    console.log(`  Проверка связи  : http://localhost:${PORT}/api/ping`);
    console.log(`  База данных     : SQL Server, ${info.dbFile}${info.fresh ? ' (создана с демо-данными)' : ''}`);
    console.log(line);
    console.log('  Доступы: admin/admin123 (админ), employee/emp123 (сотрудник),');
    console.log('           client/client123 (клиент), 100200300/client123 (предприятие по УНП)');
    console.log(line);
  });
}

if (require.main === module) {
  start().catch(e => { console.error(e); process.exit(1); });
  const shutdown = async code => {
    try { if (server.listening) server.close(); await D.closePool(); } catch { /* ok */ }
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
}

module.exports = { server, start };
