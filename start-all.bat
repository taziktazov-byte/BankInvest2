@echo off
chcp 65001 >nul
title BankInvest - все версии
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Установите Node.js 18 или новее: https://nodejs.org
  pause
  exit /b 1
)

if not exist "server\node_modules\mssql" (
  echo [0/3] Устанавливаю драйвер SQL Server ^(npm install^)...
  pushd server
  call npm.cmd install --no-audit --no-fund
  popd
  if errorlevel 1 (
    echo Не удалось установить пакет mssql. Выполните вручную: cd server ^&^& npm.cmd install
    pause
    exit /b 1
  )
)

echo [1/3] Проверяю SQL Server...
pushd server
node src\tools\db-check.js
popd
if errorlevel 1 (
  echo.
  echo Подключение к SQL Server не удалось - сервер не запустится.
  echo Проверьте службу SQL Server, TCP/IP ^(порт 1433^) и переменные MSSQL_USER / MSSQL_PASSWORD.
  pause
  exit /b 1
)

echo [2/3] Запускаю сервер (веб-версия + API)...
start "BankInvest server" cmd /c "cd /d %~dp0server && node src\server.js"

echo [3/3] Жду готовности сервера...
set /a tries=0
:wait
set /a tries+=1
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/ping -TimeoutSec 2) | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  if %tries% GEQ 30 (
    echo Сервер не ответил за 15 секунд. Проверьте окно "BankInvest server" - возможно, порт 8787 занят.
    pause
    exit /b 1
  )
  timeout /t 1 /nobreak >nul
  goto wait
)

echo Открываю веб-версию в браузере...
start "" http://localhost:8787/

echo.
echo Веб-версия открыта: http://localhost:8787/
where dotnet >nul 2>nul
if errorlevel 1 (
  echo .NET 8 SDK не найден - десктопную версию пропускаю.
  echo Установите: https://dotnet.microsoft.com/download/dotnet/8.0
  pause
  exit /b 0
)
echo Запускаю десктопное приложение...
dotnet run
pause
