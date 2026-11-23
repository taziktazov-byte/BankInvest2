@echo off
chcp 65001 >nul
setlocal
title BankInvest - проверка окружения
cd /d "%~dp0"

echo ================================================================
echo   BankInvest — что установлено на этом компьютере
echo ================================================================
echo.

rem ---------- Node.js ----------
call "%~dp0tools\_find-node.bat" >nul 2>&1
echo [Node.js]  ^(нужен серверу и веб-версии^)
if defined NODE_EXE (
  for /f "delims=" %%v in ('node -v') do echo    версия : %%v
  echo    путь   : %NODE_EXE%
  if defined NPM_CMD (echo    npm    : %NPM_CMD%) else (echo    npm    : [!] не найден рядом с node.exe)
  where node >nul 2>nul
  if errorlevel 1 (
    echo    [!] не в PATH — батники это обходят автопоиском,
    echo        но команду "npm" вручную в этом окне выполнить не получится
  )
) else (
  echo    [!] НЕ НАЙДЕН — установите Node.js 18+ с https://nodejs.org
)

rem ---------- .NET (для десктопа) ----------
echo.
echo [.NET]     ^(нужен только для десктопной версии из исходников^)
where dotnet >nul 2>nul
if errorlevel 1 (
  echo    [!] dotnet не найден.
  echo        Либо установите .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0
  echo        Либо используйте готовый desktop\BankInvest.exe из комплекта.
) else (
  for /f "delims=" %%v in ('dotnet --version 2^>nul') do echo    версия : %%v
)

rem ---------- SQL Server ----------
echo.
echo [SQL Server]
sc query MSSQLSERVER >nul 2>nul
if errorlevel 1 (
  sc query "MSSQL$SQLEXPRESS" >nul 2>nul
  if errorlevel 1 (
    echo    служба не найдена — возможно, SQL Server не установлен
  ) else (
    sc query "MSSQL$SQLEXPRESS" | find "STATE" | find "RUNNING" >nul && (
      echo    MSSQL$SQLEXPRESS : работает
    ) || (
      echo    MSSQL$SQLEXPRESS : остановлен ^(запустите: net start "MSSQL$SQLEXPRESS"^)
    )
  )
) else (
  sc query MSSQLSERVER | find "STATE" | find "RUNNING" >nul && (
    echo    MSSQLSERVER : работает
  ) || (
    echo    MSSQLSERVER : остановлен ^(запустите от администратора: net start MSSQLSERVER^)
  )
)

rem ---------- порт 1433 ----------
echo.
echo [Порт 1433] ^(через него сервер общается с базой^)
powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',1433); '    открыт'; $c.Close() } catch { '    [!] закрыт: включите TCP/IP в SQL Server Configuration Manager (IPAll - TCP Port = 1433)' }"

rem ---------- файлы проекта ----------
echo.
echo [Файлы проекта]
if exist "server\node_modules\mssql" (echo    драйвер mssql : есть) else (echo    драйвер mssql : нет ^(нужен npm install в папке server^))
if exist "db\schema.sql" (echo    схема db\      : есть) else (echo    схема db\      : НЕТ)
if exist "BankInvest.bak" (echo    BankInvest.bak: есть) else (echo    BankInvest.bak: нет ^(не обязательно^))

rem ---------- база ----------
echo.
echo [База данных]
if not defined NODE_EXE (
  echo    пропускаю — без Node.js проверить нельзя
) else if not exist "server\node_modules\mssql" (
  echo    пропускаю — нет драйвера mssql
) else (
  pushd server
  node src\tools\db-check.js
  popd
)

echo.
echo ================================================================
echo   Что делать дальше:
echo     * всё на месте  - запустите БЫСТРЫЙ-СТАРТ.bat
echo     * нет Node.js   - установите с https://nodejs.org ^(галочка Add to PATH^)
echo     * нет SQL Server- установите SQL Server Express или используйте Docker
echo ================================================================
pause
