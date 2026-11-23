@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title BankInvest - диагностика SQL Server
cd /d "%~dp0"

echo ================================================================
echo   BankInvest - диагностика: почему сервер не видит SQL Server
echo ================================================================
echo.

set "ROOT=%~dp0"
if exist "%ROOT%tools\_find-node.bat" call "%ROOT%tools\_find-node.bat"
if errorlevel 1 (
  echo.
  echo   Node.js не найден - установите его с https://nodejs.org (кнопка LTS^)
  echo.
  pause
  exit /b 1
)

if not exist "%ROOT%server\src\tools\sql-doctor.js" (
  echo   Файл server\src\tools\sql-doctor.js не найден.
  echo   Похоже, папка проекта неполная - скачайте проект заново.
  echo.
  pause
  exit /b 1
)

set "REPORT=%ROOT%отчёт-диагностики.txt"

echo Результат сохраняется в: %REPORT%
echo.

pushd "%ROOT%server"
node src\tools\sql-doctor.js > "%REPORT%" 2>&1
set "CODE=%errorlevel%"
type "%REPORT%"
popd

echo.
echo ================================================================
if exist "%REPORT%" (
  echo   Отчёт сохранён: отчёт-диагностики.txt
  echo   Его можно отправить как есть.
)
echo ================================================================
echo.
echo   Дальше:
echo     * если "TCP/IP ВЫКЛЮЧЕН" - включите его в SQL Server Configuration Manager
echo     * если "порт динамический" - задайте фиксированный 1433
echo     * если всё открыто, но ошибка входа - проверьте логин и пароль
echo     * если SQL Server не нужен - docker compose up -d  (в корне проекта^)
echo.
pause
exit /b %CODE%
