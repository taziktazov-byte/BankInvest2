@echo off
chcp 65001 >nul
setlocal
title BankInvest - сборка комплекта для переноса
cd /d "%~dp0.."

set KIT=bankinvest-kit
echo ================================================================
echo   Сборка комплекта для переноса на другой компьютер
echo ================================================================
echo.
echo Комплект: BankInvest_перенос_%DATE:~-4%-%DATE:~3,2%-%DATE:~0,2%.zip
echo Что внутрь:
echo   * веб-версия и API (server\, включая node_modules - работает без интернета)
echo   * схема и демо-данные (db\)
echo   * ваша база BankInvest.bak (если файл есть в папке проекта)
echo   * десктоп: исходники + готовая сборка, если есть dotnet
echo   * скрипты запуска и инструкция ПЕРЕНОС.md
echo.

if exist "%KIT%" rmdir /s /q "%KIT%"
mkdir "%KIT%"

echo [1/5] Копирую файлы проекта...
copy /y BankInvest.csproj "%KIT%\" >nul
copy /y *.cs "%KIT%\" >nul
xcopy /e /i /q /y db "%KIT%\db" >nul
xcopy /e /i /q /y docs "%KIT%\docs" >nul 2>nul
copy /y README_RU.md "%KIT%\" >nul
copy /y ПЕРЕНОС.md "%KIT%\" >nul
copy /y start-all.bat "%KIT%\" >nul
copy /y start-server.bat "%KIT%\" >nul
copy /y start-all.sh "%KIT%\" >nul 2>nul
copy /y start-server.sh "%KIT%\" >nul 2>nul
copy /y db-setup.bat "%KIT%\" >nul
copy /y ПРОВЕРКА-СИСТЕМЫ.bat "%KIT%\" >nul
if exist tools\_find-node.bat (
  if not exist "%KIT%\tools" mkdir "%KIT%\tools"
  copy /y tools\_find-node.bat "%KIT%\tools\" >nul
)
copy /y БЫСТРЫЙ-СТАРТ.bat "%KIT%\" >nul
copy /y docker-compose.yml "%KIT%\" >nul
copy /y Dockerfile "%KIT%\" >nul
copy /y .dockerignore "%KIT%\" >nul

echo [2/5] Копирую сервер (веб-версия + API)...
xcopy /e /i /q /y server "%KIT%\server" >nul

echo [3/5] Резервная копия базы...
if exist BankInvest.bak (
  copy /y BankInvest.bak "%KIT%\" >nul
  echo     BankInvest.bak скопирован - базу можно восстановить с данными.
) else (
  echo     BankInvest.bak не найден - база будет создана из db\schema.sql.
  echo     ^(если копия есть в другом месте - положите её в папку проекта и запустите снова^)
)

echo [4/5] Десктопная версия...
where dotnet >nul 2>nul
if errorlevel 1 (
  echo     .NET SDK не найден - кладу только исходники.
  echo     На ноутбуке с .NET 8 SDK: dotnet run  (или соберите publish по инструкции)
) else (
  echo     Собираю самодостаточную сборку (работает без установки .NET)...
  dotnet publish BankInvest.csproj -c Release -r win-x64 --self-contained true ^
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true ^
    -o "%KIT%\desktop" >nul
  if errorlevel 1 (
    echo     [!] Самодостаточная сборка не удалась. Пробую обычную...
    dotnet publish BankInvest.csproj -c Release -o "%KIT%\desktop" >nul
  )
  if exist "%KIT%\desktop\BankInvest.exe" (
    echo     Готовая сборка: desktop\BankInvest.exe
  ) else (
    echo     [!] Сборка не удалась - на ноутбуке понадобится .NET 8 SDK.
  )
)

echo [5/5] Упаковываю в архив...
set ZIP=BankInvest_перенос_%DATE:~-4%-%DATE:~3,2%-%DATE:~0,2%.zip
if exist "%ZIP%" del /q "%ZIP%"
powershell -NoProfile -Command "Compress-Archive -Path '%KIT%\*' -DestinationPath '%ZIP%' -CompressionLevel Optimal"
if errorlevel 1 (
  echo [!] Не удалось создать архив. Папка "%KIT%" готова - её можно скопировать как есть.
  pause
  exit /b 1
)
rmdir /s /q "%KIT%"

echo.
echo ================================================================
echo   Готово: %ZIP%
echo.
echo   Скопируйте этот архив на ноутбук, распакуйте и запустите
echo   БЫСТРЫЙ-СТАРТ.bat
echo   Подробная инструкция - в ПЕРЕНОС.md
echo ================================================================
pause
