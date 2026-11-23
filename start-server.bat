@echo off
chcp 65001 >nul
rem сначала находим Node.js в исходной папке, потом переходим в server
call "%~dp0tools\_find-node.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
cd /d "%~dp0server"
echo Запуск сервера BankInvest (веб-версия + API для десктопа)
echo База данных: Microsoft SQL Server
echo.

if not exist "node_modules\mssql" (
  echo [1/2] Устанавливаю драйвер SQL Server ^(npm install^)...
  call "%NPM_CMD%" install --no-audit --no-fund
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
