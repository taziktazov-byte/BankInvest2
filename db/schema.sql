/* =====================================================================
   BankInvest — схема базы данных SQL Server
   ---------------------------------------------------------------------
   Собрана из исходных скриптов Database.sql + Update_v2.sql +
   Update_v3.sql + Update_v4.sql и приведена к конечному состоянию.

   Скрипт БЕЗОПАСНО запускать повторно:
     * таблицы создаются только если их нет (IF OBJECT_ID ... IS NULL);
     * колонки, добавленные обновлениями (Clients.Kind,
       Securities.Price/PrevPrice), добавляются только если их нет;
     * процедуры пересоздаются (DROP + CREATE — работает на любой версии);
     * база BankInvest создаётся, если её нет, и выбирается автоматически.

   Запуск:
     * SSMS: открыть файл и нажать F5 (база выбирается сама, см. ниже);
     * или: sqlcmd -S localhost -E -i db\schema.sql;
     * или в папке server: npm run db:init.
   ===================================================================== */

SET NOCOUNT ON;
GO

/* База данных: создаём, если её нет, и переключаемся на неё.
   Для CREATE DATABASE нужно право dbcreator; если базы нет и права нет —
   создайте её в SSMS вручную (New Database -> BankInvest) и запустите файл снова. */
IF DB_ID('BankInvest') IS NULL
  CREATE DATABASE BankInvest;
GO
USE BankInvest;
GO

SET XACT_ABORT ON;
GO

/* ---------------- 1. Клиенты, пользователи, счета депо ---------------- */
IF OBJECT_ID('Clients', 'U') IS NULL
CREATE TABLE Clients(
  Id        INT IDENTITY(1,1) PRIMARY KEY,
  Name      NVARCHAR(200) NOT NULL,
  UNP       CHAR(9) NOT NULL CONSTRAINT UQ_Clients_UNP UNIQUE,
  Address   NVARCHAR(300) NULL,
  Contacts  NVARCHAR(200) NULL,
  Status    NVARCHAR(30) NOT NULL CONSTRAINT DF_Clients_Status DEFAULT N'Активен',
  CONSTRAINT CK_Clients_UNP CHECK (UNP NOT LIKE '%[^0-9]%'));
GO

-- Update_v2: тип клиента (предприятие / физическое лицо)
IF COL_LENGTH('Clients', 'Kind') IS NULL
  ALTER TABLE Clients ADD Kind NVARCHAR(10) NOT NULL CONSTRAINT DF_Clients_Kind DEFAULT 'Company';
GO

IF OBJECT_ID('Users', 'U') IS NULL
CREATE TABLE Users(
  Id           INT IDENTITY(1,1) PRIMARY KEY,
  CompanyId    NVARCHAR(30) NOT NULL,
  Login        NVARCHAR(50) NOT NULL,
  PasswordHash CHAR(64) NOT NULL,
  Role         NVARCHAR(20) NOT NULL CHECK (Role IN ('Client','Employee','Admin')),
  IsActive     BIT NOT NULL DEFAULT 1,
  ClientId     INT NULL REFERENCES Clients(Id) ON DELETE CASCADE,
  CONSTRAINT UQ_Users UNIQUE(CompanyId, Login));
GO

IF OBJECT_ID('DepoAccounts', 'U') IS NULL
CREATE TABLE DepoAccounts(
  Id       INT IDENTITY(1,1) PRIMARY KEY,
  ClientId INT NOT NULL REFERENCES Clients(Id) ON DELETE CASCADE,
  Number   NVARCHAR(30) NOT NULL UNIQUE,
  Opened   DATE NOT NULL DEFAULT GETDATE());
GO

/* ---------------- 2. Эмитенты и ценные бумаги ---------------- */
IF OBJECT_ID('Issuers', 'U') IS NULL
CREATE TABLE Issuers(
  Id   INT IDENTITY(1,1) PRIMARY KEY,
  Name NVARCHAR(200) NOT NULL);
GO

IF OBJECT_ID('Securities', 'U') IS NULL
CREATE TABLE Securities(
  Id           INT IDENTITY(1,1) PRIMARY KEY,
  Symbol       NVARCHAR(20) NOT NULL UNIQUE,
  Name         NVARCHAR(200) NOT NULL,
  IssuerId     INT NOT NULL REFERENCES Issuers(Id),
  Kind         NVARCHAR(50) NOT NULL,
  Segment      NVARCHAR(50) NOT NULL,
  Nominal      DECIMAL(18,2) NOT NULL,
  Volume       INT NOT NULL,
  Rate         DECIMAL(5,2) NOT NULL CONSTRAINT DF_Sec_Rate DEFAULT 0,
  ExpenseRatio DECIMAL(5,2) NOT NULL CONSTRAINT DF_Sec_Exp DEFAULT 0,
  Status       NVARCHAR(30) NOT NULL CONSTRAINT DF_Sec_Status DEFAULT N'Черновик',
  CONSTRAINT CK_Sec_Status CHECK (Status IN (N'Черновик',N'На регистрации',N'Зарегистрирован',N'Размещён')));
GO

-- Update_v3: рыночная цена и предыдущая цена (для «Растут / Падают» и оценки портфеля)
IF COL_LENGTH('Securities', 'Price') IS NULL
  ALTER TABLE Securities ADD Price DECIMAL(18,2) NOT NULL CONSTRAINT DF_Sec_Price DEFAULT 0;
GO
IF COL_LENGTH('Securities', 'PrevPrice') IS NULL
  ALTER TABLE Securities ADD PrevPrice DECIMAL(18,2) NOT NULL CONSTRAINT DF_Sec_Prev DEFAULT 0;
GO

/* ---------------- 3. Портфель и сделки ---------------- */
IF OBJECT_ID('Holdings', 'U') IS NULL
CREATE TABLE Holdings(
  Id            INT IDENTITY(1,1) PRIMARY KEY,
  DepoAccountId INT NOT NULL REFERENCES DepoAccounts(Id) ON DELETE CASCADE,
  SecurityId    INT NOT NULL REFERENCES Securities(Id),
  Quantity      INT NOT NULL CONSTRAINT CK_Holdings_Qty CHECK (Quantity >= 0),
  TargetPct     DECIMAL(5,2) NOT NULL CONSTRAINT DF_Holdings_Tgt DEFAULT 0,
  CONSTRAINT UQ_Holdings UNIQUE(DepoAccountId, SecurityId));
GO

IF OBJECT_ID('Transactions', 'U') IS NULL
CREATE TABLE Transactions(
  Id            INT IDENTITY(1,1) PRIMARY KEY,
  DepoAccountId INT NOT NULL REFERENCES DepoAccounts(Id) ON DELETE CASCADE,
  SecurityId    INT NOT NULL REFERENCES Securities(Id),
  Type          NVARCHAR(10) NOT NULL CONSTRAINT CK_Tx_Type CHECK (Type IN ('Buy','Sell')),
  Quantity      INT NOT NULL CONSTRAINT CK_Tx_Qty CHECK (Quantity > 0),
  Price         DECIMAL(18,2) NOT NULL,
  Commission    DECIMAL(18,2) NOT NULL,
  Status        NVARCHAR(20) NOT NULL CONSTRAINT DF_Tx_Status DEFAULT N'Новая',
  [Date]        DATETIME NOT NULL CONSTRAINT DF_Tx_Date DEFAULT GETDATE());
GO

IF OBJECT_ID('DepositCertificates', 'U') IS NULL
CREATE TABLE DepositCertificates(
  Id         INT IDENTITY(1,1) PRIMARY KEY,
  ClientId   INT NOT NULL REFERENCES Clients(Id) ON DELETE CASCADE,
  Amount     DECIMAL(18,2) NOT NULL,
  Rate       DECIMAL(5,2) NOT NULL,
  DemandRate DECIMAL(5,2) NOT NULL,
  StartDate  DATE NOT NULL,
  EndDate    DATE NOT NULL,
  Status     NVARCHAR(20) NOT NULL DEFAULT N'Оформлен');
GO

/* ---------------- 4. Инвестиционные проекты и журнал ---------------- */
IF OBJECT_ID('InvestmentProjects', 'U') IS NULL
CREATE TABLE InvestmentProjects(
  Id        INT IDENTITY(1,1) PRIMARY KEY,
  Name      NVARCHAR(200) NOT NULL,
  Rate      DECIMAL(6,2) NOT NULL,
  CashFlows NVARCHAR(500) NOT NULL);   -- ';'-список, первый элемент — начальные вложения
GO

IF OBJECT_ID('AuditLog', 'U') IS NULL
CREATE TABLE AuditLog(
  Id        INT IDENTITY(1,1) PRIMARY KEY,
  [At]      DATETIME NOT NULL DEFAULT GETDATE(),
  UserLogin NVARCHAR(50) NULL,
  Action    NVARCHAR(100) NULL,
  Details   NVARCHAR(500) NULL);
GO

/* ---------------- 5. История цен и предложения о продаже ---------------- */
IF OBJECT_ID('PriceHistory', 'U') IS NULL
CREATE TABLE PriceHistory(
  Id         BIGINT IDENTITY(1,1) PRIMARY KEY,
  SecurityId INT NOT NULL REFERENCES Securities(Id) ON DELETE CASCADE,
  [At]       DATETIME NOT NULL,
  Price      DECIMAL(18,2) NOT NULL);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_PriceHistory')
  CREATE UNIQUE INDEX UX_PriceHistory ON PriceHistory(SecurityId, [At]);
GO

IF OBJECT_ID('Listings', 'U') IS NULL
CREATE TABLE Listings(
  Id             INT IDENTITY(1,1) PRIMARY KEY,
  SellerClientId INT NOT NULL REFERENCES Clients(Id) ON DELETE CASCADE,
  SecurityId     INT NOT NULL REFERENCES Securities(Id),
  Quantity       INT NOT NULL CONSTRAINT CK_Listings_Qty CHECK (Quantity >= 0),
  Price          DECIMAL(18,2) NOT NULL CONSTRAINT CK_Listings_Price CHECK (Price > 0),
  Status         NVARCHAR(20) NOT NULL CONSTRAINT DF_Listings_Status DEFAULT N'Активно',
  CreatedAt      DATETIME NOT NULL CONSTRAINT DF_Listings_Created DEFAULT GETDATE());
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Listings')
  CREATE INDEX IX_Listings ON Listings(SecurityId, Status);
GO

/* ---------------- 6. Сессии (новое: нужно общему серверу) ----------------
   В исходной базе таблицы не было — её использует сервер, чтобы веб-версия
   и десктоп входили по одному токену и не разлогинивались при перезапуске. */
IF OBJECT_ID('Sessions', 'U') IS NULL
CREATE TABLE Sessions(
  Token     NVARCHAR(64) NOT NULL PRIMARY KEY,
  UserId    INT NOT NULL REFERENCES Users(Id) ON DELETE CASCADE,
  Login     NVARCHAR(50) NOT NULL,
  Role      NVARCHAR(20) NOT NULL,
  ClientId  INT NULL,
  Client    NVARCHAR(200) NOT NULL DEFAULT N'',
  Lang      INT NOT NULL DEFAULT 0,
  CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
  SeenAt    DATETIME NOT NULL DEFAULT GETDATE());
GO

/* =====================================================================
   7. Процедуры — тексты из Update_v4.sql.
   Тексты процедур оставлены дословно как в Update_v4.sql; сервер тоже
   пишет время через GETDATE(), поэтому время приложения, процедур и
   сервера всегда совпадает (одни и те же часы SQL Server).
   ===================================================================== */
-- CREATE OR ALTER появился только в SQL Server 2016 SP1, поэтому используем
-- пару DROP + CREATE: результат тот же (процедура пересоздаётся), но работает везде.
IF OBJECT_ID('usp_UpdatePrices', 'P') IS NOT NULL
  DROP PROCEDURE usp_UpdatePrices;
GO
CREATE PROCEDURE usp_UpdatePrices AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @r INT, @added INT = 0;
  EXEC @r = sp_getapplock @Resource = 'BankInvest.UpdatePrices', @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 0;
  IF @r < 0 BEGIN SELECT 0; RETURN; END
  BEGIN TRY
    DECLARE @now DATETIME = DATEADD(HOUR, DATEDIFF(HOUR, 0, GETDATE()), 0);   -- начало текущего часа
    INSERT PriceHistory(SecurityId, [At], Price)                                  -- новые бумаги: стартовая точка
    SELECT s.Id, @now, s.Price FROM Securities s
    WHERE s.Status = N'Размещён' AND s.Price > 0 AND NOT EXISTS (SELECT 1 FROM PriceHistory p WHERE p.SecurityId = s.Id);
    SET @added += @@ROWCOUNT;

    DECLARE @h DATETIME = (SELECT DATEADD(HOUR, 1, MIN(l.At)) FROM (SELECT SecurityId, MAX([At]) AS At FROM PriceHistory GROUP BY SecurityId) l);
    IF @h IS NULL SET @h = @now;
    IF @h < DATEADD(HOUR, -1440, @now) SET @h = DATEADD(HOUR, -1440, @now);

    WHILE @h <= @now
    BEGIN
      IF OBJECT_ID('tempdb..#n') IS NOT NULL DROP TABLE #n;
      SELECT s.Id AS SecurityId, l.p AS p, s.Nominal AS Nominal,
             1 + (CASE s.Segment WHEN N'Gov Bonds' THEN 0.0005 WHEN N'Corp Bonds' THEN 0.0010 ELSE 0.0035 END)
                 * ((ABS(CHECKSUM(NEWID())) % 2001 - 1000) / 1000.0) AS f,
             CASE WHEN s.Segment IN (N'Gov Bonds', N'Corp Bonds') THEN 0.85 ELSE 0.35 END AS lo,
             CASE WHEN s.Segment IN (N'Gov Bonds', N'Corp Bonds') THEN 1.15 ELSE 3.00 END AS hi
      INTO #n
      FROM Securities s
      CROSS APPLY (SELECT TOP 1 p.Price AS p FROM PriceHistory p WHERE p.SecurityId = s.Id AND p.[At] < @h ORDER BY p.[At] DESC) l
      WHERE s.Status = N'Размещён'
        AND NOT EXISTS (SELECT 1 FROM PriceHistory x WHERE x.SecurityId = s.Id AND x.[At] = @h);

      INSERT PriceHistory(SecurityId, [At], Price)
      SELECT SecurityId, @h,
             CAST(CASE WHEN p * f < Nominal * lo THEN Nominal * lo
                       WHEN p * f > Nominal * hi THEN Nominal * hi
                       ELSE p * f END AS DECIMAL(18,2))
      FROM #n;
      SET @added += @@ROWCOUNT;
      DROP TABLE #n;
      SET @h = DATEADD(HOUR, 1, @h);
    END

    UPDATE s SET
      Price = ISNULL((SELECT TOP 1 p.Price FROM PriceHistory p WHERE p.SecurityId = s.Id ORDER BY p.[At] DESC), s.Price),
      PrevPrice = ISNULL((SELECT TOP 1 p.Price FROM PriceHistory p WHERE p.SecurityId = s.Id AND p.[At] <= DATEADD(HOUR, -24, @now) ORDER BY p.[At] DESC), s.Price)
    FROM Securities s WHERE s.Status = N'Размещён';
  END TRY
  BEGIN CATCH
    SET @added = 0;
  END CATCH;
  EXEC sp_releaseapplock @Resource = 'BankInvest.UpdatePrices', @LockOwner = 'Session';
  SELECT @added;
END
GO

IF OBJECT_ID('usp_BuyListing', 'P') IS NOT NULL
  DROP PROCEDURE usp_BuyListing;
GO
CREATE PROCEDURE usp_BuyListing @ListingId INT, @BuyerId INT, @Qty INT AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRAN;
  DECLARE @sec INT, @seller INT, @price DECIMAL(18,2), @left INT;
  SELECT @sec = SecurityId, @seller = SellerClientId, @price = Price, @left = Quantity
  FROM Listings WITH (UPDLOCK, HOLDLOCK) WHERE Id = @ListingId AND Status = N'Активно';
  IF @sec IS NULL BEGIN ROLLBACK; RAISERROR(N'ERR_NOLISTING', 16, 1); RETURN; END
  IF @seller = @BuyerId BEGIN ROLLBACK; RAISERROR(N'ERR_OWN', 16, 1); RETURN; END
  IF @Qty <= 0 OR @Qty > @left BEGIN ROLLBACK; RAISERROR(N'ERR_QTY', 16, 1); RETURN; END
  DECLARE @sa INT = (SELECT TOP 1 Id FROM DepoAccounts WHERE ClientId = @seller);
  DECLARE @ba INT = (SELECT TOP 1 Id FROM DepoAccounts WHERE ClientId = @BuyerId);
  IF @sa IS NULL OR @ba IS NULL BEGIN ROLLBACK; RAISERROR(N'ERR_ACC', 16, 1); RETURN; END

  UPDATE Holdings SET Quantity = Quantity - @Qty
  WHERE DepoAccountId = @sa AND SecurityId = @sec AND Quantity >= @Qty;
  IF @@ROWCOUNT = 0 BEGIN ROLLBACK; RAISERROR(N'ERR_SELLERQTY', 16, 1); RETURN; END
  DELETE FROM Holdings WHERE DepoAccountId = @sa AND SecurityId = @sec AND Quantity = 0;

  IF EXISTS (SELECT 1 FROM Holdings WHERE DepoAccountId = @ba AND SecurityId = @sec)
    UPDATE Holdings SET Quantity = Quantity + @Qty WHERE DepoAccountId = @ba AND SecurityId = @sec;
  ELSE
    INSERT Holdings(DepoAccountId, SecurityId, Quantity) VALUES (@ba, @sec, @Qty);

  UPDATE Listings SET Quantity = Quantity - @Qty,
                      Status = CASE WHEN Quantity - @Qty = 0 THEN N'Продано' ELSE Status END
  WHERE Id = @ListingId;

  DECLARE @comm DECIMAL(18,2) = ROUND(@price * @Qty * 0.005, 2);   -- 0,5 % с каждой стороны
  INSERT Transactions(DepoAccountId, SecurityId, Type, Quantity, Price, Commission, Status, [Date])
  VALUES (@ba, @sec, 'Buy',  @Qty, @price, @comm, N'Исполнена', GETDATE()),
         (@sa, @sec, 'Sell', @Qty, @price, @comm, N'Исполнена', GETDATE());
  COMMIT;
END
GO

/* Отзыв предложения: UPDATE в сервере не требует курсора,
   поэтому отдельной процедуры нет — используется UPDATE + @@ROWCOUNT. */

/* ---------------- 8. Права на процедуры для логина приложения ----------------
   Без EXECUTE логин приложения не может ни вызвать процедуру, ни увидеть её
   в sys.procedures / sys.objects (SQL Server скрывает объекты без прав).
   Пользователь базы создаётся отдельно (см. README_RU.md), поэтому под проверкой. */
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'bankinvest' AND type IN ('S','U'))
BEGIN
  GRANT EXECUTE ON OBJECT::dbo.usp_UpdatePrices TO bankinvest;
  GRANT EXECUTE ON OBJECT::dbo.usp_BuyListing   TO bankinvest;
END
GO

PRINT N'BankInvest: схема готова';
GO
