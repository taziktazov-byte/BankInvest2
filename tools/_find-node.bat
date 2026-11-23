@echo off
rem ==================================================================
rem  Поиск Node.js и npm. Подключается из других .bat так:
rem      call "%~dp0tools\_find-node.bat"        (из корня проекта)
rem      call "%~dp0..\tools\_find-node.bat"     (из папки server)
rem
rem  После вызова:
rem      NODE_EXE  — полный путь к node.exe (или пусто, если не найден)
rem      NPM_CMD   — полный путь к npm.cmd  (или пусто)
rem
rem  Зачем: после установки Node.js окно cmd часто остаётся со старым PATH,
rem  и «npm не является внутренней или внешней командой». Скрипт находит Node
rem  в стандартных местах и дописывает PATH текущего процесса.
rem ==================================================================

set "NODE_EXE="
set "NPM_CMD="

rem 1) уже в PATH
for /f "delims=" %%p in ('where node 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%p"
)
if defined NODE_EXE goto have_node

rem 2) стандартные места установки
for %%d in (
  "%ProgramFiles%\nodejs"
  "%ProgramFiles(x86)%\nodejs"
  "%LOCALAPPDATA%\Programs\nodejs"
  "%APPDATA%\nvm"
  "%USERPROFILE%\scoop\apps\nodejs\current"
  "%ProgramFiles%\nodejs\nodejs"
) do (
  if not defined NODE_EXE if exist "%%~d\node.exe" set "NODE_EXE=%%~d\node.exe"
)

rem 3) nvm-windows: версии лежат в %APPDATA%\nvm\vXX.X.X
if not defined NODE_EXE if exist "%APPDATA%\nvm" (
  for /f "delims=" %%d in ('dir /b /ad /o-n "%APPDATA%\nvm\v*" 2^>nul') do (
    if not defined NODE_EXE if exist "%APPDATA%\nvm\%%d\node.exe" set "NODE_EXE=%APPDATA%\nvm\%%d\node.exe"
  )
)

:have_node
if not defined NODE_EXE goto not_found

rem npm лежит рядом с node.exe
for %%p in ("%NODE_EXE%") do set "NODE_DIR=%%~dp"
if exist "%NODE_DIR%npm.cmd" set "NPM_CMD=%NODE_DIR%npm.cmd"
if not defined NPM_CMD if exist "%NODE_DIR%npm.exe" set "NPM_CMD=%NODE_DIR%npm.exe"
if not defined NPM_CMD for /f "delims=" %%p in ('where npm 2^>nul') do (
  if not defined NPM_CMD set "NPM_CMD=%%p"
)

rem дописываем каталог Node в PATH этого процесса (без хвостового "\")
set "NODE_DIR_NB=%NODE_DIR:~0,-1%"
set "PATH=%NODE_DIR_NB%;%PATH%"

exit /b 0

:not_found
echo.
echo ================================================================
echo   [!] Node.js не найден на этом компьютере
echo ================================================================
echo   Нужен Node.js 18 или новее: https://nodejs.org  (кнопка LTS)
echo.
echo   При установке оставьте галочку
echo     "Add to PATH" / "Добавить в PATH".
echo   После установки закройте это окно и запустите файл заново
echo   ^(или перезагрузите компьютер^).
echo ================================================================
echo.
exit /b 1
