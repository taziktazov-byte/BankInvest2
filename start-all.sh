#!/usr/bin/env bash
# Запуск всего сразу: сервер (веб-версия + API) и, если доступен .NET,
# десктопное приложение (оно работает только на Windows).
set -e
cd "$(dirname "$0")"

if [ -f server/.env ]; then set -a; . ./server/.env; set +a; fi

if [ ! -d server/node_modules/mssql ]; then
  echo "[0/3] Устанавливаю драйвер SQL Server (npm install)..."
  (cd server && npm install --no-audit --no-fund)
fi

echo "[1/3] Проверяю SQL Server..."
if ! (cd server && node src/tools/db-check.js); then
  echo "Подключение к SQL Server не удалось — сервер не запустится."
  echo "Проверьте службу SQL Server, TCP/IP (порт 1433) и MSSQL_USER / MSSQL_PASSWORD."
  exit 1
fi

echo "[2/3] Запускаю сервер (веб-версия + API)..."
node server/src/server.js &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

echo "Жду готовности сервера..."
for _ in $(seq 1 40); do
  if curl -fsS http://localhost:8787/api/ping >/dev/null 2>&1; then break; fi
  sleep 0.5
done

echo "Веб-версия: http://localhost:8787/"
if command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:8787/ >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then open http://localhost:8787/ >/dev/null 2>&1 || true
fi

if command -v dotnet >/dev/null 2>&1; then
  echo "Запускаю десктопное приложение (нужен Windows; на Linux/macOS работает только сервер)..."
  dotnet run --project BankInvest.csproj || true
else
  echo ".NET 8 SDK не найден — десктопная версия не запускается, работает только веб-версия."
  echo "Сервер работает. Нажмите Ctrl+C, чтобы остановить."
  wait $SERVER_PID
fi
