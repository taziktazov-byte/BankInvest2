@echo off
chcp 65001 >nul
cd /d "%~dp0server"
echo Запуск сервера BankInvest (веб-версия + API для десктопа)...
echo.
node src\server.js
if errorlevel 1 (
  echo.
  echo Не удалось запустить сервер. Проверьте, установлен ли Node.js 22.5 или новее: node -v
)
pause
