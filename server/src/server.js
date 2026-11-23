// BankInvest server: one HTTP process that serves
//   * the REST API used by the desktop (WinForms) client   -> /api/*
//   * the web version of the same application              -> /  (static files)
//   * server-sent events for live updates                  -> /api/events
// No npm dependencies: only node:http, node:fs, node:sqlite.
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

function requireSession(req, url) {
  const s = L.readToken(token(req, url));
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
route('GET', '/api/health', () => ({
  ok: true, app: 'BankInvest', version: require('../package.json').version,
  time: D.now(), dbFile: D.DB_FILE, web: '/', api: '/api',
}));

route('GET', '/api/ping', async (req, url, ctx) => {
  const sessions = D.scalar('SELECT COUNT(*) FROM Sessions');
  return {
    ok: true, app: 'BankInvest', time: D.now(), sessions,
    securities: D.scalar('SELECT COUNT(*) FROM Securities'),
    clients: D.scalar('SELECT COUNT(*) FROM Clients'),
    auth: ctx.session ? { login: ctx.session.Login, role: ctx.session.Role } : null,
  };
});

route('GET', '/api/i18n', () => ({ languages: ['ru', 'en', 'be'], dict: i18n }));

route('POST', '/api/auth/login', async (req, url) => {
  const b = await readJson(req);
  return L.login(b.id ?? b.login, b.password, b.mode === 'company' ? 'company' : 'user');
});

route('POST', '/api/auth/register', async (req) => L.register(await readJson(req)));

route('POST', '/api/auth/logout', async (req, url, ctx) => { L.logout(ctx.session); return { ok: true }; }, { auth: true });

route('GET', '/api/auth/me', async (req, url, ctx) => L.sessionPublic(ctx.session), { auth: true });

route('POST', '/api/lang', async (req, url, ctx) => {
  const b = await readJson(req);
  L.setLang(ctx.session, b.lang);
  return { ok: true, lang: Number(b.lang) || 0 };
}, { auth: true });

// --- home / profile
route('GET', '/api/home', async (req, url, ctx) => L.home(ctx.session), { auth: true });
route('GET', '/api/profile', async (req, url, ctx) => L.profile(ctx.session), { auth: true });

// --- clients (staff only)
route('GET', '/api/clients', () => L.clients(), { auth: true, staff: true });
route('GET', '/api/clients/lite', () => L.clientsLite(), { auth: true });
route('POST', '/api/clients', async (req, url, ctx) => {
  const r = L.addClient(await readJson(req));
  L.publish(ctx.session, 'Создан клиент + счёт депо', 'client=' + r.id);
  return r;
}, { auth: true, staff: true });
route('DELETE', '/api/clients/:id', async (req, url, ctx) => L.deleteClient(ctx.session, Number(url.params.id)), { auth: true, staff: true });

// --- portfolio
route('GET', '/api/portfolio', async (req, url, ctx) => L.portfolio(ctx.session, url.searchParams.get('clientId') ? Number(url.searchParams.get('clientId')) : null), { auth: true });
route('POST', '/api/portfolio/targets', async (req, url, ctx) => {
  const b = await readJson(req);
  const r = L.saveTargets(ctx.session, b.clientId ? Number(b.clientId) : null, b.rows);
  L.publish(ctx.session, 'Сохранены целевые доли', 'client=' + (b.clientId ?? ctx.session.ClientId));
  return r;
}, { auth: true });
route('POST', '/api/portfolio/holdings', async (req, url, ctx) => {
  const b = await readJson(req);
  const r = L.addHolding(ctx.session, b);
  L.publish(ctx.session, 'Добавлен актив', String(b.symbol || ''));
  return r;
}, { auth: true, staff: true });

// --- securities / stock page
route('GET', '/api/securities', () => L.securities(), { auth: true });
route('GET', '/api/stock/:symbol', async (req, url) => L.stock(url.params.symbol), { auth: true });
route('GET', '/api/stock/:symbol/chart', async (req, url) => L.chart(url.params.symbol, url.searchParams.get('grain')), { auth: true });
route('GET', '/api/offers', async (req, url, ctx) => L.offers(ctx.session,
  url.searchParams.get('security') || null,
  url.searchParams.get('clientId') ? Number(url.searchParams.get('clientId')) : null), { auth: true });
route('GET', '/api/my-offers', async (req, url, ctx) => L.myOffers(ctx.session, url.searchParams.get('clientId') ? Number(url.searchParams.get('clientId')) : null), { auth: true });
route('GET', '/api/sellable', async (req, url, ctx) => L.sellable(ctx.session, url.searchParams.get('clientId') ? Number(url.searchParams.get('clientId')) : null), { auth: true });

// --- trading
route('POST', '/api/trade/buy', async (req, url, ctx) => {
  const r = L.buy(ctx.session, await readJson(req));
  L.publish(ctx.session, 'Покупка по предложению', `${r.symbol} x${r.qty} @ ${r.price}`);
  return r;
}, { auth: true });
route('POST', '/api/trade/sell', async (req, url, ctx) => {
  const r = L.sell(ctx.session, await readJson(req));
  L.publish(ctx.session, 'Выставлено на продажу', `${r.symbol} x${r.qty} @ ${r.price}`);
  return r;
}, { auth: true });
route('POST', '/api/trade/withdraw', async (req, url, ctx) => {
  const b = await readJson(req);
  const r = L.withdraw(ctx.session, Number(b.listingId), b.clientId ? Number(b.clientId) : null);
  L.publish(ctx.session, 'Предложение отозвано', 'Id=' + b.listingId);
  return r;
}, { auth: true });

// --- transactions / projects / reports
route('GET', '/api/transactions', async (req, url, ctx) => L.transactions(ctx.session, url.searchParams.get('clientId') ? Number(url.searchParams.get('clientId')) : null), { auth: true });
route('GET', '/api/projects', () => L.projects(), { auth: true, staff: true });
route('POST', '/api/projects', async (req, url, ctx) => {
  const r = L.addProject(ctx.session, await readJson(req));
  L.publish(ctx.session, 'Добавлен инвестпроект', '');
  return r;
}, { auth: true, staff: true });
route('GET', '/api/report', () => L.report(), { auth: true, staff: true });

// --- admin
route('POST', '/api/audit', async (req, url, ctx) => {
  const b = await readJson(req);
  D.audit(ctx.session.Login, String(b.action || 'Действие'), String(b.details || ''));
  L.broadcast({ type: 'changed', action: String(b.action || ''), details: String(b.details || ''), user: ctx.session.Login });
  return { ok: true };
}, { auth: true });
route('GET', '/api/users', () => L.users(), { auth: true, admin: true });
route('POST', '/api/users', async (req, url, ctx) => {
  const r = L.addEmployee(ctx.session, await readJson(req));
  L.publish(ctx.session, 'Создан сотрудник', '');
  return r;
}, { auth: true, admin: true });
route('DELETE', '/api/users/:id', async (req, url, ctx) => L.deleteUser(ctx.session, Number(url.params.id)), { auth: true, admin: true });
route('GET', '/api/audit', () => L.auditLog(), { auth: true, admin: true });

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
    const session = L.readToken(url.searchParams.get('token'));
    if (!session) return send(res, 401, { error: { key: 'login.fail' } });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 3000\n`);
    res.write(`data: ${JSON.stringify({ type: 'hello', at: D.now(), user: session.Login })}\n\n`);
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
        ctx.session = requireSession(req, url);
        if (r.staff) requireStaff(ctx.session);
        if (r.admin && !L.isAdmin(ctx.session)) throw D.err('e.self', 403);
      }
      const out = await r.handler(req, url, ctx);
      return send(res, 200, out);
    } catch (e) {
      if (e instanceof D.ApiError) return send(res, e.status, { error: { key: e.key, params: e.params } });
      if (e && e.key) return send(res, e.status || 400, { error: { key: e.key } });
      console.error('[BankInvest]', req.method, url.pathname, e);
      return send(res, 500, { error: { key: 'e.bad', message: String(e && e.message || e) } });
    }
  }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;

function start() {
  const info = D.init();
  // цены «тикают» раз в минуту, как таймер в десктопном приложении
  setInterval(() => {
    try {
      const added = D.updatePrices();
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
    console.log(`  База данных     : ${info.dbFile}${info.fresh ? ' (создана с демо-данными)' : ''}`);
    console.log(line);
    console.log('  Демо-доступы: admin/admin123, employee/employee123, client/client123');
    console.log(line);
  });
}

if (require.main === module) start();

module.exports = { server, start };
