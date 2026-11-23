#!/usr/bin/env node
// Диагностика: почему сервер не может подключиться к SQL Server.
// Проверяет то, что не видно из сообщения драйвера:
//   * доступен ли порт 1433 по TCP (и по какому адресу);
//   * какие службы SQL Server установлены и запущены;
//   * какие экземпляры зарегистрированы (важно: SQLEXPRESS — именованный);
//   * совпадают ли настройки окружения с найденным экземпляром.
//
// Запуск:  npm run sql:doctor     (в папке server)
// Ничего не меняет — только читает и советует.
'use strict';

const net = require('node:net');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const D = require('../db');

const isWin = process.platform === 'win32';
const HOST = (() => {
  const s = String(D.CONFIG.server || D.SERVER || 'localhost');
  return s.split(',')[0].split('\\')[0];
})();
const PORT = D.CONFIG.options?.port || 1433;
const INSTANCE = D.CONFIG.options?.instanceName || '';

const line = '─'.repeat(64);
const ok = t => console.log('  ✔ ' + t);
const bad = t => console.log('  ✖ ' + t);
const info = t => console.log('    ' + t);

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
  } catch (e) {
    return (e && e.stdout) ? String(e.stdout) : '';
  }
}

/** TCP-проверка: отвечает ли порт. */
function probe(host, port, ms = 3000) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch { /* уже закрыт */ }
      resolve(result);
    };
    sock.setTimeout(ms);
    sock.once('connect', () => finish({ ok: true }));
    sock.once('timeout', () => finish({ ok: false, reason: 'timeout' }));
    sock.once('error', e => finish({ ok: false, reason: e.code || e.message }));
    sock.connect(port, host);
  });
}

/** Службы SQL Server из sc query (Windows). */
function sqlServices() {
  if (!isWin) return [];
  const out = sh('sc', ['query', 'state=', 'all']);
  const services = [];
  let current = null;
  for (const raw of out.split(/\r?\n/)) {
    const l = raw.trim();
    const m = l.match(/^SERVICE_NAME:\s*(\S+)/i);
    if (m) {
      current = { name: m[1], running: false };
      if (/^MSSQL\$|^MSSQLSERVER$|^SQLAgent/i.test(current.name)) services.push(current);
      else current = null;
      continue;
    }
    if (current && /STATE\s*:\s*\d+\s+(\w+)/i.test(l)) {
      current.running = /RUNNING/i.test(l);
    }
  }
  return services.filter(s => /^MSSQL(SERVER|\$)/i.test(s.name));
}

/** Зарегистрированные экземпляры из реестра (Windows). */
function registeredInstances() {
  if (!isWin) return [];
  const out = sh('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL']);
  const list = [];
  for (const raw of out.split(/\r?\n/)) {
    const m = raw.trim().match(/^([A-Za-z0-9_$]+)\s+REG_SZ\s+(.+)$/);
    if (m) list.push({ name: m[1], id: m[2].trim() });
  }
  return list;
}

/**
 * Настройки протокола TCP/IP из реестра — видно, включён ли он и на каком порту,
 * без SQL Server Configuration Manager.
 *   HKLM\SOFTWARE\Microsoft\Microsoft SQL Server\<ID>\MSSQLServer\SuperSocketNetLib\Tcp
 */
function tcpSettings() {
  if (!isWin) return [];
  const out = [];
  for (const inst of registeredInstances()) {
    const base = `HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\${inst.id}\\MSSQLServer\\SuperSocketNetLib\\Tcp`;
    const raw = sh('reg', ['query', base, '/v', 'Enabled']);
    const en = raw.match(/Enabled\s+REG_DWORD\s+0x([0-9a-f]+)/i);
    const ipAll = sh('reg', ['query', base + '\\IPAll']);
    // построчно: пустое значение (REG_SZ с одним переводом строки) не должно
    // «съедать» следующую строку
    const value = (text, key) => {
      for (const raw of text.split(/\r?\n/)) {
        const m = raw.trim().match(/^(\w+)\s+REG_SZ\s*(.*)$/i);
        if (m && m[1].toLowerCase() === key.toLowerCase()) return m[2].trim();
      }
      return '';
    };
    out.push({
      name: inst.name,
      enabled: en ? parseInt(en[1], 16) === 1 : null,
      port: value(ipAll, 'TcpPort'),
      dynamic: value(ipAll, 'TcpDynamicPorts')
    });
  }
  return out;
}

/**
 * Режим проверки подлинности из реестра: LoginMode 1 = только Windows,
 * 2 = смешанный (SQL-логины разрешены). Ключ лежит в ветке экземпляра.
 */
function loginMode() {
  if (!isWin) return [];
  const out = [];
  for (const inst of registeredInstances()) {
    const raw = sh('reg', ['query',
      `HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\${inst.id}\\MSSQLServer`, '/v', 'LoginMode']);
    const m = raw.match(/LoginMode\s+REG_DWORD\s+0x([0-9a-f]+)/i);
    out.push({ name: inst.name, mode: m ? parseInt(m[1], 16) : null });
  }
  return out;
}

async function main() {
  console.log(line);
  console.log('  BankInvest — диагностика подключения к SQL Server');
  console.log(line);
  console.log('  Настройки сейчас:');
  console.log(`    MSSQL_SERVER   : ${process.env.MSSQL_SERVER || '(не задан, по умолчанию localhost)'}`);
  console.log(`    MSSQL_INSTANCE : ${process.env.MSSQL_INSTANCE || '(не задан)'}`);
  console.log(`    MSSQL_DATABASE : ${D.DATABASE}`);
  console.log(`    MSSQL_USER     : ${process.env.MSSQL_USER || '(не задан)'}`);
  console.log(`    Пароль задан   : ${process.env.MSSQL_PASSWORD ? 'да' : 'НЕТ'}`);
  console.log(`    Проверяем      : ${HOST}:${PORT}${INSTANCE ? ' (экземпляр ' + INSTANCE + ')' : ''}`);
  console.log(line);

  // ---------- 1. TCP ----------
  console.log('  1) Порт — может ли Node.js вообще достучаться до SQL Server');
  const attempts = [...new Set([HOST, '127.0.0.1', 'localhost'])];
  let anyOpen = false;
  for (const h of attempts) {
    const r = await probe(h, PORT);
    if (r.ok) { ok(`${h}:${PORT} — открыт`); anyOpen = true; }
    else bad(`${h}:${PORT} — нет ответа (${r.reason})`);
  }
  if (!anyOpen) {
    info('Порт закрыт: SQL Server не слушает 1433 или служба не запущена.');
  }
  console.log('');

  // ---------- 2. Службы ----------
  console.log('  2) Службы SQL Server');
  if (!isWin) {
    info('проверка служб доступна только на Windows');
  } else {
    const svc = sqlServices();
    if (!svc.length) {
      bad('службы SQL Server не найдены — похоже, он не установлен на этом компьютере');
      info('установить: https://www.microsoft.com/sql-server/sql-server-downloads (Express)');
    } else {
      for (const s of svc) {
        (s.running ? ok : bad)(`${s.name} — ${s.running ? 'работает' : 'ОСТАНОВЛЕНА'}`);
      }
      const stopped = svc.filter(s => !s.running);
      if (stopped.length) {
        info('запустить от администратора:');
        for (const s of stopped) {
          const nm = s.name.includes('$') ? `"${s.name}"` : s.name;
          info(`  net start ${nm}`);
        }
      }
    }
  }
  console.log('');

  // ---------- 3. Экземпляры ----------
  console.log('  3) Установленные экземпляры');
  const inst = registeredInstances();
  if (!isWin) {
    info('проверка экземпляров доступна только на Windows');
  } else if (!inst.length) {
    bad('экземпляры не найдены в реестре');
  } else {
    for (const i of inst) ok(`${i.name}  (${i.id})`);
    const named = inst.filter(i => i.name.toUpperCase() !== 'MSSQLSERVER');
    if (named.length && !INSTANCE) {
      const first = named[0].name;
      bad(`найден именованный экземпляр «${first}», а MSSQL_INSTANCE не задан`);
      info('для именованного экземпляра обычно нужна одна из настроек:');
      info(`  setx MSSQL_INSTANCE ${first}`);
      info('  либо (если включён TCP и известен порт, обычно динамический):');
      info(`  setx MSSQL_SERVER "localhost\\\\${first}"`);
      info('после setx закройте окно cmd и откройте новое');
    }
  }
  console.log('');

  // ---------- 3b. TCP/IP в реестре ----------
  console.log('  4) Протокол TCP/IP (по настройкам сервера)');
  const tcp = tcpSettings();
  if (!isWin) {
    info('проверка доступна только на Windows');
  } else if (!tcp.length) {
    info('не удалось прочитать настройки');
  } else {
    for (const t of tcp) {
      if (t.enabled === null) {
        info(`${t.name}: настройка Enabled не прочитана — посмотрите Configuration Manager`);
      } else if (t.enabled) {
        ok(`${t.name}: TCP/IP включён` + (t.port ? `, порт ${t.port}` : '') +
           (t.dynamic ? `, динамический порт ${t.dynamic}` : ''));
        if (t.dynamic && !t.port) {
          bad(`${t.name}: порт динамический (${t.dynamic}), а приложение ходит на 1433`);
          info('задайте фиксированный: Configuration Manager → TCP/IP → IPAll → TCP Port 1433,');
          info('TCP Dynamic Ports — пусто, затем перезапустите службу');
        } else if (t.port && t.port !== '1433') {
          bad(`${t.name}: порт ${t.port}, а приложение ходит на 1433`);
          info(`укажите его: setx MSSQL_SERVER \"localhost,${t.port}\"`);
        }
      } else {
        bad(`${t.name}: TCP/IP ВЫКЛЮЧЕН — Node.js не сможет подключиться никак`);
        info('Configuration Manager → SQL Server Network Configuration →');
        info(`  Protocols for ${t.name} → TCP/IP → Enable → перезапуск службы`);
      }
    }
  }
  console.log('');

  // ---------- 3c. Режим аутентификации ----------
  console.log('  5) Режим проверки подлинности');
  const modes = loginMode();
  if (!isWin) {
    info('проверка доступна только на Windows');
  } else if (!modes.length) {
    info('не удалось прочитать настройки');
  } else {
    for (const m of modes) {
      if (m.mode === 1) {
        bad(`${m.name}: только Windows-вход (LoginMode=1) — логин sa не примут`);
        info('SSMS → правой кнопкой по серверу → Свойства → Безопасность →');
        info('  «Режим проверки подлинности SQL Server и Windows» → перезапуск службы');
      } else if (m.mode === 2) {
        ok(`${m.name}: смешанный режим — SQL-логины разрешены`);
      } else {
        info(`${m.name}: LoginMode=${m.mode ?? 'не прочитан'}`);
      }
    }
  }
  console.log('');

  // ---------- 4. Итог ----------
  console.log(line);
  console.log('  Что делать (по порядку)');
  console.log(line);
  if (!anyOpen) {
    console.log('  Порт 1433 не отвечает — почти всегда одно из трёх:');
    console.log('');
    console.log('  а) служба SQL Server не запущена');
    console.log('     Пуск → «Службы» → SQL Server (MSSQLSERVER) → Запустить');
    console.log('     или от администратора: net start MSSQLSERVER');
    console.log('     (для Express: net start "MSSQL$SQLEXPRESS")');
    console.log('');
    console.log('  б) выключен протокол TCP/IP (по умолчанию в Express он выключен!)');
    console.log('     SQL Server Configuration Manager →');
    console.log('       SQL Server Network Configuration → Protocols for MSSQLSERVER/EXPRESS');
    console.log('       → TCP/IP: Enable → двойной клик → IP Addresses → IPAll:');
    console.log('         TCP Port = 1433, TCP Dynamic Ports = пусто');
    console.log('     затем перезапустить службу:');
    console.log('       net stop MSSQLSERVER & net start MSSQLSERVER');
    console.log('');
    console.log('  в) сервер на другом порту или это именованный экземпляр');
    console.log('     тогда укажите его явно:');
    console.log('       setx MSSQL_INSTANCE SQLEXPRESS      (для Express)');
    console.log('       setx MSSQL_SERVER "localhost,1433"  (другой порт)');
    console.log('');
    console.log('  Проверить порт вручную:');
    console.log('       Test-NetConnection localhost -Port 1433');
    console.log('     либо в PowerShell: Get-NetTCPConnection -LocalPort 1433');
  } else {
    console.log('  Порт открыт — значит сеть в порядке, дело в самом входе:');
    console.log('    • ошибка ELOGIN / 18456 = «Login failed» — это НЕ сеть и НЕ TCP/IP;');
    console.log('    • причина 1: сервер в режиме «только Windows» (см. пункт 5 выше);');
    console.log('    • причина 2: неверный пароль или логин отключён;');
    console.log('    • причина 3: логина ещё нет в базе.');
    console.log('');
    console.log('  Готовое решение — файл db\\create-app-login.sql:');
    console.log('    откройте его в SSMS (под администратором) и нажмите «Выполнить»:');
    console.log('    создаст логин bankinvest / BankInvest!2026, включит смешанный');
    console.log('    режим и выдаст права. Затем перезапустите службу и задайте:');
    console.log('      setx MSSQL_USER bankinvest');
    console.log('      setx MSSQL_PASSWORD "BankInvest!2026"');
    console.log('    (новое окно cmd после setx)');
    console.log('');
    console.log('  Другие частые причины:');
    console.log('    • логин отключён → в SSMS: ALTER LOGIN bankinvest ENABLE;');
    console.log('    • базы нет → npm run db:init');
  }
  console.log('  Проверить прямо в SSMS (New Query) — какой вход работает:');
  console.log('     SELECT @@SERVERNAME AS Сервер, SUSER_NAME() AS Вход,');
  console.log('            SERVERPROPERTY(\'InstanceName\') AS Экземпляр;');
  console.log('     SELECT local_net_address, local_tcp_port FROM sys.dm_exec_connections');
  console.log('       WHERE session_id = @@SPID;   -- порт, который реально слушает сервер');
  console.log('');
  console.log('  Если SSMS подключается через Windows-вход (DESKTOP-XXX\\ИмяПользователя),');
  console.log('  а приложение ходит под sa — включите смешанный режим: SSMS -> правой');
  console.log('  кнопкой по серверу -> Свойства -> Безопасность ->');
  console.log('  "Режим проверки подлинности SQL Server и Windows" -> перезапуск службы.');
  console.log('');
  console.log('  Ещё варианты, если SQL Server ставить не хочется:');
  console.log('    docker compose up -d   (в корне проекта: база + сервер в контейнерах)');
  console.log(line);
}

main().catch(e => {
  console.error('  Ошибка диагностики: ' + (e && e.message));
  process.exitCode = 1;
});
