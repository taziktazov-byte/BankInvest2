#!/usr/bin/env bash
# Запуск сервера BankInvest (веб-версия + API для десктопа)
set -e
cd "$(dirname "$0")/server"
exec node src/server.js
