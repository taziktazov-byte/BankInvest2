#!/usr/bin/env node
// Восстановление базы BankInvest из резервной копии BankInvest.bak.
//
// Запуск (в папке server):  npm run db:restore
// Что делает:
//   1) подключается к master под администратором (MSSQL_USER / MSSQL_PASSWORD);
//   2) читает логические имена файлов из заголовка .bak (RESTORE FILELISTONLY);
//   3) восстанавливает базу с перезаписью (REPLACE), если она уже есть;
//   4) приводит в порядок таблицы/процедуры/права скриптом db/schema.sql
//      (он идемпотентен: добавит Sessions, процедуры и GRANT EXECUTE).
//
// Копия по умолчанию: ../BankInvest.bak (рядом с папкой server).
// Другой файл: переменная окружения BANKINVEST_BAK или первый аргумент.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const D = require('../db');

const BAK = path.resolve(process.argv[2] || process.env.BANKINVEST_BAK || path.join(__dirname, '..', '..', '..', 'BankInvest.bak'));
const DB = D.DATABASE;

const q = s => `[${String(s).replace(/]/g, ']]')}]`;
const lit = s => `N'${String(s).replace(/'/g, "''")}'`;

async function masterPool() {
  const cfg = Object.assign({}, D.CONFIG, { database: 'master' });
  const pool = new sql.ConnectionPool(cfg);
  await pool.connect();
  return pool;
}

async function main() {
  console.log('─'.repeat(64));
  console.log(`  Восстановление базы ${DB} из ${path.basename(BAK)}`);
  console.log('─'.repeat(64));

  if (!fs.existsSync(BAK)) {
    throw new Error(`Файл резервной копии не найден: ${BAK}`);
  }
  const sizeMb = (fs.statSync(BAK).size / 1024 / 1024).toFixed(1);
  console.log(`  Размер копии      : ${sizeMb} МБ`);

  const pool = await masterPool();
  try {
    const where = await pool.request().query('SELECT SERVERPROPERTY(\'InstanceDefaultDataPath\') AS dataPath, SERVERPROPERTY(\'InstanceDefaultLogPath\') AS logPath');
    const clean = d => String(d || '').replace(/[\\/]+$/, '');
    const dataDir = clean(where.recordset[0].dataPath);
    const logDir = clean(where.recordset[0].logPath || where.recordset[0].dataPath);
    console.log(`  Каталог данных    : ${dataDir}`);

    // 1. Какие логические файлы внутри копии
    const files = await pool.request()
      .input('bak', sql.NVarChar(sql.MAX), BAK)
      .query(`RESTORE FILELISTONLY FROM DISK = @bak`);
    const data = files.recordset.find(r => String(r.Type) === 'D' || /D/i.test(String(r.Type)));
    const log = files.recordset.find(r => r !== data);
    if (!data) throw new Error('В резервной копии не найден файл данных (Type = D).');
    console.log(`  Файлы в копии     : ${files.recordset.map(r => r.LogicalName).join(', ')}`);

    // 2. Само восстановление (с перезаписью существующей базы)
    const filePath = (dir, name) => `${dir}${dir.includes('\\') ? '\\' : '/'}${name}`;
    const moves = [
      `MOVE ${lit(data.LogicalName)} TO ${lit(filePath(dataDir, `${DB}.mdf`))}`,
      log ? `MOVE ${lit(log.LogicalName)} TO ${lit(filePath(logDir, `${DB}_log.ldf`))}` : null,
    ].filter(Boolean).join(',\n          ');

    console.log(`  Данные -> ${filePath(dataDir, `${DB}.mdf`)}`);
    if (log) console.log(`  Журнал -> ${filePath(logDir, `${DB}_log.ldf`)}`);

    console.log('  Восстанавливаю...');
    await pool.request()
      .input('bak', sql.NVarChar(sql.MAX), BAK)
      .query(`RESTORE DATABASE ${q(DB)} FROM DISK = @bak
              WITH REPLACE, RECOVERY,
          ${moves}`);

    // 3. Кто владелец и что с правами
    await pool.request().query(`ALTER AUTHORIZATION ON DATABASE::${q(DB)} TO sa`).catch(() => { /* владелец не критичен */ });
    console.log('  ✔ база восстановлена');
  } finally {
    try { await pool.close(); } catch { /* уже закрыт */ }
  }

  // 4. Догоняем схему до текущей версии: Sessions, процедуры, GRANT EXECUTE
  await D.closePool();          // пул мог остаться с прошлой базы
  try {
    const list = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'db', 'schema.sql'), 'utf8')
      .split(/^\s*GO\s*$/im).map(s => s.trim()).filter(Boolean);
    for (const [i, batch] of list.entries()) {
      try {
        await D.exec(batch);
      } catch (e) {
        throw new Error(`db/schema.sql, пакет ${i + 1}: ${D.describeError(e)}`);
      }
    }
    console.log(`  ✔ db/schema.sql применён (${list.length} пакетов): таблицы, процедуры, права`);
  } catch (e) {
    console.log('  • db/schema.sql не применён: ' + (e.message || e));
    console.log('    База восстановлена, но подтяните схему: npm run db:init');
  }

  const clients = Number(await D.scalar('SELECT COUNT(*) FROM Clients')) || 0;
  const secs = Number(await D.scalar('SELECT COUNT(*) FROM Securities')) || 0;
  const prices = Number(await D.scalar('SELECT COUNT(*) FROM PriceHistory')) || 0;
  console.log(`  Данные            : клиентов ${clients}, бумаг ${secs}, точек истории цен ${prices}`);
  await D.closePool();

  console.log('─'.repeat(64));
  console.log('  Готово. Проверьте: npm run db:check, затем запускайте сервер.');
  console.log('─'.repeat(64));
}

main()
  .then(() => D.closePool())
  .catch(async e => {
    console.error('─'.repeat(64));
    console.error('  ✖ ' + (e.hint || D.describeError(e) || e.message));
    console.error('─'.repeat(64));
    console.error('  Частые причины:');
    console.error('   • копия лежит не рядом с папкой server (укажите путь: node src\\tools\\db-restore.js "D:\\путь\\BankInvest.bak")');
    console.error('   • у логина нет прав: под администратором нужна роль dbcreator (или sysadmin)');
    console.error('   • файл .bak от другой версии SQL Server (восстановление старшей версией невозможно)');
    await D.closePool();
    process.exit(1);
  });
