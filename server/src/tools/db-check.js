#!/usr/bin/env node
// Проверка подключения к SQL Server и состояния базы BankInvest.
// Ничего не меняет — только читает.
//
// Запуск:  npm run db:check        (в папке server)
// Настройки берутся из переменных окружения (см. server/src/db.js):
//   MSSQL_SERVER, MSSQL_DATABASE, MSSQL_USER, MSSQL_PASSWORD, …
'use strict';

const D = require('../db');

async function main() {
  console.log('─'.repeat(64));
  console.log('  BankInvest — проверка SQL Server');
  console.log('─'.repeat(64));
  console.log(`  Сервер баз  : ${D.SERVER}`);
  console.log(`  База данных : ${D.DATABASE}`);
  console.log(`  Пул         : ${require('../db').CONFIG.options?.instanceName ? 'экземпляр ' + require('../db').CONFIG.options.instanceName : 'экземпляр по умолчанию'}`);
  console.log(`  Вход        : ${process.env.MSSQL_USER ? 'SQL-логин ' + process.env.MSSQL_USER : 'не задан (MSSQL_USER / MSSQL_PASSWORD)'}`);
  console.log('─'.repeat(64));

  let problems = 0;

  const version = await D.scalar('SELECT @@VERSION');
  console.log('  Подключение  : OK');
  console.log('  Сервер       : ' + (version ? String(version).split('\n')[0].trim() : '(версия не получена)'));

  const tables = ['Clients', 'Users', 'DepoAccounts', 'Issuers', 'Securities', 'Holdings',
    'Transactions', 'DepositCertificates', 'InvestmentProjects', 'AuditLog', 'PriceHistory',
    'Listings', 'Sessions'];
  const procs = ['usp_BuyListing', 'usp_UpdatePrices'];

  // один запрос вместо 15: что реально есть в базе
  const present = await D.all(`SELECT name, type FROM sys.objects WHERE type IN ('U','P')`);
  const have = new Set(present.map(r => String(r.name)));
  const missing = tables.filter(t => !have.has(t));

  // Права на процедуры проверяем отдельно: sys.objects показывает лишь объекты,
  // на которые у логина есть хоть какое-то право. Без EXECUTE процедура «невидима».
  const procRights = {};
  for (const proc of procs) {
    const row = await D.get(`SELECT HAS_PERMS_BY_NAME(?, 'OBJECT', 'EXECUTE') AS CanExec`, `dbo.${proc}`);
    procRights[proc] = !!(row && row.CanExec);
  }
  if (missing.length) {
    problems++;
    console.log('  Таблицы      : НЕ НАЙДЕНЫ: ' + missing.join(', '));
    // Частый случай: база восстановлена из старого .bak, где Sessions ещё не было.
    // schema.sql идемпотентен, поэтому просто применяем его целиком.
    if (missing.includes('Sessions') && missing.length === 1) {
      console.log('  Что значит    : база создана до появления таблицы Sessions —');
      console.log('                  её использует общий сервер для входа по токену.');
      console.log('                  Данные не пострадают, добавятся только недостающие объекты.');
    }
    console.log('  Что сделать   : npm run db:init  (или откройте db/schema.sql в SSMS'
      + ' — файл сам выбирает базу ' + D.DATABASE + ')');
  } else {
    console.log('  Таблицы      : все 13 на месте');
    const c = await D.get(`SELECT
      (SELECT COUNT(*) FROM Clients) AS Clients,
      (SELECT COUNT(*) FROM Securities) AS Securities,
      (SELECT COUNT(*) FROM Holdings) AS Holdings,
      (SELECT COUNT(*) FROM Transactions) AS Transactions,
      (SELECT COUNT(*) FROM Listings) AS Listings,
      (SELECT COUNT(*) FROM PriceHistory) AS PriceHistory`);
    console.log('  Данные       : ' + Object.entries(c || {}).map(([k, v]) => `${k}=${v}`).join(', '));
  }

  const login = process.env.MSSQL_USER || '<логин>';
  for (const proc of procs) {
    if (procRights[proc]) {
      console.log(`  Процедура    : ${proc} — есть, право EXECUTE выдано`);
    } else {
      problems++;
      // Без права на объект SQL Server не показывает его в sys.objects, поэтому
      // «процедуры нет» и «нет права» неразличимы — сообщаем оба варианта.
      console.log(`  Процедура    : ${proc} — недоступна логину: нет права EXECUTE или процедуры нет`);
      console.log('  Что сделать  : под администратором в базе ' + D.DATABASE + ':');
      console.log(`                 GRANT EXECUTE ON OBJECT::dbo.${proc} TO ${login};`);
    }
  }

  console.log('─'.repeat(64));
  if (problems) {
    console.log(`  НАЙДЕНО ПРОБЛЕМ: ${problems}. Сервер запустится, но часть операций не будет работать.`);
    console.log('─'.repeat(64));
    process.exitCode = 1;
  } else {
    console.log('  Всё готово: можно запускать сервер — npm start');
    console.log('─'.repeat(64));
  }
}

main()
  .then(() => D.closePool())
  .catch(async e => {
    console.error('─'.repeat(64));
    console.error('  Ошибка: ' + (e.hint || D.describeError(e) || e.message));
    console.error('─'.repeat(64));
    if (e.dbMessage && e.dbMessage !== e.message) console.error('  ' + D.describeError(e));
    console.error('  Проверьте службу SQL Server, TCP/IP + порт 1433, логин/пароль и имя базы.');
    console.error('');
    console.error('  Подробная диагностика (порт, службы, экземпляры):  npm run sql:doctor');
    await D.closePool();
    process.exit(1);
  });
