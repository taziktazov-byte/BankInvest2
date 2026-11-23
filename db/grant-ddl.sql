/* =====================================================================
   BankInvest — выдать логину приложения право менять структуру базы
   ---------------------------------------------------------------------
   Зачем: npm run db:init применяет db/schema.sql, а тот пересоздаёт
   процедуры (DROP PROCEDURE + CREATE PROCEDURE). Для этого нужно право
   ALTER на базу. У логина приложения (bankinvest) его обычно нет —
   он создавался только с правами на чтение/запись данных.

   Без этого права db:init остановится с сообщением:
       «У логина нет права менять структуру базы (ALTER)»

   Как выполнить: откройте файл в SSMS под администратором (Windows-вход)
   и нажмите «Выполнить» (F5). Дальше в командной строке:
       cd server
       npm run db:init

   Права выдаются ровно столько, сколько нужно для обновления схемы:
   db_ddladmin (менять объекты) + db_datareader + db_datawriter.
   ===================================================================== */

USE BankInvest;
GO

/* Роль создаётся на всякий случай — в новых базах она есть всегда. */
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'bankinvest')
BEGIN
  PRINT N'Логин bankinvest не найден в базе BankInvest.';
  PRINT N'Сначала выполните db/create-app-login.sql.';
  RETURN;  -- в SSMS RETURN не останавливает пакет — просто завершает скрипт
END
GO

ALTER ROLE db_datareader ADD MEMBER [bankinvest];
ALTER ROLE db_datawriter ADD MEMBER [bankinvest];
GO

/* Главное: право менять структуру (нужно schema.sql для DROP/CREATE процедур). */
ALTER ROLE db_ddladmin ADD MEMBER [bankinvest];
GO

/* На случай, если процедуры уже есть и права на них потерялись. */
IF OBJECT_ID('dbo.usp_BuyListing', 'P') IS NOT NULL
  GRANT EXECUTE ON OBJECT::dbo.usp_BuyListing TO [bankinvest];
IF OBJECT_ID('dbo.usp_UpdatePrices', 'P') IS NOT NULL
  GRANT EXECUTE ON OBJECT::dbo.usp_UpdatePrices TO [bankinvest];
GO

PRINT N'Готово: bankinvest получил db_ddladmin, db_datareader, db_datawriter.';
PRINT N'Теперь в командной строке: cd server  и  npm run db:init';
GO
