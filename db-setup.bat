@echo off
chcp 65001 >nul
setlocal
title BankInvest - подготовка базы данных
rem каталог проекта запоминаем до перехода в server (нужен для tools\_find-node.bat)
set "ROOT=%~dp0"
cd /d "%~dp0server"

echo ================================================================
echo   BankInvest — подготовка базы SQL Server
echo ================================================================
echo.
echo  1. Восстановить вашу базу из BankInvest.bak  (рекомендуется)
echo     — все данные: клиенты, бумаги, история цен, ваши демо-счета
echo  2. Создать базу заново из скриптов (db\schema.sql + seed.sql)
echo     — пустая база с демо-данными, если .bak не подходит
echo  3. Только проверить текущее состояние базы
echo  0. Выход
echo.

set /p choice="Выберите пункт [1]: "
if "%choice%"=="" set choice=1

if "%choice%"=="0" exit /b 0
if "%choice%"=="3" goto check

rem --- нужен sqlcmd: ищем его, затем ставим драйвер и запускаем node-скрипт ---
call "%ROOT%tools\_find-node.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
if not exist "node_modules\mssql" (
  echo Устанавливаю драйвер SQL Server ^(npm install^)...
  call "%NPM_CMD%" install --no-audit --no-fund
  if errorlevel 1 (
    echo Не удалось установить пакет mssql. Проверьте интернет или выполните: cd server ^&^& npm.cmd install
    pause
    exit /b 1
  )
)

if "%choice%"=="1" node src\tools\db-restore.js
if "%choice%"=="2" node src\tools\db-init.js
if errorlevel 1 (
  echo.
  echo Подготовка базы не удалась — смотрите сообщение выше.
  pause
  exit /b 1
)

:check
echo.
echo Проверяю состояние базы...
node src\tools\db-check.js
echo.
pause
exit /b 0
