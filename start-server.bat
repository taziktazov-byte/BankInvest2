@echo off
chcp 65001 >nul
cd /d "%~dp0server"
echo Запуск сервера BankInvest (веб-версия + API для десктопа)
echo База данных: Microsoft SQL Server
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Установите Node.js 18 или новее: https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\mssql" (
  echo [1/2] Устанавливаю драйвер SQL Server ^(npm install^)...
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo Не удалось установить пакет mssql. Проверьте интернет или выполните вручную:
    echo    cd server ^&^& npm.cmd install
    pause
    exit /b 1
  )
)

echo [2/2] Проверяю подключение к SQL Server...
node src\tools\db-check.js
if errorlevel 1 (
  echo.
  echo Сервер не может подключиться к SQL Server. Что проверить:
  echo   1^) служба SQL Server запущена: services.msc -^> SQL Server ^(MSSQLSERVER^)
  echo   2^) TCP/IP включён, порт 1433 ^(SQL Server Configuration Manager^)
  echo   3^) логин и пароль заданы: set MSSQL_USER=... ^& set MSSQL_PASSWORD=...
  echo   4^) база BankInvest создана, у логина права db_datareader / db_datawriter
  echo Подробнее: README_RU.md, раздел «SQL Server».
  pause
  exit /b 1
)

echo.
echo Запускаю сервер... ^(Ctrl+C — остановить^)
echo.
node src\server.js
if errorlevel 1 (
  echo.
  echo Сервер завершился с ошибкой. Смотрите сообщения выше.
)
pause
