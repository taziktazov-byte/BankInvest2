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
  console.log(`  Вход        : ${process.env.MSSQL_USER ? 'SQL-логин ' + process.env.MSSQL_USER : 'Windows-аутентификация'}`);
  console.log('─'.repeat(64));

  const version = await D.scalar('SELECT @@VERSION');
  console.log('  Подключение  : OK');
  console.log('  Сервер       : ' + String(version).split('\n')[0].trim());

  const tables = ['Clients', 'Users', 'DepoAccounts', 'Issuers', 'Securities', 'Holdings',
    'Transactions', 'DepositCertificates', 'InvestmentProjects', 'AuditLog', 'PriceHistory',
    'Listings', 'Sessions'];
  const missing = [];
  for (const t of tables) {
    const exists = await D.scalar(`SELECT OBJECT_ID('${t}','U')`);
    if (!exists) missing.push(t);
  }
  if (missing.length) {
    console.log('  Таблицы      : НЕ НАЙДЕНЫ: ' + missing.join(', '));
    console.log('  Что делать   : выполните db/schema.sql или разрешите BANKINVEST_AUTO_SCHEMA=1');
  } else {
    console.log('  Таблицы      : все 13 на месте');
    const counts = await D.all(`SELECT
      (SELECT COUNT(*) FROM Clients) AS Clients,
      (SELECT COUNT(*) FROM Securities) AS Securities,
      (SELECT COUNT(*) FROM Holdings) AS Holdings,
      (SELECT COUNT(*) FROM Transactions) AS Transactions,
      (SELECT COUNT(*) FROM Listings) AS Listings,
      (SELECT COUNT(*) FROM PriceHistory) AS PriceHistory`);
    console.log('  Данные       : ' + Object.entries(counts[0]).map(([k, v]) => `${k}=${v}`).join(', '));
  }

  for (const proc of ['usp_BuyListing', 'usp_UpdatePrices']) {
    const exists = await D.scalar(`SELECT OBJECT_ID('${proc}','P')`);
    console.log(`  Процедура    : ${proc} — ${exists ? 'есть' : 'НЕТ (выполните db/schema.sql)'}`);
  }

  console.log('─'.repeat(64));
  console.log('  Всё готово: можно запускать сервер — npm start');
  console.log('─'.repeat(64));
}

main()
  .then(() => D.closePool())
  .catch(async e => {
    console.error('─'.repeat(64));
    console.error('  Ошибка: ' + (e.hint || e.dbMessage || e.message));
    console.error('─'.repeat(64));
    if (e.dbMessage && e.dbMessage !== e.message) console.error('  ' + e.dbMessage);
    console.error('  Проверьте службу SQL Server, TCP/IP + порт 1433, логин/пароль и имя базы.');
    await D.closePool();
    process.exit(1);
  });
