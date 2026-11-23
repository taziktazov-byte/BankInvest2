@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title BankInvest - быстрый старт
cd /d "%~dp0"

echo ================================================================
echo    BankInvest - инвестиции и ценные бумаги
echo    Быстрый старт на новом компьютере
echo ================================================================
echo.
echo Этот файл всё проверит и запустит. От вас нужно только одно:
echo один раз указать логин и пароль администратора SQL Server
echo (обычно это пользователь sa).
echo.

rem ---------- 1. Проверка Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Не найден Node.js.
  echo     Установите Node.js 18 или новее: https://nodejs.org
  echo     ^(галочка "Add to PATH" при установке^), затем запустите этот файл снова.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [1/5] Node.js: %%v

rem ---------- 2. Драйвер SQL Server ----------
if exist "server\node_modules\mssql" (
  echo [2/5] Драйвер SQL Server уже на месте.
) else (
  echo [2/5] Устанавливаю драйвер SQL Server ^(npm install^)...
  pushd server
  call npm.cmd install --no-audit --no-fund
  popd
  if errorlevel 1 (
    echo [!] Не удалось установить пакет mssql.
    echo     Если нет интернета - используйте комплект с папкой server\node_modules
    echo     или выполните вручную: cd server ^&^& npm.cmd install
    pause
    exit /b 1
  )
)

rem ---------- 3. Логин и пароль SQL Server ----------
if defined MSSQL_USER goto havecreds
echo.
echo [3/5] Нужен доступ к SQL Server.
echo      Если SQL Server ещё не установлен - поставьте "Developer" или "Express"
echo      с https://www.microsoft.com/sql-server/sql-server-downloads
echo      и включите TCP/IP на порт 1433.
echo.
set /p MSSQL_USER=Логин SQL Server [sa]: 
if "%MSSQL_USER%"=="" set MSSQL_USER=sa
set /p MSSQL_PASSWORD=Пароль SQL Server: 
if "%MSSQL_PASSWORD%"=="" (
  echo [!] Пароль не введён. Запустите файл снова.
  pause
  exit /b 1
)
rem сохраняем для следующих запусков (только для текущего пользователя)
setx MSSQL_USER "%MSSQL_USER%" >nul
setx MSSQL_PASSWORD "%MSSQL_PASSWORD%" >nul
echo     Логин и пароль сохранены для следующих запусков.
goto dbcheck

:havecreds
echo [3/5] Использую сохранённые MSSQL_USER=%MSSQL_USER%

:dbcheck
rem ---------- 4. База данных ----------
echo [4/5] Проверяю базу BankInvest...
pushd server
node src\tools\db-check.js >nul 2>&1
if errorlevel 1 (
  popd
  echo.
  echo     База ещё не готова. Нужно создать её один раз:
  echo       - если есть файл BankInvest.bak  - восстановим вашу базу с данными
  echo       - иначе создадим заново с демо-данными
  echo.
  set /p SETUP=Создать базу сейчас? [Y/n]: 
  if /i "!SETUP!"=="n" (
    echo     Пропускаю. Сервер без базы не запустится.
    pause
    exit /b 1
  )
  call "%~dp0db-setup.bat"
  rem после подготовки базы проверяем ещё раз — без неё сервер не запустится
  pushd server
  node src\tools\db-check.js >nul 2>&1
  if errorlevel 1 (
    popd
    echo.
    echo [!] База всё ещё не готова. Смотрите сообщения выше.
    echo     Частые причины: неверный пароль, SQL Server не запущен, TCP/IP выключен.
    pause
    exit /b 1
  )
  popd
  echo [4/5] База готова.
) else (
  popd
  echo [4/5] База в порядке.
)

rem ---------- 5. Запуск ----------
echo [5/5] Запускаю сервер и открываю веб-версию...
echo.
echo     Окно сервера закроется вместе с этим окном. Для остановки: Ctrl+C.
echo     Веб-версия: http://localhost:8787/
echo.
start "BankInvest server" cmd /c "cd /d %~dp0server && node src\server.js"

rem ждём, пока сервер ответит
set tries=0
:wait
set /a tries+=1
if %tries% GEQ 40 goto noanswer
>nul 2>nul curl -fsS http://localhost:8787/api/ping && goto ready
>nul 2>nul powershell -NoProfile -Command "try { (New-Object Net.WebClient).DownloadString('http://localhost:8787/api/ping') ^| Out-Null; exit 0 } catch { exit 1 }" && goto ready
timeout /t 1 /nobreak >nul
goto wait

:noanswer
echo [!] Сервер не ответил за 40 секунд. Смотрите окно "BankInvest server".
pause
exit /b 1

:ready
echo     Сервер отвечает. Открываю браузер...
start "" http://localhost:8787/
echo.
echo ================================================================
echo   Готово! Веб-версия открыта: http://localhost:8787/
echo.
echo   Демо-входы:
echo     предприятие : 100200300 / client123   (вкладка "ID организации")
echo     сотрудник   : employee / emp123      (вкладка "ID пользователя")
echo     админ       : admin / admin123
echo.
echo   Десктопная версия (если нужна):
echo     - с установленным .NET 8 SDK:  dotnet run
echo     - без SDK: распакуйте BankInvest-exe.zip и запустите BankInvest.exe
echo ================================================================
pause
