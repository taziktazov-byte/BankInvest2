/* Стенд для съёмки скриншотов пояснительной записки.
 *
 * Служебный файл, в поставку не входит. Поднимает настоящее веб-приложение
 * (server/web) и отвечает на запросы /api теми же данными, что лежат в
 * db/seed.sql, но без SQL Server: в среде, где готовится документ, его нет.
 * Формы ответов повторяют server/src/logic.js один в один, поэтому снимки
 * экранов получаются такими же, как у работающей системы.
 *
 * Запуск:  node docs/pz/mock-api.js   (порт 8099)
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.MOCK_PORT || 8099);
const WEB_DIR = path.join(__dirname, '..', '..', 'server', 'web');
const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'src', 'i18n.json'), 'utf8'));

// ---------------------------------------------------------------- данные
const round2 = v => Math.round(Number(v) * 100) / 100;

const clients = [
  { Id: 1, Name: 'ООО «Альфа»', UNP: '100200300', Address: 'г. Минск, ул. Мясникова 1', Contacts: '+375 17 000-00-00', Status: 'Активен', Kind: 'Company', Depo: 'DEPO-100200300' },
  { Id: 2, Name: 'ООО «Вектор Плюс»', UNP: '100234567', Address: 'г. Минск, ул. Тимирязева 65Б', Contacts: '+375 17 234-56-78', Status: 'Активен', Kind: 'Company', Depo: 'DEPO-100234567' },
  { Id: 3, Name: 'ООО «БелТехСервис»', UNP: '190456789', Address: 'г. Минск, пр. Независимости 58', Contacts: '+375 29 111-22-33', Status: 'Активен', Kind: 'Company', Depo: 'DEPO-190456789' },
  { Id: 4, Name: 'ЗАО «Полесье-Агро»', UNP: '291234567', Address: 'г. Брест, ул. Советская 14', Contacts: '+375 33 222-33-44', Status: 'Активен', Kind: 'Company', Depo: 'DEPO-291234567' },
  { Id: 5, Name: 'ОАО «МинскСтройИнвест»', UNP: '100987654', Address: 'г. Минск, ул. Ленина 3', Contacts: '+375 17 333-44-55', Status: 'Активен', Kind: 'Company', Depo: 'DEPO-100987654' },
  { Id: 6, Name: 'ИП Козлов А. В.', UNP: '590123456', Address: 'г. Гродно, ул. Горького 21', Contacts: '+375 29 444-55-66', Status: 'Активен', Kind: 'Company', Depo: 'DEPO-590123456' },
  { Id: 7, Name: 'ООО «ГомельЛогистик»', UNP: '490765432', Address: 'г. Гомель, ул. Рогачёвская 9', Contacts: '+375 44 555-66-77', Status: 'Активен', Kind: 'Company', Depo: 'DEPO-490765432' },
  { Id: 8, Name: 'ЧУП «Витебск-Текстиль»', UNP: '390654321', Address: 'г. Витебск, пр. Фрунзе 40', Contacts: '+375 29 666-77-88', Status: 'Активен', Kind: 'Company', Depo: 'DEPO-390654321' },
  { Id: 9, Name: 'ООО «СмартФинанс»', UNP: '191345678', Address: 'г. Минск, ул. Притыцкого 62', Contacts: '+375 25 777-88-99', Status: 'Активен', Kind: 'Company', Depo: 'DEPO-191345678' },
  { Id: 10, Name: 'Иванов Сергей Петрович', UNP: '900000001', Address: 'г. Минск, ул. Берута 11-45', Contacts: '+375 29 100-10-10', Status: 'Активен', Kind: 'Personal', Depo: 'DEPO-900000001' },
  { Id: 11, Name: 'Петрова Анна Игоревна', UNP: '900000002', Address: 'г. Могилёв, ул. Первомайская 5-12', Contacts: '+375 33 200-20-20', Status: 'Активен', Kind: 'Personal', Depo: 'DEPO-900000002' },
  { Id: 12, Name: 'Сидоров Максим Олегович', UNP: '900000003', Address: 'г. Брест, ул. Московская 77-3', Contacts: '+375 44 300-30-30', Status: 'Активен', Kind: 'Personal', Depo: 'DEPO-900000003' },
];

const securities = [
  ['BYN-GB1', 'Облигации Минфина', 'Министерство финансов РБ', 'Облигация', 'Gov Bonds', 100, 100000, 12.5, 0.20, 'Размещён', 101.20, 100.40],
  ['AGPB-B2', 'Облигации Белагропромбанка', 'ОАО «Белагропромбанк»', 'Облигация', 'Corp Bonds', 50, 50000, 14.0, 0.35, 'Размещён', 49.60, 50.30],
  ['AGPB-S', 'Акции Белагропромбанка', 'ОАО «Белагропромбанк»', 'Акция', 'Equity', 10, 200000, 0, 0.50, 'Размещён', 12.40, 11.60],
  ['BYN-GB2', 'Облигации Минфина II', 'Министерство финансов РБ', 'Облигация', 'Gov Bonds', 100, 80000, 13.0, 0.20, 'Зарегистрирован', 100.00, 100.00],
  ['BNH-B1', 'Облигации Белнефтехим-Инвест', 'ОАО «Белнефтехим-Инвест»', 'Облигация', 'Corp Bonds', 100, 60000, 13.50, 0.30, 'Размещён', 102.30, 100.80],
  ['MSI-B2', 'Облигации МинскСтройИнвест', 'ОАО «МинскСтройИнвест»', 'Облигация', 'Corp Bonds', 50, 40000, 14.20, 0.35, 'Размещён', 49.20, 50.60],
  ['PAG-S', 'Акции Полесье-Агро', 'ЗАО «Полесье-Агро»', 'Акция', 'Equity', 10, 300000, 0, 0.50, 'Размещён', 14.85, 13.90],
  ['BEF-S', 'Акции БелЭнерго-Финанс', 'ОАО «БелЭнерго-Финанс»', 'Акция', 'Equity', 10, 250000, 0, 0.50, 'Размещён', 11.20, 12.35],
  ['TPI-S', 'Акции ТехноПарк Инвест', 'ООО «ТехноПарк Инвест»', 'Акция', 'Equity', 20, 120000, 0, 0.55, 'Размещён', 31.70, 29.40],
  ['BYN-GB3', 'Облигации Минфина III', 'Министерство финансов РБ', 'Облигация', 'Gov Bonds', 100, 90000, 12.80, 0.20, 'Размещён', 100.60, 100.10],
  ['BYN-GB4', 'Облигации Минфина IV', 'Министерство финансов РБ', 'Облигация', 'Gov Bonds', 100, 70000, 13.10, 0.20, 'Размещён', 98.90, 99.70],
  ['ASB-B1', 'Облигации Беларусбанка', 'ОАО «АСБ Беларусбанк»', 'Облигация', 'Corp Bonds', 100, 80000, 13.90, 0.25, 'Размещён', 103.10, 102.20],
  ['ASB-S', 'Акции Беларусбанка', 'ОАО «АСБ Беларусбанк»', 'Акция', 'Equity', 25, 400000, 0, 0.45, 'Размещён', 41.30, 39.10],
  ['BPS-B1', 'Облигации БПС-Банка', 'ОАО «БПС-Банк»', 'Облигация', 'Corp Bonds', 50, 50000, 14.00, 0.30, 'Размещён', 51.10, 51.90],
  ['MTB-S', 'Акции МТ-Банка', 'ОАО «МТ-Банк»', 'Акция', 'Equity', 15, 180000, 0, 0.50, 'Размещён', 17.60, 17.95],
  ['GEI-B1', 'Облигации ЗелёнаяЭнергия-Инвест', 'ОАО «ЗелёнаяЭнергия-Инвест»', 'Облигация', 'Corp Bonds', 100, 30000, 12.00, 0.30, 'Размещён', 100.00, 100.00],
  ['BEF-B1', 'Облигации БелЭнерго-Финанс', 'ОАО «БелЭнерго-Финанс»', 'Облигация', 'Corp Bonds', 100, 45000, 13.00, 0.30, 'На регистрации', 100.00, 100.00],
  ['TPI-B1', 'Облигации ТехноПарк Инвест', 'ООО «ТехноПарк Инвест»', 'Облигация', 'Corp Bonds', 100, 35000, 14.50, 0.35, 'Зарегистрирован', 100.00, 100.00],
].map((r, i) => ({
  Id: i + 1, Symbol: r[0], Name: r[1], Issuer: r[2], Kind: r[3], Segment: r[4],
  Nominal: r[5], Volume: r[6], Rate: r[7], ExpenseRatio: r[8], Status: r[9], Price: r[10], PrevPrice: r[11],
}));

const secBySymbol = s => securities.find(x => x.Symbol === s);
const secById = id => securities.find(x => x.Id === id);
const clientByUnp = u => clients.find(c => c.UNP === u);

// Holdings — точно как в разделе 5 db/seed.sql
const holdingsRaw = [
  ['100200300', 'BNH-B1', 150, 0], ['100200300', 'TPI-S', 80, 0],
  ['190456789', 'BYN-GB1', 600, 40], ['190456789', 'BNH-B1', 300, 30], ['190456789', 'PAG-S', 1200, 20], ['190456789', 'ASB-B1', 100, 10],
  ['291234567', 'AGPB-S', 2000, 35], ['291234567', 'BYN-GB3', 400, 40], ['291234567', 'MSI-B2', 500, 15], ['291234567', 'BEF-S', 700, 10],
  ['100987654', 'BYN-GB1', 300, 30], ['100987654', 'BYN-GB4', 500, 30], ['100987654', 'ASB-S', 400, 25], ['100987654', 'MTB-S', 600, 15],
  ['590123456', 'ASB-B1', 200, 50], ['590123456', 'GEI-B1', 150, 30], ['590123456', 'PAG-S', 300, 20],
  ['490765432', 'BYN-GB3', 700, 45], ['490765432', 'BPS-B1', 500, 25], ['490765432', 'TPI-S', 150, 20], ['490765432', 'MTB-S', 400, 10],
  ['390654321', 'AGPB-B2', 800, 30], ['390654321', 'BNH-B1', 350, 30], ['390654321', 'BEF-S', 500, 20], ['390654321', 'GEI-B1', 250, 20],
  ['191345678', 'TPI-S', 400, 40], ['191345678', 'ASB-S', 250, 30], ['191345678', 'PAG-S', 600, 30],
  ['900000001', 'BYN-GB1', 50, 50], ['900000001', 'ASB-B1', 30, 30], ['900000001', 'MTB-S', 100, 20],
  ['900000002', 'GEI-B1', 40, 60], ['900000002', 'BYN-GB3', 20, 40],
  ['900000003', 'PAG-S', 150, 50], ['900000003', 'TPI-S', 60, 50],
];
let holdingId = 0;
const holdings = holdingsRaw.map(([unp, sym, qty, tgt]) => ({
  Id: ++holdingId, ClientId: clientByUnp(unp).Id, SecurityId: secBySymbol(sym).Id, Quantity: qty, TargetPct: tgt,
}));

// Listings — раздел 11 db/seed.sql (цена = цена бумаги × коэффициент)
const listingsRaw = [
  ['190456789', 'PAG-S', 400, 1.02], ['190456789', 'BNH-B1', 100, 0.99], ['190456789', 'BYN-GB1', 200, 1.01],
  ['291234567', 'AGPB-S', 800, 1.03], ['291234567', 'BEF-S', 300, 0.98], ['291234567', 'MSI-B2', 200, 1.00],
  ['100987654', 'ASB-S', 150, 1.02], ['100987654', 'MTB-S', 250, 0.99], ['100987654', 'BYN-GB4', 300, 1.01],
  ['590123456', 'GEI-B1', 80, 1.00], ['590123456', 'PAG-S', 150, 1.04],
  ['490765432', 'BYN-GB3', 300, 0.995], ['490765432', 'BPS-B1', 200, 1.01], ['490765432', 'TPI-S', 60, 1.02],
  ['390654321', 'AGPB-B2', 300, 1.00], ['390654321', 'BNH-B1', 150, 1.015], ['390654321', 'BEF-S', 200, 1.03],
  ['191345678', 'TPI-S', 150, 0.985], ['191345678', 'ASB-S', 100, 1.01],
  ['100200300', 'AGPB-S', 300, 1.00], ['100200300', 'BYN-GB1', 150, 1.01],
  ['900000001', 'MTB-S', 40, 1.02], ['900000003', 'PAG-S', 50, 1.01],
];
let listingId = 0;
const listings = listingsRaw.map(([unp, sym, qty, f]) => {
  const s = secBySymbol(sym);
  return {
    Id: ++listingId, SellerClientId: clientByUnp(unp).Id, SecurityId: s.Id,
    Quantity: qty, Price: round2(s.Price * f), Status: 'Активно',
    CreatedAt: '2026-11-21T09:41:00',
  };
});

// Transactions — раздел 6 db/seed.sql
const txRaw = [
  ['190456789', 'BYN-GB1', 'Buy', 600, 58], ['190456789', 'BNH-B1', 'Buy', 300, 51],
  ['190456789', 'PAG-S', 'Buy', 1200, 44], ['190456789', 'ASB-B1', 'Buy', 100, 30],
  ['190456789', 'MTB-S', 'Buy', 200, 21], ['190456789', 'MTB-S', 'Sell', 200, 9],
  ['291234567', 'AGPB-S', 'Buy', 2000, 55], ['291234567', 'BYN-GB3', 'Buy', 400, 47],
  ['291234567', 'MSI-B2', 'Buy', 500, 39], ['291234567', 'BEF-S', 'Buy', 900, 28],
  ['291234567', 'BEF-S', 'Sell', 200, 12],
  ['100987654', 'BYN-GB1', 'Buy', 300, 49], ['100987654', 'BYN-GB4', 'Buy', 500, 41],
  ['100987654', 'ASB-S', 'Buy', 400, 33], ['100987654', 'MTB-S', 'Buy', 600, 25],
  ['590123456', 'ASB-B1', 'Buy', 200, 36], ['590123456', 'GEI-B1', 'Buy', 150, 27],
  ['590123456', 'PAG-S', 'Buy', 300, 15],
  ['490765432', 'BYN-GB3', 'Buy', 700, 46], ['490765432', 'BPS-B1', 'Buy', 500, 38],
  ['490765432', 'TPI-S', 'Buy', 150, 20],
  ['390654321', 'AGPB-B2', 'Buy', 800, 52], ['390654321', 'BNH-B1', 'Buy', 350, 43],
  ['390654321', 'GEI-B1', 'Buy', 250, 19],
  ['191345678', 'TPI-S', 'Buy', 400, 31], ['191345678', 'ASB-S', 'Buy', 250, 22],
  ['191345678', 'PAG-S', 'Sell', 100, 6],
  ['900000001', 'BYN-GB1', 'Buy', 50, 34], ['900000001', 'ASB-B1', 'Buy', 30, 18],
  ['900000002', 'GEI-B1', 'Buy', 40, 29], ['900000002', 'BYN-GB3', 'Buy', 20, 14],
  ['900000003', 'PAG-S', 'Buy', 150, 26], ['900000003', 'TPI-S', 'Buy', 60, 8],
  ['100200300', 'BNH-B1', 'Buy', 150, 16], ['100200300', 'TPI-S', 'Buy', 80, 3],
];

// Дата документа — фиксированная, чтобы снимки не «прыгали» между прогонами
const NOW = new Date('2026-11-23T10:15:00');
const minusMinutes = m => new Date(NOW.getTime() - m * 60000).toISOString().slice(0, 19);
const tx = txRaw.map(([unp, sym, type, qty, days], i) => {
  const s = secBySymbol(sym);
  return {
    Id: i + 1, ClientId: clientByUnp(unp).Id, SecurityId: s.Id, Type: type, Quantity: qty,
    Price: s.Price, Commission: round2(qty * s.Price * 0.005), Status: 'Исполнена',
    Date: minusMinutes(days * 1440 + qty % 600),
  };
});

const projectsRaw = [
  ['Модернизация филиала', 10, '-1000;300;400;500;300'],
  ['Модернизация склада', 12, '-150000;45000;60000;70000;50000'],
  ['Солнечная электростанция', 10, '-300000;80000;90000;95000;100000;60000'],
  ['Открытие нового отделения в Гродно', 12, '-2500;600;800;1000;1200;900'],
  ['Внедрение системы цифровых платежей', 15, '-1800;400;700;900;1100'],
  ['Модернизация банкоматной сети', 10, '-1200;250;350;450;500;500'],
  ['Мобильное приложение для малого бизнеса', 14, '-900;100;300;500;700'],
  ['Покупка офисного здания', 9, '-5000;700;700;700;700;700;5200'],
  ['Расширение колл-центра', 16, '-1500;200;250;300'],
];

// Те же формулы, что в logic.js: NPV, IRR, PI, срок окупаемости
function npv(rate, flows) {
  const r = rate / 100;
  return flows.reduce((a, cf, i) => a + cf / Math.pow(1 + r, i), 0);
}
function irr(flows) {
  let lo = -0.99, hi = 10;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (npv(mid * 100, flows) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2 * 100;
}
function pi(rate, flows) {
  const r = rate / 100;
  const pv = flows.slice(1).reduce((a, cf, i) => a + cf / Math.pow(1 + r, i + 1), 0);
  return pv / Math.abs(flows[0]);
}
function payback(flows) {
  let acc = -Math.abs(flows[0]);
  for (let i = 1; i < flows.length; i++) {
    const prev = acc;
    acc += flows[i];
    if (acc >= 0) return (i - 1) + Math.abs(prev) / flows[i];
  }
  return null;
}
const projects = projectsRaw.map(([name, rate, cf]) => {
  const flows = cf.split(';').map(Number);
  const pb = payback(flows);
  return {
    Project: name, Rate: rate, CashFlows: cf,
    NPV: round2(npv(rate, flows)), IRR: round2(irr(flows)), PI: round2(pi(rate, flows)),
    Payback: pb == null ? null : Math.round(pb * 100) / 100,
  };
});

const users = [
  { Id: 1, Company: 'ASB', Login: 'admin', Role: 'Admin', Active: true },
  { Id: 2, Company: 'ASB', Login: 'employee', Role: 'Employee', Active: true },
  { Id: 3, Company: 'ASB', Login: 'ivanova', Role: 'Employee', Active: true },
  { Id: 4, Company: 'ASB', Login: 'kozlov', Role: 'Employee', Active: true },
  { Id: 5, Company: '100200300', Login: '100200300', Role: 'Client', Active: true },
  { Id: 6, Company: '190456789', Login: '190456789', Role: 'Client', Active: true },
  { Id: 7, Company: '291234567', Login: '291234567', Role: 'Client', Active: true },
  { Id: 8, Company: 'PERSONAL', Login: 'ivanov', Role: 'Client', Active: true },
];

const audit = [
  ['2026-11-23T09:58:11', 'admin', 'Вход в систему', ''],
  ['2026-11-23T09:52:40', '190456789', 'Покупка ценных бумаг', 'PAG-S, 400 шт.'],
  ['2026-11-23T09:31:05', 'employee', 'Выставлено предложение', 'MTB-S, 250 шт.'],
  ['2026-11-23T09:12:47', 'admin', 'Создан сотрудник', 'kozlov'],
  ['2026-11-22T18:04:22', '291234567', 'Вход в систему', ''],
  ['2026-11-22T17:40:03', 'employee', 'Изменены целевые доли', 'ООО «БелТехСервис»'],
].map(([Time, User, Action, Details]) => ({ Time, User, Action, Details }));

// ---------------------------------------------------------------- сессии
const SESSIONS = {
  admin: { token: 'tok-admin', login: 'admin', role: 'Admin', clientId: null, clientName: null, lang: 0 },
  employee: { token: 'tok-emp', login: 'employee', role: 'Employee', clientId: null, clientName: null, lang: 0 },
  client: { token: 'tok-client', login: '190456789', role: 'Client', clientId: 3, clientName: 'ООО «БелТехСервис»', lang: 0 },
};
const sessionOf = req => {
  const a = String(req.headers.authorization || '');
  const t = a.replace(/^Bearer\s+/i, '');
  return Object.values(SESSIONS).find(s => s.token === t) || null;
};
const pub = s => ({ ...s, isStaff: s.role !== 'Client', isAdmin: s.role === 'Admin' });

// ---------------------------------------------------------------- расчёты (как в logic.js)
function portfolio(clientId) {
  const rows = holdings.filter(h => h.ClientId === clientId).map(h => {
    const s = secById(h.SecurityId);
    const forSale = listings.filter(l => l.SellerClientId === clientId && l.SecurityId === h.SecurityId)
      .reduce((a, l) => a + l.Quantity, 0);
    return {
      Id: h.Id, Symbol: s.Symbol, Name: s.Name, Segment: s.Segment, Qty: h.Quantity, ForSale: forSale,
      Price: s.Price, ExpenseRatio: s.ExpenseRatio, CurrentValue: round2(h.Quantity * s.Price),
      CurrentPct: 0, TargetPct: h.TargetPct, TargetValue: 0, Amount: 0,
    };
  });
  const total = round2(rows.reduce((a, r) => a + r.CurrentValue, 0));
  for (const r of rows) {
    r.CurrentPct = total ? round2(r.CurrentValue / total * 100) : 0;
    r.TargetValue = round2(total * (r.TargetPct || 0) / 100);
    r.Amount = round2(r.TargetValue - r.CurrentValue);
  }
  const targetValue = round2(rows.reduce((a, r) => a + r.TargetValue, 0));
  return {
    rows, total, targetValue,
    targetPctSum: round2(rows.reduce((a, r) => a + (r.TargetPct || 0), 0)),
    diff: round2(targetValue - total),
  };
}

function home(s) {
  const c = s.isStaff ? null : s.clientId;
  const pv = c ? round2(holdings.filter(h => h.ClientId === c)
    .reduce((a, h) => a + h.Quantity * secById(h.SecurityId).Price, 0))
    : round2(holdings.reduce((a, h) => a + h.Quantity * secById(h.SecurityId).Price, 0));
  const offers = listings.filter(l => l.Status === 'Активно' && (!c || l.SellerClientId === c)).length;
  const kpis = [];
  if (s.isStaff) {
    kpis.push({ key: 'k.clients', value: String(clients.length), kind: 'count', accent: 'blue' });
    kpis.push({ key: 'k.aum', value: pv.toFixed(2) + ' BYN', kind: 'money', accent: 'green' });
    kpis.push({ key: 'k.offers', value: String(offers), kind: 'count', accent: 'orange' });
    kpis.push({ key: 'k.income', value: round2(tx.reduce((a, t) => a + t.Commission, 0)).toFixed(2) + ' BYN', kind: 'money', accent: 'purple' });
  } else {
    const secs = holdings.filter(h => h.ClientId === c && h.Quantity > 0).length;
    const ops = tx.filter(t => t.ClientId === c).length;
    kpis.push({ key: 'k.pv', value: pv.toFixed(2) + ' BYN', kind: 'money', accent: 'green' });
    kpis.push({ key: 'k.secs', value: String(secs), kind: 'count', accent: 'blue' });
    kpis.push({ key: 'k.myops', value: String(ops), kind: 'count', accent: 'purple' });
    kpis.push({ key: 'k.myoffers', value: String(offers), kind: 'count', accent: 'orange' });
  }
  const chg = x => round2((x.Price - x.PrevPrice) * 100 / (x.PrevPrice || 1));
  const placed = securities.filter(x => x.Status === 'Размещён')
    .map(x => ({ Symbol: x.Symbol, Name: x.Name, Price: x.Price, Change: chg(x) }));
  const up = placed.filter(x => x.Change > 0).sort((a, b) => b.Change - a.Change).slice(0, 8);
  const down = placed.filter(x => x.Change < 0).sort((a, b) => a.Change - b.Change).slice(0, 8);
  return { kpis, up, down };
}

// История цен: случайное блуждание, последняя точка = текущая цена (как в seed.sql)
function chart(symbol, grain) {
  const s = secBySymbol(symbol);
  const n = grain === 0 ? 168 : grain === 1 ? 90 : grain === 2 ? 52 : grain === 3 ? 48 : 10;
  const step = grain === 0 ? 3600000 : grain === 1 ? 86400000 : grain === 2 ? 604800000 : grain === 3 ? 2592000000 : 31536000000;
  const vol = s.Segment === 'Gov Bonds' ? 0.004 : s.Segment === 'Corp Bonds' ? 0.008 : 0.02;
  let seed = 0; for (const ch of symbol) seed = (seed * 31 + ch.charCodeAt(0)) % 99991;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const prices = [];
  let p = s.Price;
  for (let i = 0; i < n; i++) { prices.push(p); p = p / (1 + (rnd() - 0.48) * vol); }
  const points = prices.map((pr, i) => ({
    t: new Date(NOW.getTime() - (n - 1 - i) * step).toISOString().slice(0, 19).replace('T', ' '),
    p: round2(pr),
  }));
  points[points.length - 1].p = s.Price;
  return { points };
}

// ---------------------------------------------------------------- маршруты
function route(method, url, req, body) {
  const p = url.pathname.replace(/^\/api/, '');
  const q = url.searchParams;

  if (p === '/i18n') return { languages: ['ru', 'en', 'be'], dict };

  if (p === '/auth/login' && method === 'POST') {
    const id = String(body.id || '');
    if (id === 'admin' || id === 'employee') return pub(SESSIONS[id]);
    if (id === '190456789') return pub(SESSIONS.client);
    return null;
  }

  const s = sessionOf(req);
  if (!s) return null;

  if (p === '/auth/me') return pub(s);
  if (p === '/auth/logout') return { ok: true };
  if (p === '/lang') { s.lang = body.lang; return { ok: true }; }

  if (p === '/home') return home(s);
  if (p === '/clients') return clients;
  if (p === '/clients/lite') return clients.map(c => ({ Id: c.Id, Name: c.Name }));

  if (p === '/portfolio') {
    const cid = s.isStaff ? Number(q.get('clientId') || clients[0].Id) : s.clientId;
    return portfolio(cid);
  }
  if (p === '/securities') {
    return securities.map(x => ({ Id: x.Id, Symbol: x.Symbol, Name: x.Name }));
  }
  if (p === '/offers') {
    const sym = q.get('security');
    return listings.filter(l => l.Status === 'Активно' && (!sym || secById(l.SecurityId).Symbol === sym))
      .map(l => {
        const sec = secById(l.SecurityId);
        return {
          Id: l.Id, Seller: clients.find(c => c.Id === l.SellerClientId).Name,
          Symbol: sec.Symbol, Available: l.Quantity, Price: l.Price,
          VsMarket: round2((l.Price - sec.Price) * 100 / sec.Price),
        };
      });
  }
  if (p === '/my-offers') {
    const cid = s.isStaff ? Number(q.get('clientId') || clients[0].Id) : s.clientId;
    return listings.filter(l => l.SellerClientId === cid && l.Status === 'Активно').map(l => {
      const sec = secById(l.SecurityId);
      return { Id: l.Id, Symbol: sec.Symbol, Name: sec.Name, Qty: l.Quantity, Price: l.Price, CreatedAt: l.CreatedAt };
    });
  }
  if (p === '/sellable') {
    const cid = s.isStaff ? Number(q.get('clientId') || clients[0].Id) : s.clientId;
    return holdings.filter(h => h.ClientId === cid).map(h => {
      const sec = secById(h.SecurityId);
      const reserved = listings.filter(l => l.SellerClientId === cid && l.SecurityId === h.SecurityId)
        .reduce((a, l) => a + l.Quantity, 0);
      return { Id: h.SecurityId, Symbol: sec.Symbol, Name: sec.Name, Free: h.Quantity - reserved, Price: sec.Price };
    });
  }
  if (p.startsWith('/stock/')) {
    const parts = p.split('/').filter(Boolean);       // stock, SYMBOL, [chart]
    const sec = secBySymbol(decodeURIComponent(parts[1]));
    if (!sec) return null;
    if (parts[2] === 'chart') return chart(sec.Symbol, Number(q.get('grain') || 1));
    return sec;
  }
  if (p === '/transactions') {
    const cid = s.isStaff ? Number(q.get('clientId') || 0) : s.clientId;
    return tx.filter(t => !cid || t.ClientId === cid)
      .sort((a, b) => a.Date < b.Date ? 1 : -1)
      .map(t => ({
        Date: t.Date, Client: clients.find(c => c.Id === t.ClientId).Name,
        Security: secById(t.SecurityId).Symbol, Type: t.Type, Qty: t.Quantity,
        Price: t.Price, Commission: t.Commission, Status: t.Status,
      }));
  }
  if (p === '/projects') return projects;
  if (p === '/report') {
    const top = {};
    tx.forEach(t => { top[t.SecurityId] = (top[t.SecurityId] || 0) + t.Quantity; });
    const best = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([id]) => secById(Number(id)).Symbol).join(', ');
    return [
      { metric: 'r.ops', value: tx.filter(t => t.Status === 'Исполнена').length },
      { metric: 'r.income', value: round2(tx.reduce((a, t) => a + t.Commission, 0)) },
      { metric: 'r.top:' + best, value: 1 },
    ];
  }
  if (p === '/users') return users;
  if (p === '/audit') return audit;
  if (p === '/profile') {
    const c = clients.find(x => x.Id === s.clientId);
    return c ? { Name: c.Name, UNP: c.UNP, Address: c.Address, Contacts: c.Contacts, Status: c.Status, Kind: c.Kind } : {};
  }
  if (p === '/events') return '__sse__';
  return null;
}

// ---------------------------------------------------------------- сервер
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon',
};
const send = (res, code, data, type) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(buf);
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) {
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    const full = path.join(WEB_DIR, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
    if (!full.startsWith(WEB_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    }
    return send(res, 200, fs.readFileSync(full), MIME[path.extname(full)] || 'application/octet-stream');
  }

  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('data: {"type":"hello"}\n\n');
      return;                                    // соединение оставляем открытым
    }
    let out;
    try { out = route(req.method, url, req, body); } catch (e) { return send(res, 500, { error: { pretty: e.message } }); }
    if (out === '__sse__') return send(res, 200, { ok: true });
    if (out === null) return send(res, 401, { error: { key: 'login.fail', pretty: 'Unauthorized' } });
    send(res, 200, out);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('mock API + web on http://0.0.0.0:' + PORT);
});
