#!/usr/bin/env node
// Создание/обновление базы BankInvest на SQL Server: db/schema.sql, затем (если база пуста)
// db/seed.sql с демо-данными. Повторный запуск безопасен — скрипты идемпотентны.
//
// Запуск:  npm run db:init        (в папке server)
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const D = require('../db');

function readSql(name) {
  return fs.readFileSync(path.join(__dirname, '..', '..', '..', 'db', name), 'utf8');
}

function batches(script) {
  return script.split(/^\s*GO\s*$/im).map(s => s.trim()).filter(Boolean);
}

async function runScript(name) {
  const list = batches(readSql(name));
  for (const [i, batch] of list.entries()) {
    try {
      await D.exec(batch);
    } catch (e) {
      throw new Error(`db/${name}, пакет ${i + 1}: ${e.hint || e.dbMessage || e.message}`);
    }
  }
  console.log(`  ✔ ${name}: ${list.length} пакетов выполнено`);
}

async function main() {
  console.log('─'.repeat(64));
  console.log(`  BankInvest — подготовка базы ${D.DATABASE} на ${D.SERVER}`);
  console.log('─'.repeat(64));
  await D.ensurePool();
  console.log('  ✔ соединение установлено');

  // schema.sql идемпотентен: недостающие таблицы создаст, существующие не тронет,
  // процедуры пересоздаст. Поэтому применяем всегда — так база, восстановленная
  // из старого .bak, догоняется до текущей версии (например, появляется Sessions).
  await runScript('schema.sql');

  const clients = Number(await D.scalar('SELECT COUNT(*) FROM Clients'));
  if (clients === 0) {
    await runScript('seed.sql');
    console.log('  ✔ демо-данные загружены');
  } else {
    console.log(`  • данные уже есть (${clients} клиентов) — seed.sql пропущен`);
  }

  const added = await D.updatePrices();
  console.log(`  ✔ usp_UpdatePrices: добавлено точек истории цен: ${added}`);

  console.log('─'.repeat(64));
  console.log('  Готово. Запускайте сервер: npm start');
  console.log('─'.repeat(64));
}

main()
  .then(() => D.closePool())
  .catch(async e => {
    console.error('  ✖ Ошибка: ' + (e.hint || e.dbMessage || e.message));
    await D.closePool();
    process.exit(1);
  });
