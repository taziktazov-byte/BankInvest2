#!/usr/bin/env bash
# Запуск сервера BankInvest (веб-версия + API для десктопа) на Microsoft SQL Server.
#
# Настройки подключения — переменными окружения (или в файле server/.env):
#   MSSQL_SERVER=localhost   MSSQL_DATABASE=BankInvest
#   MSSQL_USER=bankinvest    MSSQL_PASSWORD=...
# Без MSSQL_USER используется Windows-аутентификация (только на Windows).
set -e
cd "$(dirname "$0")/server"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Не найден Node.js. Установите Node.js 18 или новее: https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules/mssql ]; then
  echo "[1/2] Устанавливаю драйвер SQL Server (npm install)..."
  npm install --no-audit --no-fund
fi

echo "[2/2] Проверяю подключение к SQL Server..."
if ! node src/tools/db-check.js; then
  echo
  echo "Сервер не может подключиться к SQL Server. Что проверить:"
  echo "  1) служба SQL Server запущена"
  echo "  2) TCP/IP включён, порт 1433"
  echo "  3) логин и пароль: MSSQL_USER / MSSQL_PASSWORD (или Windows-аутентификация)"
  echo "  4) база BankInvest создана, у логина права db_datareader / db_datawriter"
  echo "Подробнее: README_RU.md, раздел «SQL Server»."
  exit 1
fi

echo
echo "Запускаю сервер... (Ctrl+C — остановить)"
exec node src/server.js
