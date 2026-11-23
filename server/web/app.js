/* BankInvest — веб-версия десктопного приложения.
 * Один файл, без сборки и зависимостей: работает в любом современном браузере.
 * Всё общение с сервером — через REST API (/api), поэтому веб-версия и
 * десктопное приложение видят одни и те же данные.
 */
'use strict';

// ═══════════════════════════════════════════════ базовые утилиты
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = {
  dict: {}, lang: 0, session: null, view: 'Home', chartGrain: 1, es: null, live: false,
  clientsLite: [], busy: new Set(), helpIdx: 0,
};
const LANGS = ['ru', 'en', 'be'];

function T(k, ...args) {
  const v = state.dict[k];
  let s = Array.isArray(v) ? (v[state.lang] ?? v[0]) : (v ?? k);
  args.forEach((a, i) => { s = s.replace(new RegExp('\\{' + i + '\\}', 'g'), a); });
  return s;
}
const Col = c => T('col.' + c);
const Val = v => { const k = 'v.' + v; return state.dict[k] ? T(k) : v; };
const nf = (v, d = 2) => Number(v ?? 0).toLocaleString(LANGS[state.lang] === 'be' ? 'be-BY' : LANGS[state.lang] === 'en' ? 'en-US' : 'ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (v, d = 2) => nf(v, d) + ' BYN';
const pct = v => (Number(v) > 0 ? '+' : '') + nf(v) + '%';
const signCls = v => Number(v) > 0 ? 'up' : Number(v) < 0 ? 'down' : 'flat';
const store = {
  get token() { return localStorage.getItem('bankinvest.token') || ''; },
  set token(v) { v ? localStorage.setItem('bankinvest.token', v) : localStorage.removeItem('bankinvest.token'); },
  get lang() { const v = localStorage.getItem('bankinvest.lang'); return v == null ? null : Number(v); },
  set lang(v) { localStorage.setItem('bankinvest.lang', String(v)); },
};

// ═══════════════════════════════════════════════ тосты
function toast(text, kind = 'info', ms = 4200) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `<div>${esc(text)}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, ms);
}
const ok = m => toast(m, 'ok');
const fail = m => toast(m, 'err', 6000);

// ═══════════════════════════════════════════════ модальные окна
function modal({ title, body, footer, wide, narrow, onOpen }) {
  const root = $('#modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''} ${narrow ? 'narrow' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><div class="spacer"></div>
        <button class="btn ghost small" data-close>✕</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  root.appendChild(wrap);
  const close = () => { wrap.remove(); };
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.hasAttribute('data-close')) close(); });
  document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } });
  if (onOpen) onOpen(wrap, close);
  return { el: wrap, close };
}

function confirmDialog(text, title = T('err.title')) {
  return new Promise(resolve => {
    const m = modal({
      title, narrow: true, body: `<p style="margin:0">${esc(text)}</p>`,
      footer: `<button class="btn" data-x="no">${esc(T('cancel'))}</button>
               <button class="btn danger" data-x="yes">${esc(T('ok'))}</button>`,
      onOpen(wrap, close) {
        wrap.querySelector('[data-x=no]').onclick = () => { close(); resolve(false); };
        wrap.querySelector('[data-x=yes]').onclick = () => { close(); resolve(true); };
      },
    });
    return m;
  });
}

/** Promisified form modal: fields → {key: value} */
function formDialog({ title, fields, submitText, submitClass = 'primary' }) {
  return new Promise(resolve => {
    const body = `<div class="form-grid">${fields.map(f => {
      const cls = f.full ? 'full' : '';
      const id = 'f_' + f.key;
      if (f.type === 'select') {
        return `<div class="field ${cls}"><label for="${id}">${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>
          <select id="${id}">${(f.options || []).map(o => `<option value="${esc(o.value)}">${esc(o.text)}</option>`).join('')}</select></div>`;
      }
      if (f.type === 'textarea') {
        return `<div class="field ${cls}"><label for="${id}">${esc(f.label)}</label>
          <textarea id="${id}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea></div>`;
      }
      return `<div class="field ${cls}"><label for="${id}">${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>
        <input id="${id}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}"
          ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''}>
        ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>`;
    }).join('')}</div>`;
    modal({
      title, body,
      footer: `<button class="btn" data-x="cancel">${esc(T('cancel'))}</button>
               <button class="btn ${submitClass}" data-x="ok">${esc(submitText || T('ok'))}</button>`,
      onOpen(wrap, close) {
        const first = wrap.querySelector('input, select, textarea');
        if (first) first.focus();
        wrap.querySelector('[data-x=cancel]').onclick = () => { close(); resolve(null); };
        const submit = () => {
          const out = {};
          for (const f of fields) out[f.key] = (wrap.querySelector('#f_' + f.key)?.value ?? '').trim();
          close(); resolve(out);
        };
        wrap.querySelector('[data-x=ok]').onclick = submit;
        wrap.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));
      },
    });
  });
}

// ═══════════════════════════════════════════════ API
class ApiError extends Error {
  constructor(payload, status) {
    const p = payload && payload.error ? payload.error : payload;
    super(p && p.key ? p.key : 'e.bad');
    this.key = p && p.key;
    this.params = p && p.params;
    this.status = status;
  }
  get text() {
    if (!this.key) return String(this.message);
    let s = T(this.key);
    (this.params || []).forEach((a, i) => { s = s.replace('{' + i + '}', a); });
    return s === this.key ? (this.key === 'e.notfound' ? (state.lang === 1 ? 'Not found' : 'Не найдено') : this.key) : s;
  }
}

async function api(path, { method = 'GET', body, quiet } = {}) {
  const headers = { 'X-BankInvest-Client': 'web' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const tk = state.session?.token || store.token;          // токен из localStorage — чтобы F5 не разлогинивал
  if (tk) headers.Authorization = 'Bearer ' + tk;
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    if (!quiet) fail(state.lang === 1 ? 'Server is unreachable. Is it running?' : 'Сервер недоступен. Он запущен?');
    throw e;
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const e = new ApiError(data, res.status);
    if (res.status === 401 && state.session) { signOutLocal(); }
    if (!quiet) fail(e.text);
    throw e;
  }
  return data;
}

// ═══════════════════════════════════════════════ вход / регистрация
async function boot() {
  try {
    const i = await api('/i18n', { quiet: true });
    state.dict = i.dict;
  } catch { /* сервер недоступен — покажем форму входа, ошибка выскочит при попытке войти */ }
  if (store.lang != null) state.lang = store.lang;
  if (store.token) {
    try {
      state.session = await api('/auth/me', { quiet: true });
      store.token = state.session.token;
      state.lang = state.session.lang ?? state.lang;
      openApp();
      return;
    } catch { store.token = ''; }
  }
  renderLogin();
}

function setLang(l) {
  state.lang = Number(l);
  store.lang = state.lang;
  if (state.session) api('/lang', { method: 'POST', body: { lang: state.lang }, quiet: true }).catch(() => {});
  document.documentElement.lang = LANGS[state.lang];
  if (state.session) renderShell(); else renderLogin();
}

function langBar(onLight) {
  return `<div class="langbar ${onLight ? 'on-light' : ''}">
    <span>${esc(T('lang.label'))}</span>
    ${['Русский', 'English', 'Беларуская'].map((n, i) => `<button data-lang="${i}" class="${i === state.lang ? 'active' : ''}">${n}</button>`).join('')}
  </div>`;
}

function wireLang(root = document) {
  root.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => setLang(b.dataset.lang));
}

function renderLogin(mode = 'user') {
  const company = mode === 'company';
  $('#app').innerHTML = `
  <div class="auth-wrap">
    <div class="card">
      <div class="logo">ASB</div>
      <div class="secure">${esc(T('login.secure'))}</div>
      <div class="band">
        <h1>${esc(T('login.title'))}</h1>
        <p>${esc(T('login.sub'))}</p>
      </div>
      <div class="tabs">
        <button data-tab="company" class="${company ? 'active' : ''}">${esc(T('tab.company'))}</button>
        <button data-tab="user" class="${company ? '' : 'active'}">${esc(T('tab.user'))}</button>
      </div>
      <form class="auth-body" id="login-form" autocomplete="on">
        <div class="field">
          <label for="lg-id">${esc(company ? T('tab.company') : T('tab.user'))} <span class="req">*</span></label>
          <input id="lg-id" name="username" type="text" placeholder="${esc(company ? T('hint.company') : T('hint.user'))}" required autofocus>
        </div>
        <div class="field">
          <label for="lg-pw">${esc(T('lbl.pass'))} <span class="req">*</span></label>
          <input id="lg-pw" name="password" type="password" placeholder="${esc(T('hint.pass'))}" required>
        </div>
      </form>
      <div class="auth-actions">
        <button class="btn primary" id="lg-go">${esc(T('btn.login'))}</button>
        <button class="btn outline" id="lg-reg">${esc(T('btn.register'))}</button>
      </div>
    </div>
    ${langBar(true)}
    <div style="color:rgba(255,255,255,.72);font-size:12px;text-align:center">
      ${state.lang === 1 ? 'Demo: admin / admin123 · employee / emp123 · 100200300 / client123'
        : state.lang === 2 ? 'Дэма: admin / admin123 · employee / emp123 · 100200300 / client123'
        : 'Демо-доступы: admin / admin123 · employee / emp123 · 100200300 / client123'}
    </div>
  </div>`;

  wireLang();
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => renderLogin(b.dataset.tab));
  $('#lg-reg').onclick = () => renderRegister();
  const go = async () => {
    const id = $('#lg-id').value.trim(), password = $('#lg-pw').value;
    const btn = $('#lg-go');
    btn.disabled = true; btn.textContent = '…';
    try {
      state.session = await api('/auth/login', { method: 'POST', body: { id, password, mode } });
      store.token = state.session.token;
      state.lang = state.session.lang ?? state.lang;
      openApp();
    } catch (e) {
      btn.disabled = false; btn.textContent = T('btn.login');
    }
  };
  $('#lg-go').onclick = go;
  $('#login-form').onsubmit = e => { e.preventDefault(); go(); };
}

function renderRegister(payload = { company: true }) {
  const company = payload.company;
  $('#app').innerHTML = `
  <div class="auth-wrap">
    <div class="card wide">
      <div class="band" style="margin-top:0"><h1>${esc(T('reg.title'))}</h1></div>
      <div class="auth-body">
        <div class="label" style="margin-bottom:8px">${esc(T('reg.type'))}</div>
        <div class="radios">
          <label><input type="radio" name="kind" value="company" ${company ? 'checked' : ''}> ${esc(T('reg.company'))}</label>
          <label><input type="radio" name="kind" value="personal" ${company ? '' : 'checked'}> ${esc(T('reg.personal'))}</label>
        </div>
        <form id="reg-form">
          <div class="field"><label>${esc(company ? T('reg.cname') : T('reg.pname'))} <span class="req">*</span></label>
            <input id="rg-name" required></div>
          ${company ? `<div class="field"><label>${esc(T('reg.unp'))} <span class="req">*</span></label><input id="rg-unp" required placeholder="100234567"></div>`
                    : `<div class="field"><label>${esc(T('reg.login'))} <span class="req">*</span></label><input id="rg-login" required></div>`}
          <div class="field"><label>${esc(T('reg.address'))}</label><input id="rg-addr"></div>
          <div class="field"><label>${esc(T('reg.contacts'))}</label><input id="rg-contacts"></div>
          <div class="field"><label>${esc(T('reg.pass'))} <span class="req">*</span></label><input id="rg-pass" type="password" required></div>
          <div class="field"><label>${esc(T('reg.pass2'))} <span class="req">*</span></label><input id="rg-pass2" type="password" required></div>
        </form>
        <div class="auth-actions">
          <button class="btn primary" id="rg-go">${esc(T('reg.submit'))}</button>
          <button class="btn outline" id="rg-back">${esc(T('reg.back'))}</button>
        </div>
      </div>
    </div>
    ${langBar(true)}
  </div>`;
  wireLang();
  document.querySelectorAll('[name=kind]').forEach(r => r.onchange = () => renderRegister({ company: r.value === 'company', ...payload }));
  $('#rg-back').onclick = () => renderLogin(state.lastMode || 'user');
  $('#rg-go').onclick = async () => {
    const b = {
      kind: document.querySelector('[name=kind]:checked').value,
      name: $('#rg-name').value, address: $('#rg-addr').value, contacts: $('#rg-contacts').value,
      password: $('#rg-pass').value, password2: $('#rg-pass2').value,
    };
    if (b.kind === 'company') b.unp = $('#rg-unp').value; else b.login = $('#rg-login').value;
    try {
      const r = await api('/auth/register', { method: 'POST', body: b });
      ok(T('reg.ok'));
      state.lastMode = r.company ? 'company' : 'user';
      renderLogin(state.lastMode);
      setTimeout(() => { const el = $('#lg-id'); if (el) el.value = r.login; }, 30);
    } catch { /* сообщение уже показано */ }
  };
}

// ═══════════════════════════════════════════════ оболочка приложения
const MENU_STAFF = [
  ['Home', 'm.Home', '◉'], ['Clients', 'm.Clients', '👥'], ['Projects', 'm.Projects', '📈'], ['Portfolio', 'm.Portfolio', '💼'],
  ['Transactions', 'm.Transactions', '⇄'], ['Reports', 'm.Reports', '📊'],
];
const MENU_CLIENT = [
  ['Home', 'm.Home', '◉'], ['Portfolio', 'm.MyPortfolio', '💼'], ['Transactions', 'm.History', '⇄'], ['Profile', 'm.Profile', '👤'],
];

function menuItems() {
  const items = state.session.isStaff ? [...MENU_STAFF] : [...MENU_CLIENT];
  if (state.session.isAdmin) items.push(['Admin', 'm.Admin', '⚙']);
  items.push(['Help', 'm.Help', '?']);
  return items;
}

function viewTitle(v) {
  switch (v) {
    case 'Home': return T('m.Home');
    case 'Clients': return T('m.Clients');
    case 'Profile': return T('m.Profile');
    case 'Portfolio': return state.session.isStaff ? T('t.Portfolio') : T('m.MyPortfolio');
    case 'Transactions': return state.session.isStaff ? T('m.Transactions') : T('m.History');
    case 'Projects': return T('t.Projects');
    case 'Reports': return T('t.Reports');
    case 'Admin': return T('t.Admin');
    case 'Help': return T('m.Help');
    default: return v;
  }
}

function openApp() {
  if (!state.session) return renderLogin();
  state.view = 'Home';
  renderShell();
  connectEvents();
}

function signOutLocal() {
  state.session = null;
  store.token = '';
  if (state.es) { state.es.close(); state.es = null; }
  renderLogin();
}

async function doLogout() {
  try { await api('/auth/logout', { method: 'POST', quiet: true }); } catch { }
  signOutLocal();
}

function renderShell() {
  document.documentElement.lang = LANGS[state.lang];
  const s = state.session;
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="brand">${esc(T('bank'))}</div>
      ${menuItems().map(([v, k, ico]) => `<button class="navbtn ${state.view === v ? 'active' : ''}" data-view="${v}">
          <span class="ico">${ico}</span><span>${esc(T(k))}</span></button>`).join('')}
      <button class="navbtn logout" id="btn-logout"><span class="ico">⎋</span><span>${esc(T('m.Logout'))}</span></button>
      ${langBar(false)}
      <div class="side-foot">${esc(s.login)} · ${esc(Val(s.role))}</div>
    </aside>
    <section class="main">
      <div class="top">
        <div class="crumbs">${esc(T('bank'))} &nbsp;&gt;&nbsp; ${esc(viewTitle(state.view))}</div>
        <div class="title-row">
          <div class="title">${esc(viewTitle(state.view))}</div>
          <div class="userchip">
            <span class="dot ${state.live ? 'live' : ''}" title="${state.live ? 'live' : ''}"></span>
            ${esc(s.clientName || s.login)} · ${esc(Val(s.role))}
            <button class="btn ghost small" id="btn-reload" title="F5">⟳</button>
          </div>
        </div>
      </div>
      <div class="actions" id="actions"></div>
      <div class="content" id="content"></div>
    </section>
  </div>`;
  wireLang();
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => navigate(b.dataset.view));
  $('#btn-logout').onclick = doLogout;
  $('#btn-reload').onclick = () => renderView();
  renderView();
}

function navigate(v) {
  if (state.view === v) return renderView();
  state.view = v;
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('.title').textContent = viewTitle(v);
  $('.crumbs').innerHTML = esc(T('bank')) + ' &nbsp;&gt;&nbsp; ' + esc(viewTitle(v));
  renderView();
}

const actionsEl = () => $('#actions') || { innerHTML: '', appendChild() { } };
const contentEl = () => $('#content');

function setActions(html) { const el = $('#actions'); if (el) el.innerHTML = html || ''; }

function loading() { contentEl().innerHTML = `<div class="panel"><div class="panel-body" style="padding:20px">
  ${'<div class="skeleton" style="margin-bottom:12px"></div>'.repeat(6)}</div></div>`; }

/** Загружаем данные раздела, затем рисуем (общая обёртка с индикатором и ошибками) */
async function renderView() {
  const v = state.view;
  setActions('');
  if (!state.session) return;
  loading();
  try {
    switch (v) {
      case 'Home': return await viewHome();
      case 'Clients': return await viewClients();
      case 'Portfolio': return await viewPortfolio();
      case 'Transactions': return await viewTransactions();
      case 'Projects': return await viewProjects();
      case 'Reports': return await viewReports();
      case 'Admin': return await viewAdmin();
      case 'Profile': return await viewProfile();
      case 'Help': return viewHelp();
      case 'Stock': return await viewStock();
      default: contentEl().innerHTML = `<div class="empty-state">${esc(T('nodata'))}</div>`;
    }
  } catch (e) {
    contentEl().innerHTML = `<div class="banner err">${esc(e.text || e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════ Главная
async function viewHome() {
  const d = await api('/home');
  const s = state.session;
  const accent = { blue: 'var(--blue)', green: 'var(--green)', orange: 'var(--orange)', purple: 'var(--purple)' };
  const trend = (rows) => rows.length ? `<div class="table-wrap"><table class="grid">
      <thead><tr><th>${esc(Col('Symbol'))}</th><th>${esc(Col('Name'))}</th><th class="num">${esc(Col('Price'))}</th><th class="num">${esc(Col('Change'))}</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="clickable" data-sym="${esc(r.Symbol)}">
        <td><b>${esc(r.Symbol)}</b></td><td>${esc(r.Name)}</td>
        <td class="num">${nf(r.Price)}</td>
        <td class="num ${signCls(r.Change)}">${Number(r.Change) > 0 ? '▲ ' : Number(r.Change) < 0 ? '▼ ' : ''}${pct(r.Change)}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty-state" style="box-shadow:none">${esc(T('nodata'))}</div>`;

  contentEl().innerHTML = `
    <div class="hello">
      <h2>${esc(T('home.hello').split('\n')[0].replace('{0}', s.login).replace('{1}', Val(s.role)))}</h2>
      <p>${esc(T('home.hint'))}</p>
    </div>
    <div class="kpis">${d.kpis.map(k => `<div class="kpi" style="--accent:${accent[k.accent] || 'var(--green)'}">
        <div class="v">${esc(k.value)}</div><div class="c">${esc(T(k.key))}</div></div>`).join('')}
    </div>
    <div class="two-col">
      <div><div class="trend-title up">${esc(T('home.up'))}</div><div class="panel">${trend(d.up)}</div></div>
      <div><div class="trend-title down">${esc(T('home.down'))}</div><div class="panel">${trend(d.down)}</div></div>
    </div>`;
  document.querySelectorAll('[data-sym]').forEach(el => el.onclick = () => openStock(el.dataset.sym));
}

// ═══════════════════════════════════════════════ Клиенты
async function viewClients() {
  const rows = await api('/clients');
  setActions(`
    <button class="btn primary" id="ac-add">＋ ${esc(T('b.AddClient'))}</button>
    ${state.session.isAdmin ? `<button class="btn" id="ac-del">🗑 ${esc(T('b.Delete'))}</button>` : ''}
    <button class="btn" id="ac-exp">⤓ ${esc(T('b.Export'))}</button>`);
  const cols = ['Name', 'UNP', 'Address', 'Contacts', 'Status', 'Kind', 'Depo'];
  contentEl().innerHTML = `<div class="panel"><div class="table-wrap"><table class="grid">
    <thead><tr>${cols.map(c => `<th>${esc(Col(c))}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr data-id="${r.Id}">
      ${cols.map(c => `<td>${c === 'Status' || c === 'Kind' ? `<span class="pill ${r[c] === 'Активен' ? 'ok' : ''}">${esc(Val(r[c]))}</span>` : esc(r[c] ?? '')}</td>`).join('')}
    </tr>`).join('') || `<tr><td class="empty" colspan="${cols.length}">${esc(T('nodata'))}</td></tr>`}
    </tbody></table></div></div>`;

  let selected = null;
  document.querySelectorAll('tbody tr[data-id]').forEach(tr => tr.onclick = () => {
    document.querySelectorAll('tbody tr').forEach(x => x.style.background = '');
    tr.style.background = '#e9f6f1'; selected = Number(tr.dataset.id);
  });
  $('#ac-exp') && ($('#ac-exp').onclick = () => exportCsv('clients', cols.map(Col), rows.map(r => cols.map(c => r[c] ?? ''))));

  const add = $('#ac-add');
  if (add) add.onclick = async () => {
    const v = await formDialog({
      title: T('p.NewClient'),
      fields: [
        { key: 'name', label: Col('Name'), required: true, full: true },
        { key: 'unp', label: T('reg.unp'), required: true },
        { key: 'password', label: T('reg.pass'), type: 'password', required: true },
        { key: 'address', label: T('reg.address'), full: true },
        { key: 'contacts', label: T('reg.contacts'), full: true },
      ],
      submitText: T('b.AddClient'),
    });
    if (!v) return;
    try { await api('/clients', { method: 'POST', body: v }); ok(T('e.saved')); renderView(); } catch { }
  };
  const del = $('#ac-del');
  if (del) del.onclick = async () => {
    if (!selected) return fail(state.lang === 1 ? 'Select a client first' : 'Сначала выберите клиента');
    if (!await confirmDialog(T('e.delclient'), T('e.cascade'))) return;
    try { await api('/clients/' + selected, { method: 'DELETE' }); ok(T('e.saved')); renderView(); } catch { }
  };
}

// ═══════════════════════════════════════════════ Портфель
const pfState = { clientId: null, data: null };

async function viewPortfolio() {
  const staff = state.session.isStaff;
  if (staff && pfState.clientId == null) {
    if (!state.clientsLite.length) state.clientsLite = await api('/clients/lite');
    pfState.clientId = state.clientsLite[0]?.Id ?? null;
  }
  const q = staff ? '?clientId=' + pfState.clientId : '';
  const d = await api('/portfolio' + q);
  pfState.data = d;

  setActions(`
    ${staff ? `<select id="pf-client" style="min-width:230px">${state.clientsLite.map(c =>
        `<option value="${c.Id}" ${c.Id === pfState.clientId ? 'selected' : ''}>${esc(c.Name)}</option>`).join('')}</select>
      <button class="btn" id="pf-add">＋ ${esc(T('b.AddHolding'))}</button>` : ''}
    <button class="btn primary" id="pf-buy">${esc(T('b.Buy'))}</button>
    <button class="btn danger" id="pf-sell">${esc(T('b.Sell'))}</button>
    <button class="btn" id="pf-offers">${esc(T('b.MyOffers'))}</button>
    <button class="btn" id="pf-exp">⤓ ${esc(T('b.Export'))}</button>
    <div class="spacer"></div>
    <button class="btn primary" id="pf-save">${esc(T('b.Save'))}</button>`);

  const cols = ['Symbol', 'Name', 'Segment', 'Qty', 'ForSale', 'Price', 'ExpenseRatio', 'CurrentValue', 'CurrentPct', 'TargetPct', 'TargetValue', 'Amount'];
  contentEl().innerHTML = `
    <div class="panel">
      <div class="table-wrap"><table class="grid" id="pf-table">
        <thead><tr>${cols.map(c => `<th class="${['Qty', 'ForSale', 'Price', 'ExpenseRatio', 'CurrentValue', 'CurrentPct', 'TargetPct', 'TargetValue', 'Amount'].includes(c) ? 'num' : ''}">${esc(Col(c))}</th>`).join('')}</tr></thead>
        <tbody>${d.rows.map(r => `<tr data-id="${r.Id}" data-sym="${esc(r.Symbol)}">
          <td><a href="#" class="sym-link"><b>${esc(r.Symbol)}</b></a></td>
          <td>${esc(r.Name)}</td>
          <td>${esc(r.Segment)}</td>
          <td class="num">${nf(r.Qty, 0)}</td>
          <td class="num ${r.ForSale > 0 ? 'up' : 'flat'}">${nf(r.ForSale, 0)}</td>
          <td class="num">${nf(r.Price)}</td>
          <td class="num">${nf(r.ExpenseRatio)}</td>
          <td class="num">${nf(r.CurrentValue)}</td>
          <td class="num">${nf(r.CurrentPct)}%</td>
          <td class="num"><input type="number" min="0" max="100" step="0.01" value="${r.TargetPct ?? ''}" data-tp="${r.Id}"></td>
          <td class="num tp-val" data-tv="${r.Id}">${nf(r.TargetValue)}</td>
          <td class="num amt-val" data-amt="${r.Id}">${r.Amount > 0 ? '↑ ' : r.Amount < 0 ? '↓ ' : '= '}${nf(Math.abs(r.Amount))}</td>
        </tr>`).join('') || `<tr><td class="empty" colspan="${cols.length}">${esc(T('nodata'))}</td></tr>`}
        </tbody></table></div>
      <div class="total-line" id="pf-total"></div>
    </div>`;

  const updateTotals = () => {
    const t = pfState.data;
    $('#pf-total').innerHTML = `${esc(T('k.pv'))}: <b>${nf(t.total)}</b> &nbsp;·&nbsp;
      ${esc(T('col.TargetValue'))}: <b>${nf(t.targetValue)}</b> &nbsp;·&nbsp;
      ${esc(T('col.TargetPct'))}: <b>${nf(t.targetPctSum)}%</b> &nbsp;·&nbsp;
      ${esc(T('col.Amount'))}: <b class="${signCls(t.diff)}">${nf(t.diff)}</b>`;
  };
  updateTotals();

  // пересчёт «здесь и сейчас», как в десктопе (Recalc)
  const recalc = () => {
    const rows = pfState.data.rows;
    const total = rows.reduce((a, r) => a + Number(r.CurrentValue || 0), 0);
    for (const r of rows) {
      const tp = r.TargetPct == null ? 0 : Number(r.TargetPct);
      r.CurrentPct = total ? Math.round(Number(r.CurrentValue) / total * 10000) / 100 : 0;
      r.TargetValue = Math.round(total * tp / 100 * 100) / 100;
      r.Amount = Math.round((Number(r.TargetValue) - Number(r.CurrentValue)) * 100) / 100;
    }
    const tv = rows.reduce((a, r) => a + Number(r.TargetValue || 0), 0);
    pfState.data.total = Math.round(total * 100) / 100;
    pfState.data.targetValue = Math.round(tv * 100) / 100;
    pfState.data.targetPctSum = rows.reduce((a, r) => a + (r.TargetPct == null ? 0 : Number(r.TargetPct)), 0);
    pfState.data.diff = Math.round((tv - total) * 100) / 100;
    for (const r of rows) {
      const tvEl = document.querySelector(`[data-tv="${r.Id}"]`);
      const amtEl = document.querySelector(`[data-amt="${r.Id}"]`);
      if (tvEl) tvEl.textContent = nf(r.TargetValue);
      if (amtEl) {
        amtEl.textContent = (r.Amount > 0 ? '↑ ' : r.Amount < 0 ? '↓ ' : '= ') + nf(Math.abs(r.Amount));
        amtEl.className = 'num amt-val ' + signCls(r.Amount);
      }
    }
    updateTotals();
  };

  document.querySelectorAll('[data-tp]').forEach(inp => {
    inp.oninput = () => {
      const row = pfState.data.rows.find(r => r.Id === Number(inp.dataset.tp));
      if (!row) return;
      row.TargetPct = inp.value === '' ? null : Math.max(0, Math.min(100, Number(inp.value)));
      recalc();
    };
  });
  document.querySelectorAll('.sym-link').forEach(a => a.onclick = e => { e.preventDefault(); openStock(a.closest('tr').dataset.sym); });

  const clientParam = staff ? pfState.clientId : null;
  if (staff) $('#pf-client').onchange = e => { pfState.clientId = Number(e.target.value); renderView(); };
  $('#pf-buy').onclick = () => openBuy();
  $('#pf-sell').onclick = () => openSell();
  $('#pf-offers').onclick = () => openOffers();
  $('#pf-exp').onclick = () => exportCsv('portfolio', cols.map(Col), pfState.data.rows.map(r => cols.map(c => r[c] ?? '')));
  $('#pf-save').onclick = async () => {
    const sum = pfState.data.rows.reduce((a, r) => a + (r.TargetPct == null ? 0 : Number(r.TargetPct)), 0);
    if (sum > 100) return fail(T('e.sum100'));
    try {
      await api('/portfolio/targets', { method: 'POST', body: { clientId: clientParam, rows: pfState.data.rows.map(r => ({ id: r.Id, targetPct: r.TargetPct })) } });
      ok(T('e.saved'));
      renderView();
    } catch { }
  };
  if (staff) $('#pf-add').onclick = async () => {
    const v = await formDialog({
      title: T('b.AddHolding'),
      fields: [{ key: 'symbol', label: Col('Symbol'), required: true, value: '', placeholder: 'ASB-EQ-BNB' },
               { key: 'qty', label: T('p.Qty'), type: 'number', min: 1, value: '1', required: true }],
      submitText: T('b.AddHolding'),
    });
    if (!v) return;
    try { await api('/portfolio/holdings', { method: 'POST', body: { ...v, clientId: pfState.clientId } }); ok(T('e.saved')); renderView(); } catch { }
  };
}

// ═══════════════════════════════════════════════ сделки
function clientIdParam() { return state.session.isStaff ? pfState.clientId : null; }

async function openBuy(presetSymbol) {
  const clientId = clientIdParam();                       // null → сервер возьмёт клиента из сессии
  if (state.session.isStaff && !clientId) return fail(T('e.noaccount'));
  const [secs, offers] = await Promise.all([api('/securities'), api('/offers' + (clientId ? '?clientId=' + clientId : ''))]);
  let list = offers.slice().sort((a, b) => a.Symbol.localeCompare(b.Symbol) || a.Price - b.Price);
  let selected = presetSymbol ? list.find(o => o.Symbol === presetSymbol) : null;

  const m = modal({
    title: T('buy.title'), wide: true,
    body: `
      <div class="field"><label>${esc(Col('Security'))}</label>
        <select id="buy-sec"><option value="">${esc(T('b.all'))}</option>
        ${secs.map(s => `<option value="${esc(s.Symbol)}" ${presetSymbol === s.Symbol ? 'selected' : ''}>${esc(s.Symbol)} — ${esc(s.Name)}</option>`).join('')}</select></div>
      <div class="label" style="margin:12px 0 6px">${esc(T('buy.pick'))}</div>
      <div class="table-wrap" style="max-height:280px;border:1px solid var(--line);border-radius:4px">
        <table class="grid" id="buy-table">
          <thead><tr><th>${esc(Col('Seller'))}</th><th>${esc(Col('Symbol'))}</th><th>${esc(Col('Available'))}</th>
            <th class="num">${esc(Col('Price'))}</th><th class="num">${esc(Col('VsMarket'))}</th></tr></thead>
          <tbody></tbody></table></div>
      <div class="form-grid" style="margin-top:14px">
        <div><div class="field"><label>${esc(T('p.Qty'))}</label><input id="buy-qty" type="number" min="1" value="1"></div>
          <div class="hint" id="buy-avail"></div></div>
        <div class="summary" id="buy-sum"></div>
      </div>`,
    footer: `<button class="btn" data-x="c">${esc(T('cancel'))}</button>
             <button class="btn primary" id="buy-go" disabled>${esc(T('b.Buy'))}</button>`,
    onOpen(wrap, close) {
      const table = wrap.querySelector('#buy-table tbody');
      const qtyInput = wrap.querySelector('#buy-qty');
      const sum = wrap.querySelector('#buy-sum');
      const goBtn = wrap.querySelector('#buy-go');
      const avail = wrap.querySelector('#buy-avail');

      const paint = () => {
        table.innerHTML = list.length ? list.map(o => `<tr data-id="${o.Id}" class="${selected && selected.Id === o.Id ? 'sel' : ''}" style="${selected && selected.Id === o.Id ? 'background:#e9f6f1' : ''}">
            <td>${esc(Val(o.Seller))}</td><td><b>${esc(o.Symbol)}</b></td><td class="num">${nf(o.Available, 0)}</td>
            <td class="num">${nf(o.Price)}</td>
            <td class="num ${signCls(-o.VsMarket)}">${o.VsMarket == null ? '' : pct(o.VsMarket)}</td></tr>`).join('')
          : `<tr><td class="empty" colspan="5">${esc(T('buy.empty'))}</td></tr>`;
        table.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => {
          selected = list.find(o => o.Id === Number(tr.dataset.id));
          qtyInput.max = selected.Available; if (Number(qtyInput.value) > selected.Available) qtyInput.value = selected.Available;
          paint(); upd();
        });
      };
      const upd = () => {
        if (!selected) { sum.innerHTML = ''; goBtn.disabled = true; avail.textContent = T('buy.empty'); return; }
        let q = Math.floor(Number(qtyInput.value) || 0);
        if (q < 1) q = 1;
        if (q > selected.Available) q = selected.Available;
        qtyInput.value = q;
        const amount = selected.Price * q, comm = Math.round(amount * 0.005 * 100) / 100, total = amount + comm;
        avail.textContent = T('buy.avail').replace('{0}', nf(selected.Available, 0));
        sum.innerHTML = `
          <div class="k">${esc(T('o.price'))}</div><div class="v">${money(selected.Price)}</div>
          <div class="k">${esc(T('o.amount'))}</div><div class="v">${money(amount)}</div>
          <div class="k">${esc(T('o.comm'))}</div><div class="v">${money(comm)}</div>
          <div class="k total">${esc(T('o.pay'))}</div><div class="v total">${money(total)}</div>`;
        goBtn.disabled = !(q >= 1 && q <= selected.Available);
      };
      qtyInput.oninput = upd;
      wrap.querySelector('#buy-sec').onchange = e => {
        const sym = e.target.value;
        const all = offers.slice().sort((a, b) => a.Symbol.localeCompare(b.Symbol) || a.Price - b.Price);
        list = sym ? all.filter(o => o.Symbol === sym) : all;
        selected = list[0] || null;
        paint(); upd();
      };
      if (!selected && list.length) selected = list[0];
      paint(); upd();
      wrap.querySelector('[data-x="c"]').onclick = close;
      goBtn.onclick = async () => {
        try {
          const r = await api('/trade/buy', { method: 'POST', body: { listingId: selected.Id, qty: Number(qtyInput.value), clientId } });
          close();
          ok(T('buy.ok').replace('{0}', r.qty).replace('{1}', r.symbol));
          setTimeout(() => refreshAfterTrade(), 60);
        } catch { }
      };
    },
  });
  return m;
}

async function openSell(presetSymbol) {
  const clientId = clientIdParam();
  if (state.session.isStaff && !clientId) return fail(T('e.noaccount'));
  const rows = (await api('/sellable' + (clientId ? '?clientId=' + clientId : ''))).filter(r => r.Free > 0);
  if (!rows.length) return fail(T('sell.none'));
  let row = rows.find(r => r.Symbol === presetSymbol) || rows[0];

  modal({
    title: T('sell.title'),
    body: `
      <div class="field"><label>${esc(Col('Security'))}</label>
        <select id="sell-sec">${rows.map(r => `<option value="${r.Id}" ${r.Id === row.Id ? 'selected' : ''}>${esc(r.Symbol)} — ${esc(r.Name)} (${nf(r.Free, 0)})</option>`).join('')}</select></div>
      <div class="form-grid">
        <div class="field"><label>${esc(T('p.Qty'))}</label><input id="sell-qty" type="number" min="1" value="1"></div>
        <div class="field"><label>${esc(T('sell.price'))}</label><input id="sell-price" type="number" min="0.01" step="0.10" value="${nf(row.Price)}"></div>
      </div>
      <div class="hint" id="sell-free" style="margin-bottom:10px"></div>
      <div class="hint" id="sell-market" style="margin-bottom:12px"></div>
      <div class="summary" id="sell-sum"></div>`,
    footer: `<button class="btn" data-x="c">${esc(T('cancel'))}</button>
             <button class="btn danger" id="sell-go">${esc(T('sell.submit'))}</button>`,
    onOpen(wrap, close) {
      const qty = wrap.querySelector('#sell-qty'), price = wrap.querySelector('#sell-price');
      const sum = wrap.querySelector('#sell-sum'), goBtn = wrap.querySelector('#sell-go');
      const freeLbl = wrap.querySelector('#sell-free'), marketLbl = wrap.querySelector('#sell-market');

      const upd = () => {
        const q = Math.floor(Number(qty.value) || 0), p = Number(price.value) || 0;
        const amount = p * q, comm = Math.round(amount * 0.005 * 100) / 100;
        const diff = row.Price ? (p - row.Price) / row.Price * 100 : 0;
        const priceOk = p >= row.Price * 0.3 && p <= row.Price * 3 && p > 0;
        freeLbl.textContent = T('sell.free').replace('{0}', nf(row.Free, 0));
        marketLbl.innerHTML = `<span class="${priceOk ? '' : 'down'}">${esc(T('sell.market').replace('{0}', nf(row.Price)))} (${nf(diff, 1)}%)</span>`;
        sum.innerHTML = `
          <div class="k">${esc(T('o.amount'))}</div><div class="v">${money(amount)}</div>
          <div class="k">${esc(T('o.comm'))}</div><div class="v">${money(comm)}</div>
          <div class="k total red">${esc(T('o.receive'))}</div><div class="v total">${money(amount - comm)}</div>`;
        goBtn.disabled = !(q >= 1 && q <= row.Free && priceOk);
      };
      qty.oninput = price.oninput = upd;
      wrap.querySelector('#sell-sec').onchange = e => {
        row = rows.find(r => r.Id === Number(e.target.value));
        qty.max = row.Free; price.value = nf(row.Price).replace(/\s/g, '');
        if (Number(qty.value) > row.Free) qty.value = row.Free;
        upd();
      };
      upd();
      wrap.querySelector('[data-x="c"]').onclick = close;
      goBtn.onclick = async () => {
        try {
          const r = await api('/trade/sell', { method: 'POST', body: { securityId: row.Id, qty: Number(qty.value), price: Number(price.value), clientId } });
          close();
          ok(T('sell.ok').replace('{0}', r.qty).replace('{1}', nf(r.price)));
          setTimeout(() => refreshAfterTrade(), 60);
        } catch { }
      };
    },
  });
}

async function openOffers() {
  const clientId = clientIdParam();
  const rows = await api('/my-offers' + (clientId ? '?clientId=' + clientId : ''));
  modal({
    title: T('offers.title'), wide: true,
    body: `<div class="table-wrap" style="border:1px solid var(--line);border-radius:4px">
      <table class="grid" id="of-table">
        <thead><tr><th>${esc(Col('Symbol'))}</th><th>${esc(Col('Name'))}</th><th class="num">${esc(Col('Qty'))}</th>
          <th class="num">${esc(Col('Price'))}</th><th>${esc(Col('CreatedAt'))}</th></tr></thead>
        <tbody>${rows.map(r => `<tr data-id="${r.Id}"><td><b>${esc(r.Symbol)}</b></td><td>${esc(r.Name)}</td>
          <td class="num">${nf(r.Qty, 0)}</td><td class="num">${nf(r.Price)}</td><td>${esc(String(r.CreatedAt).replace('T', ' ').slice(0, 16))}</td></tr>`).join('')
          || `<tr><td class="empty" colspan="5">${esc(T('nodata'))}</td></tr>`}</tbody></table></div>`,
    footer: `<button class="btn" data-x="c">${esc(T('b.Close'))}</button>
             <button class="btn danger" id="of-withdraw">${esc(T('b.Withdraw'))}</button>`,
    onOpen(wrap, close) {
      let selected = null;
      wrap.querySelectorAll('#of-table tbody tr[data-id]').forEach(tr => tr.onclick = () => {
        wrap.querySelectorAll('#of-table tbody tr').forEach(x => x.style.background = '');
        tr.style.background = '#e9f6f1'; selected = Number(tr.dataset.id);
      });
      wrap.querySelector('[data-x="c"]').onclick = close;
      wrap.querySelector('#of-withdraw').onclick = async () => {
        if (!selected) return fail(state.lang === 1 ? 'Select an offer' : 'Выберите предложение');
        try {
          await api('/trade/withdraw', { method: 'POST', body: { listingId: selected, clientId } });
          ok(T('e.saved')); close(); setTimeout(refreshAfterTrade, 60);
        } catch { }
      };
    },
  });
}

function refreshAfterTrade() {
  if (state.view === 'Portfolio' || state.view === 'Home' || state.view === 'Transactions') renderView();
  else if (state.view === 'Stock') renderView();
}

// ═══════════════════════════════════════════════ страница бумаги
let currentStockSymbol = null;

function openStock(symbol) {
  currentStockSymbol = symbol;
  state.view = 'Stock';
  state.chartGrain = 1;
  document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
  $('.title').textContent = symbol;
  $('.crumbs').innerHTML = esc(T('bank')) + ' &nbsp;&gt;&nbsp; ' + esc(T('m.Home')) + ' &nbsp;&gt;&nbsp; ' + esc(symbol);
  renderView();
}

async function viewStock() {
  const symbol = currentStockSymbol;
  if (!symbol) { state.view = 'Home'; return renderView(); }
  const grain = state.chartGrain;
  const [sec, chart, offers] = await Promise.all([
    api('/stock/' + encodeURIComponent(symbol)),
    api('/stock/' + encodeURIComponent(symbol) + '/chart?grain=' + grain),
    api('/offers?security=' + encodeURIComponent(symbol)),
  ]);
  const chg = sec.PrevPrice ? (sec.Price - sec.PrevPrice) / sec.PrevPrice * 100 : 0;

  setActions(`<button class="btn" id="st-back">← ${esc(T('m.Home'))}</button><div class="spacer"></div>
    <button class="btn primary" id="st-buy">${esc(T('b.Buy'))}</button>
    <button class="btn danger" id="st-sell">${esc(T('b.Sell'))}</button>`);
  contentEl().innerHTML = `
    <div class="stock-head">
      <div class="row" style="gap:10px"><span class="sym">${esc(sec.Symbol)}</span><span class="nm">${esc(sec.Name)}</span></div>
      <div class="meta">${esc(T('s.issuer'))}: ${esc(sec.Issuer)} &nbsp;·&nbsp; ${esc(Val(sec.Kind))} / ${esc(sec.Segment)}
        &nbsp;·&nbsp; ${esc(T('s.nominal'))}: ${nf(sec.Nominal)} &nbsp;·&nbsp; ${esc(T('s.rate'))}: ${nf(sec.Rate)}
        &nbsp;·&nbsp; ${esc(T('s.volume'))}: ${nf(sec.Volume, 0)}</div>
      <div class="price-line">
        <span class="price">${money(sec.Price)}</span>
        <span class="chg ${signCls(chg)}">${chg > 0 ? '▲ ' : chg < 0 ? '▼ ' : ''}${nf(chg)}% (24h)</span>
      </div>
    </div>
    <div class="grain">
      ${[0, 1, 2, 3, 4].map(i => `<button data-grain="${i}" class="${i === grain ? 'active' : ''}">${esc(T(['s.hours', 's.days', 's.weeks', 's.months', 's.years'][i]))}</button>`).join('')}
      <span id="st-stats" class="muted mono" style="margin-left:8px"></span>
    </div>
    <div class="chart-box"><canvas id="chart"></canvas><div class="chart-stats" id="chart-stats"></div></div>
    <div class="panel" style="margin-top:18px">
      <div class="panel-head"><h3>${esc(T('s.offers'))}</h3><span class="hint">${esc(T('s.hint'))}</span></div>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>${esc(Col('Seller'))}</th><th class="num">${esc(Col('Available'))}</th>
          <th class="num">${esc(Col('Price'))}</th><th class="num">${esc(Col('VsMarket'))}</th><th></th></tr></thead>
        <tbody>${offers.map(o => `<tr>
          <td>${esc(Val(o.Seller))}</td><td class="num">${nf(o.Available, 0)}</td>
          <td class="num">${nf(o.Price)}</td>
          <td class="num ${signCls(-o.VsMarket)}">${pct(o.VsMarket)}</td>
          <td class="right"><button class="btn small" data-buy="${o.Id}">${esc(T('b.Buy'))}</button></td></tr>`).join('')
          || `<tr><td class="empty" colspan="5">${esc(T('nodata'))}</td></tr>`}</tbody></table></div>
    </div>`;

  document.querySelectorAll('[data-grain]').forEach(b => b.onclick = () => { state.chartGrain = Number(b.dataset.grain); renderView(); });
  $('#st-back').onclick = () => { state.view = 'Home'; renderShell(); };
  $('#st-buy').onclick = () => openBuy(symbol);
  $('#st-sell').onclick = () => openSell(symbol);
  document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => openBuyForOffer(Number(b.dataset.buy)));
  drawChart(chart.points, grain);
}

async function openBuyForOffer(listingId) {
  // открываем окно покупки с уже выбранным предложением
  await openBuy(currentStockSymbol);
  setTimeout(() => {
    const row = document.querySelector(`#buy-table tr[data-id="${listingId}"]`);
    if (row) row.click();
  }, 80);
}

function drawChart(points, grain) {
  const canvas = $('#chart');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 800, H = canvas.clientHeight || 320;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const stats = $('#chart-stats');
  const padL = 66, padR = 18, padT = 16, padB = 34;
  const plot = { x: padL, y: padT, w: Math.max(20, W - padL - padR), h: Math.max(20, H - padT - padB) };

  const fmtAxis = i => {
    const t = points[i].t;
    if (grain === 0) { const d = new Date(t.replace(' ', 'T')); return d.toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    if (grain === 1 || grain === 2) { const p = t.split('-'); return p[2] + '.' + p[1]; }
    if (grain === 3) { const p = t.split('-'); return p[1] + '.' + p[0]; }
    return t;
  };
  const fmtTip = i => {
    const t = points[i].t;
    if (grain === 0) { const d = new Date(t.replace(' ', 'T')); return d.toLocaleString(); }
    return t;
  };

  if (!points.length) {
    g.fillStyle = '#7a8794'; g.font = '14px "Segoe UI", sans-serif'; g.textAlign = 'center';
    g.fillText(T('s.nodata'), W / 2, H / 2);
    stats.textContent = '';
    return;
  }
  const prices = points.map(p => Number(p.p));
  const mn = Math.min(...prices), mx = Math.max(...prices);
  let pad = (mx - mn) * 0.12; if (!pad) pad = Math.max(0.01, mx * 0.01);
  const lo = mn - pad, hi = mx + pad;
  const X = i => points.length === 1 ? plot.x + plot.w / 2 : plot.x + (i / (points.length - 1)) * plot.w;
  const Y = p => plot.y + plot.h - ((p - lo) / (hi - lo)) * plot.h;
  const up = prices[prices.length - 1] >= prices[0];
  const color = up ? '#22a05a' : '#cd3c37';

  // сетка + подписи цен
  g.strokeStyle = '#e8edf2'; g.lineWidth = 1; g.fillStyle = '#7a8794'; g.font = '11px "Segoe UI", sans-serif'; g.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = plot.y + plot.h * i / 4;
    g.beginPath(); g.moveTo(plot.x, y); g.lineTo(plot.x + plot.w, y); g.stroke();
    g.fillText(nf(hi - (hi - lo) * i / 4), plot.x - 8, y + 4);
  }
  // подписи времени
  g.textAlign = 'center';
  const ticks = Math.min(6, points.length);
  for (let k = 0; k < ticks; k++) {
    const i = ticks === 1 ? 0 : Math.round(k * (points.length - 1) / (ticks - 1));
    const x = X(i);
    g.strokeStyle = '#e8edf2'; g.beginPath(); g.moveTo(x, plot.y + plot.h); g.lineTo(x, plot.y + plot.h + 4); g.stroke();
    g.fillText(fmtAxis(i), Math.max(24, Math.min(x, W - 24)), plot.y + plot.h + 18);
  }
  // область + линия
  if (points.length > 1) {
    const grad = g.createLinearGradient(0, plot.y, 0, plot.y + plot.h);
    grad.addColorStop(0, up ? 'rgba(34,160,90,.30)' : 'rgba(205,60,55,.30)');
    grad.addColorStop(1, up ? 'rgba(34,160,90,.02)' : 'rgba(205,60,55,.02)');
    g.beginPath();
    g.moveTo(X(0), Y(prices[0]));
    for (let i = 1; i < prices.length; i++) g.lineTo(X(i), Y(prices[i]));
    g.lineTo(X(prices.length - 1), plot.y + plot.h); g.lineTo(X(0), plot.y + plot.h); g.closePath();
    g.fillStyle = grad; g.fill();
    g.beginPath();
    g.moveTo(X(0), Y(prices[0]));
    for (let i = 1; i < prices.length; i++) g.lineTo(X(i), Y(prices[i]));
    g.strokeStyle = color; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
  }
  if (points.length <= 40) {
    for (let i = 0; i < prices.length; i++) {
      g.beginPath(); g.arc(X(i), Y(prices[i]), 3, 0, Math.PI * 2);
      g.fillStyle = '#fff'; g.fill(); g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
    }
  }

  const first = prices[0], last = prices[prices.length - 1];
  const chg = first ? (last - first) / first * 100 : 0;
  stats.innerHTML = `<span>${esc(T('s.low'))}: ${nf(mn)}</span><span>${esc(T('s.high'))}: ${nf(mx)}</span>
    <span class="${signCls(chg)}">${esc(T('s.period'))}: ${nf(chg)}%</span>`;

  // подсказка при наведении
  const tip = document.createElement('div');
  Object.assign(tip.style, {
    position: 'absolute', pointerEvents: 'none', background: 'rgba(40,55,71,.94)', color: '#fff',
    padding: '6px 9px', borderRadius: '4px', font: '12px "Segoe UI", sans-serif', display: 'none', whiteSpace: 'nowrap', zIndex: 5,
  });
  canvas.parentElement.style.position = 'relative';
  canvas.parentElement.appendChild(tip);
  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const mx2 = e.clientX - rect.left;
    let best = 0, bd = Infinity;
    for (let i = 0; i < points.length; i++) { const d = Math.abs(X(i) - mx2); if (d < bd) { bd = d; best = i; } }
    tip.style.display = 'block';
    tip.innerHTML = `${esc(fmtTip(best))}<br><b>${money(prices[best])}</b>`;
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(2, Math.min(X(best) + 12, W - tw - 4)) + 'px';
    tip.style.top = Math.max(2, Y(prices[best]) - 44) + 'px';
  };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
}

// ═══════════════════════════════════════════════ Транзакции
async function viewTransactions() {
  const staff = state.session.isStaff;
  if (staff && pfState.clientId == null) {
    if (!state.clientsLite.length) state.clientsLite = await api('/clients/lite');
    pfState.clientId = state.clientsLite[0]?.Id ?? null;
  }
  const rows = await api('/transactions' + (staff && pfState.clientId ? '?clientId=' + pfState.clientId : ''));
  const cols = ['Date', 'Client', 'Security', 'Type', 'Qty', 'Price', 'Commission', 'Status'];
  setActions(`${staff ? `<select id="tx-client" style="min-width:230px">
      <option value="">${esc(T('b.all'))}</option>
      ${state.clientsLite.map(c => `<option value="${c.Id}" ${c.Id === pfState.clientId ? 'selected' : ''}>${esc(c.Name)}</option>`).join('')}</select>` : ''}
    <button class="btn" id="tx-exp">⤓ ${esc(T('b.Export'))}</button>`);
  contentEl().innerHTML = `<div class="panel"><div class="table-wrap"><table class="grid">
    <thead><tr>${cols.map(c => `<th class="${['Qty', 'Price', 'Commission'].includes(c) ? 'num' : ''}">${esc(Col(c === 'Date' ? 'Date' : c))}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td>${esc(String(r.Date).replace('T', ' ').slice(0, 16))}</td>
      <td>${esc(r.Client)}</td><td><b>${esc(r.Security)}</b></td>
      <td>${esc(Val(r.Type))}</td><td class="num">${nf(r.Qty, 0)}</td>
      <td class="num">${nf(r.Price)}</td><td class="num">${nf(r.Commission)}</td>
      <td><span class="pill ok">${esc(Val(r.Status))}</span></td></tr>`).join('')
      || `<tr><td class="empty" colspan="${cols.length}">${esc(T('nodata'))}</td></tr>`}</tbody></table></div></div>`;
  if (staff) $('#tx-client').onchange = e => { pfState.clientId = e.target.value ? Number(e.target.value) : null; renderView(); };
  $('#tx-exp').onclick = () => exportCsv('transactions', cols.map(c => Col(c)), rows.map(r => cols.map(c => c === 'Date' ? String(r.Date).slice(0, 16) : r[c])));
}

// ═══════════════════════════════════════════════ Инвест-проекты
async function viewProjects() {
  const rows = await api('/projects');
  const cols = ['Project', 'Rate', 'CashFlows', 'NPV', 'IRR', 'PI', 'Payback'];
  setActions(`<button class="btn primary" id="pr-add">＋ ${esc(T('b.AddProject'))}</button>
    <button class="btn" id="pr-exp">⤓ ${esc(T('b.Export'))}</button>`);
  contentEl().innerHTML = `<div class="panel"><div class="table-wrap"><table class="grid">
    <thead><tr>${cols.map(c => `<th class="${['Rate', 'NPV', 'IRR', 'PI', 'Payback'].includes(c) ? 'num' : ''}">${esc(Col(c))}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr><td><b>${esc(r.Project)}</b></td><td class="num">${nf(r.Rate)}%</td>
      <td class="muted mono">${esc(r.CashFlows)}</td>
      <td class="num ${signCls(r.NPV)}">${nf(r.NPV)}</td>
      <td class="num">${nf(r.IRR)}%</td><td class="num">${nf(r.PI)}</td>
      <td class="num">${r.Payback == null ? esc(T('p.never')) : nf(r.Payback) + ' ' + (state.lang === 1 ? 'y.' : state.lang === 2 ? 'г.' : 'г.')}</td></tr>`).join('')
      || `<tr><td class="empty" colspan="${cols.length}">${esc(T('nodata'))}</td></tr>`}</tbody></table></div></div>`;
  $('#pr-exp').onclick = () => exportCsv('projects', cols.map(Col), rows.map(r => cols.map(c => r[c] ?? '')));
  $('#pr-add').onclick = async () => {
    const v = await formDialog({
      title: T('p.NewProject'),
      fields: [
        { key: 'name', label: Col('Project'), required: true, full: true },
        { key: 'rate', label: T('p.Rate'), type: 'number', value: '10', step: '0.1' },
        { key: 'cashFlows', label: T('p.Flows'), required: true, placeholder: '-1000;300;400;500', full: true, hint: '-1000;300;400;500' },
      ],
      submitText: T('b.AddProject'),
    });
    if (!v) return;
    try { await api('/projects', { method: 'POST', body: v }); ok(T('e.saved')); renderView(); } catch { }
  };
}

// ═══════════════════════════════════════════════ Отчёты
async function viewReports() {
  const rows = await api('/report');
  setActions(`<button class="btn primary" id="rp-exp">⤓ ${esc(T('b.Export'))}</button>`);
  contentEl().innerHTML = `<div class="panel">
    <div class="panel-head"><h3>${esc(T('t.Reports'))}</h3></div>
    <div class="table-wrap"><table class="grid"><thead><tr><th>${esc(Col('Metric'))}</th><th class="num">${esc(Col('Value'))}</th></tr></thead>
    <tbody>${rows.map(r => {
      const m = r.metric.startsWith('r.top:') ? T('r.top') + r.metric.slice(6) : T(r.metric);
      const isMoney = r.metric === 'r.income';
      return `<tr><td>${esc(m)}</td><td class="num">${isMoney ? money(r.value) : nf(r.value, 0)}</td></tr>`;
    }).join('')}</tbody></table></div>
    <div class="panel-head" style="border-top:1px solid var(--line)"><h3>${esc(T('m.Projects'))}</h3></div>
    <div class="table-wrap" id="rp-projects"><div style="padding:16px"><div class="skeleton"></div></div></div>
  </div>`;
  $('#rp-exp').onclick = () => exportCsv('report', [Col('Metric'), Col('Value')], rows.map(r => [r.metric, r.value]));
  try {
    const projs = await api('/projects', { quiet: true });
    $('#rp-projects').innerHTML = `<table class="grid"><thead><tr>
      <th>${esc(Col('Project'))}</th><th class="num">${esc(Col('NPV'))}</th><th class="num">${esc(Col('IRR'))}</th>
      <th class="num">${esc(Col('PI'))}</th><th class="num">${esc(Col('Payback'))}</th></tr></thead><tbody>
      ${projs.map(p => `<tr><td>${esc(p.Project)}</td><td class="num ${signCls(p.NPV)}">${nf(p.NPV)}</td>
        <td class="num">${nf(p.IRR)}%</td><td class="num">${nf(p.PI)}</td><td class="num">${p.Payback == null ? esc(T('p.never')) : nf(p.Payback)}</td></tr>`).join('')}
      </tbody></table>`;
  } catch { $('#rp-projects').innerHTML = ''; }
}

// ═══════════════════════════════════════════════ Администрирование
async function viewAdmin() {
  const [users, log] = await Promise.all([api('/users'), api('/audit')]);
  const cols = ['Company', 'Login', 'Role', 'Active'];
  setActions(`<button class="btn primary" id="ad-add">＋ ${esc(T('b.AddEmployee'))}</button>
    <button class="btn" id="ad-del">🗑 ${esc(T('b.Delete'))}</button>`);
  contentEl().innerHTML = `
    <div class="panel" style="margin-bottom:18px"><div class="panel-head"><h3>${esc(T('t.Admin'))}</h3></div>
      <div class="table-wrap"><table class="grid" id="ad-users"><thead><tr>${cols.map(c => `<th>${esc(Col(c))}</th>`).join('')}</tr></thead>
      <tbody>${users.map(u => `<tr data-id="${u.Id}">
        <td>${esc(u.Company)}</td><td><b>${esc(u.Login)}</b></td>
        <td><span class="pill ${u.Role === 'Admin' ? 'ok' : ''}">${esc(Val(u.Role))}</span></td>
        <td>${u.Active ? '✓' : '—'}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="panel"><div class="panel-head"><h3>${esc(T('t.Log'))}</h3></div>
      <div class="table-wrap" style="max-height:460px"><table class="grid">
        <thead><tr>${['Time', 'User', 'Action', 'Details'].map(c => `<th>${esc(Col(c))}</th>`).join('')}</tr></thead>
        <tbody>${log.map(r => `<tr><td class="mono">${esc(String(r.Time).replace('T', ' ').slice(0, 19))}</td>
          <td>${esc(r.User)}</td><td>${esc(r.Action)}</td><td class="muted">${esc(r.Details)}</td></tr>`).join('')}</tbody></table></div></div>`;

  let selected = null;
  document.querySelectorAll('#ad-users tbody tr[data-id]').forEach(tr => tr.onclick = () => {
    document.querySelectorAll('#ad-users tbody tr').forEach(x => x.style.background = '');
    tr.style.background = '#e9f6f1'; selected = Number(tr.dataset.id);
  });
  $('#ad-add').onclick = async () => {
    const v = await formDialog({
      title: T('p.NewEmp'),
      fields: [{ key: 'login', label: T('reg.login'), required: true },
               { key: 'password', label: T('reg.pass'), type: 'password', required: true },
               { key: 'role', label: T('p.Role'), type: 'select', options: [{ value: 'Employee', text: Val('Employee') }, { value: 'Admin', text: Val('Admin') }] }],
      submitText: T('b.AddEmployee'),
    });
    if (!v) return;
    try { await api('/users', { method: 'POST', body: v }); ok(T('e.saved')); renderView(); } catch { }
  };
  $('#ad-del').onclick = async () => {
    if (!selected) return fail(state.lang === 1 ? 'Select an account' : 'Выберите учётную запись');
    if (!await confirmDialog(T('b.Delete') + '?', T('b.Delete'))) return;
    try { await api('/users/' + selected, { method: 'DELETE' }); ok(T('e.saved')); renderView(); } catch { }
  };
}

// ═══════════════════════════════════════════════ Профиль
async function viewProfile() {
  const p = await api('/profile');
  const rows = [['Name', p.Name], p.UNP ? ['UNP', p.UNP] : null, ['Address', p.Address], ['Contacts', p.Contacts],
    ['Status', Val(p.Status)], ['Kind', Val(p.Kind)]].filter(Boolean);
  contentEl().innerHTML = `<div class="profile"><dl>${rows.map(([k, v]) => `<dt>${esc(Col(k))}</dt><dd>${esc(v || '—')}</dd>`).join('')}</dl></div>`;
}

// ═══════════════════════════════════════════════ Помощь (те же тексты, что в десктопе)
function helpTopics() {
  const t = state.session.isStaff
    ? [['m.Home', 'h.Home'], ['h.stockTitle', 'h.Stock'], ['m.Clients', 'h.Clients'], ['m.Projects', 'h.Projects'],
       ['m.Portfolio', 'h.Portfolio'], ['m.Transactions', 'h.Transactions'], ['m.Reports', 'h.Reports']]
    : [['m.Home', 'h.Home'], ['h.stockTitle', 'h.Stock'], ['m.MyPortfolio', 'h.MyPortfolio'],
       ['m.History', 'h.History'], ['m.Profile', 'h.Profile']];
  if (state.session.isAdmin) t.push(['m.Admin', 'h.Admin']);
  t.push(['h.generalTitle', 'h.General']);
  return t;
}

function viewHelp() {
  const topics = helpTopics();
  const idx = Math.min(state.helpIdx, topics.length - 1);
  state.helpIdx = idx;
  setActions('');
  contentEl().innerHTML = `<div class="help">
    <div class="help-list">${topics.map((t, i) => `<button data-topic="${i}" class="${i === idx ? 'active' : ''}">${i + 1}. ${esc(T(t[0]))}</button>`).join('')}</div>
    <div class="help-page">
      <h2>${esc(T(topics[idx][0]))}</h2>
      <div class="body">${esc(T(topics[idx][1]))}</div>
      <div class="help-nav">
        <button class="btn" id="hp-prev" ${idx === 0 ? 'disabled' : ''}>◀ ${esc(T('h.prev'))}</button>
        <div class="spacer"></div>
        <span class="hint">${esc(T('h.page').replace('{0}', idx + 1).replace('{1}', topics.length))}</span>
        <div class="spacer"></div>
        <button class="btn primary" id="hp-next" ${idx === topics.length - 1 ? 'disabled' : ''}>${esc(T('h.next'))} ▶</button>
      </div>
    </div>
  </div>`;
  document.querySelectorAll('[data-topic]').forEach(b => b.onclick = () => { state.helpIdx = Number(b.dataset.topic); viewHelp(); });
  $('#hp-prev').onclick = () => { state.helpIdx = Math.max(0, idx - 1); viewHelp(); };
  $('#hp-next').onclick = () => { state.helpIdx = Math.min(topics.length - 1, idx + 1); viewHelp(); };
}

// ═══════════════════════════════════════════════ экспорт CSV (как в десктопе: ';' + BOM)
function exportCsv(name, headers, rows) {
  const cell = v => String(v ?? '').replace(/;/g, ',').replace(/\r?\n/g, ' ');
  const csv = '\uFEFF' + [headers.map(cell).join(';'), ...rows.map(r => r.map(cell).join(';'))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ═══════════════════════════════════════════════ живые обновления (SSE)
function connectEvents() {
  if (state.es) state.es.close();
  if (!state.session) return;
  const es = new EventSource('/api/events?token=' + encodeURIComponent(state.session.token));
  state.es = es;
  es.onopen = () => { state.live = true; paintLive(); };
  es.onerror = () => { state.live = false; paintLive(); };
  es.onmessage = ev => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'hello') return;
    if (msg.user === state.session.login && msg.type === 'changed') return; // собственные действия — без лишнего шума
    if (msg.type === 'prices') {
      if (['Home', 'Portfolio', 'Stock'].includes(state.view)) renderView();
      return;
    }
    if (msg.type === 'changed') {
      // другой пользователь (веб или десктоп) что-то изменил — обновляем текущий экран
      if (['Home', 'Portfolio', 'Transactions', 'Stock', 'Clients', 'Reports', 'Admin'].includes(state.view)) {
        renderView();
        toast((state.lang === 1 ? 'Updated by ' : state.lang === 2 ? 'Абноўлена ' : 'Обновлено: ') + (msg.user || '—'), 'info', 2600);
      }
    }
  };
}

function paintLive() {
  const dot = document.querySelector('.userchip .dot');
  if (dot) dot.classList.toggle('live', state.live);
}

// ═══════════════════════════════════════════════ старт
window.addEventListener('hashchange', () => { });
document.addEventListener('keydown', e => {
  if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) return; // браузер обновит сам
});
boot();
