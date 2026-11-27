/* =====================================================================
   BankInvest — создание логина приложения
   ---------------------------------------------------------------------
   Зачем: по умолчанию SQL Server принимает только Windows-вход, поэтому
   логин «sa» (и любой другой SQL-логин) не пускают с ошибкой ELOGIN.

   Этот скрипт делает три вещи:
     1) переводит сервер в смешанный режим (Windows + SQL-логины);
     2) создаёт логин bankinvest с паролем BankInvest!2026;
     3) даёт ему права на базу BankInvest.

   Как выполнить: откройте этот файл в SSMS, подключившись как администратор
   (Windows-вход), и нажмите «Выполнить» (F5). Затем ПЕРЕЗАПУСТИТЕ службу:
   в командной строке от администратора
       net stop MSSQLSERVER & net start MSSQLSERVER
   для именованного экземпляра:
       net stop "MSSQL$SQLEXPRESS" & net start "MSSQL$SQLEXPRESS"

   После этого в приложении:
       setx MSSQL_USER bankinvest
       setx MSSQL_PASSWORD "BankInvest!2026"
   и открыть новое окно командной строки.
   ===================================================================== */

USE master;
GO

/* ---------- 1. Смешанный режим проверки подлинности ---------- */
EXEC xp_instance_regwrite
     N'HKEY_LOCAL_MACHINE',
     N'Software\Microsoft\MSSQLServer\MSSQLServer',
     N'LoginMode', REG_DWORD, 2;
PRINT N'1) Записан смешанный режим (LoginMode=2). Нужен перезапуск службы.';
GO

/* ---------- 2. Логин приложения ----------
   Пароль меняется здесь; он же нужен в MSSQL_PASSWORD.
   CHECK_POLICY = OFF — чтобы не требовать заглавных букв и цифр. */
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'bankinvest')
BEGIN
  CREATE LOGIN [bankinvest]
    WITH PASSWORD = N'BankInvest!2026',
         CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
  PRINT N'2) Логин bankinvest создан.';
END
ELSE
BEGIN
  ALTER LOGIN [bankinvest] WITH PASSWORD = N'BankInvest!2026', CHECK_POLICY = OFF;
  PRINT N'2) Логин bankinvest уже был — пароль обновлён.';
END
GO

/* Логин должен быть включён (бывает отключён после неудачных попыток). */
ALTER LOGIN [bankinvest] ENABLE;
GO

/* ---------- 3. Права на базу ---------- */
USE BankInvest;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'bankinvest')
  CREATE USER [bankinvest] FOR LOGIN [bankinvest];
GO

ALTER ROLE db_datareader ADD MEMBER [bankinvest];
ALTER ROLE db_datawriter ADD MEMBER [bankinvest];
GO

/* Без EXECUTE процедуры не видны и не вызываются (SQL Server скрывает объекты). */
GRANT EXECUTE ON OBJECT::dbo.usp_BuyListing   TO [bankinvest];
GRANT EXECUTE ON OBJECT::dbo.usp_UpdatePrices TO [bankinvest];
GO

PRINT N'3) Права выданы: db_datareader, db_datawriter, EXECUTE на обе процедуры.';
PRINT N'---';
PRINT N'Готово. Теперь перезапустите службу SQL Server и задайте:';
PRINT N'    setx MSSQL_USER bankinvest';
PRINT N'    setx MSSQL_PASSWORD "BankInvest!2026"';
GO
