#!/usr/bin/env bash
# Запуск всего сразу: сервер (веб-версия + API) и, если доступен .NET,
# десктопное приложение (оно работает только на Windows).
set -e
cd "$(dirname "$0")"

echo "[1/3] Запускаю сервер (веб-версия + API)..."
node server/src/server.js &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

echo "[2/3] Жду готовности сервера..."
for _ in $(seq 1 40); do
  if curl -fsS http://localhost:8787/api/ping >/dev/null 2>&1; then break; fi
  sleep 0.5
done

echo "[3/3] Веб-версия: http://localhost:8787/"
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
