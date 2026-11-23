/* =====================================================================
   BankInvest — демо-данные (SQL Server)
   ---------------------------------------------------------------------
   Это Database.sql + Update_v2.sql + Update_v3.sql + Update_v4.sql,
   сведённые в один идемпотентный скрипт:
     * повторный запуск не создаёт дублей (проверки UNP / Symbol / Name);
     * входы и пароли — ровно те, что были в исходной базе.

   Тестовые входы:
     Администратор   User ID : admin                     / admin123
     Сотрудники      User ID : employee (emp123), ivanova, kozlov / emp123
     Предприятия     Company : 100200300, 190456789, ... / client123
     Физлица         User ID : client (client123), ivanov, petrova, sidorov / user123
   ===================================================================== */

SET NOCOUNT ON;
GO

/* ---------------- 1. Клиенты ---------------- */
IF NOT EXISTS (SELECT 1 FROM Clients)
INSERT Clients(Name,UNP,Address,Contacts) VALUES
 (N'ООО «Альфа»',           '100200300', N'г. Минск, ул. Мясникова 1',         N'+375 17 000-00-00'),
 (N'ООО «Вектор Плюс»',     '100234567', N'г. Минск, ул. Тимирязева 65Б',      N'+375 17 234-56-78');
GO

IF NOT EXISTS (SELECT 1 FROM Clients WHERE UNP = '190456789')
INSERT Clients(Name,UNP,Address,Contacts,Status,Kind) VALUES
 (N'ООО «БелТехСервис»',      '190456789', N'г. Минск, пр. Независимости 58',    N'+375 29 111-22-33', N'Активен','Company'),
 (N'ЗАО «Полесье-Агро»',      '291234567', N'г. Брест, ул. Советская 14',        N'+375 33 222-33-44', N'Активен','Company'),
 (N'ОАО «МинскСтройИнвест»',  '100987654', N'г. Минск, ул. Ленина 3',            N'+375 17 333-44-55', N'Активен','Company'),
 (N'ИП Козлов А. В.',         '590123456', N'г. Гродно, ул. Горького 21',        N'+375 29 444-55-66', N'Активен','Company'),
 (N'ООО «ГомельЛогистик»',    '490765432', N'г. Гомель, ул. Рогачёвская 9',      N'+375 44 555-66-77', N'Активен','Company'),
 (N'ЧУП «Витебск-Текстиль»',  '390654321', N'г. Витебск, пр. Фрунзе 40',         N'+375 29 666-77-88', N'Активен','Company'),
 (N'ООО «СмартФинанс»',       '191345678', N'г. Минск, ул. Притыцкого 62',       N'+375 25 777-88-99', N'Активен','Company'),
 (N'Иванов Сергей Петрович',  '900000001', N'г. Минск, ул. Берута 11-45',        N'+375 29 100-10-10', N'Активен','Personal'),
 (N'Петрова Анна Игоревна',   '900000002', N'г. Могилёв, ул. Первомайская 5-12', N'+375 33 200-20-20', N'Активен','Personal'),
 (N'Сидоров Максим Олегович', '900000003', N'г. Брест, ул. Московская 77-3',     N'+375 44 300-30-30', N'Активен','Personal');
GO

/* ---------------- 2. Эмитенты ---------------- */
INSERT Issuers(Name)
SELECT v.Name FROM (VALUES
 (N'Министерство финансов РБ'), (N'ОАО «Белагропромбанк»'), (N'ОАО «АСБ Беларусбанк»'),
 (N'ОАО «Белнефтехим-Инвест»'), (N'ОАО «МинскСтройИнвест»'), (N'ЗАО «Полесье-Агро»'),
 (N'ОАО «БелЭнерго-Финанс»'),   (N'ООО «ТехноПарк Инвест»'), (N'ОАО «БПС-Банк»'),
 (N'ОАО «МТ-Банк»'),            (N'ОАО «ЗелёнаяЭнергия-Инвест»')
) v(Name)
WHERE NOT EXISTS (SELECT 1 FROM Issuers i WHERE i.Name = v.Name);
GO

/* ---------------- 3. Ценные бумаги ---------------- */
INSERT Securities(Symbol,Name,IssuerId,Kind,Segment,Nominal,Volume,Rate,ExpenseRatio,Status,Price,PrevPrice)
SELECT v.Symbol, v.Name, i.Id, v.Kind, v.Segment, v.Nominal, v.Volume, v.Rate, v.Exp, v.Status, v.Price, v.Prev
FROM (VALUES
 (N'BYN-GB1',N'Облигации Минфина',              N'Министерство финансов РБ',   N'Облигация', N'Gov Bonds', 100, 100000, 12.5, 0.20, N'Размещён',        101.20, 100.40),
 (N'AGPB-B2',N'Облигации Белагропромбанка',     N'ОАО «Белагропромбанк»',      N'Облигация', N'Corp Bonds', 50,  50000, 14.0, 0.35, N'Размещён',         49.60,  50.30),
 (N'AGPB-S', N'Акции Белагропромбанка',         N'ОАО «Белагропромбанк»',      N'Акция',     N'Equity',     10, 200000,  0,   0.50, N'Размещён',         12.40,  11.60),
 (N'BYN-GB2',N'Облигации Минфина II',           N'Министерство финансов РБ',   N'Облигация', N'Gov Bonds', 100,  80000, 13.0, 0.20, N'Зарегистрирован', 100.00, 100.00),
 (N'BNH-B1', N'Облигации Белнефтехим-Инвест',   N'ОАО «Белнефтехим-Инвест»',   N'Облигация', N'Corp Bonds', 100,  60000, 13.50,0.30, N'Размещён',        102.30, 100.80),
 (N'MSI-B2', N'Облигации МинскСтройИнвест',     N'ОАО «МинскСтройИнвест»',     N'Облигация', N'Corp Bonds',  50,  40000, 14.20,0.35, N'Размещён',         49.20,  50.60),
 (N'PAG-S',  N'Акции Полесье-Агро',             N'ЗАО «Полесье-Агро»',         N'Акция',     N'Equity',      10, 300000,  0,   0.50, N'Размещён',         14.85,  13.90),
 (N'BEF-S',  N'Акции БелЭнерго-Финанс',         N'ОАО «БелЭнерго-Финанс»',     N'Акция',     N'Equity',      10, 250000,  0,   0.50, N'Размещён',         11.20,  12.35),
 (N'TPI-S',  N'Акции ТехноПарк Инвест',         N'ООО «ТехноПарк Инвест»',     N'Акция',     N'Equity',      20, 120000,  0,   0.55, N'Размещён',         31.70,  29.40),
 (N'BYN-GB3',N'Облигации Минфина III',          N'Министерство финансов РБ',   N'Облигация', N'Gov Bonds',  100,  90000, 12.80,0.20, N'Размещён',        100.60, 100.10),
 (N'BYN-GB4',N'Облигации Минфина IV',           N'Министерство финансов РБ',   N'Облигация', N'Gov Bonds',  100,  70000, 13.10,0.20, N'Размещён',         98.90,  99.70),
 (N'ASB-B1', N'Облигации Беларусбанка',         N'ОАО «АСБ Беларусбанк»',      N'Облигация', N'Corp Bonds', 100,  80000, 13.90,0.25, N'Размещён',        103.10, 102.20),
 (N'ASB-S',  N'Акции Беларусбанка',             N'ОАО «АСБ Беларусбанк»',      N'Акция',     N'Equity',      25, 400000,  0,   0.45, N'Размещён',         41.30,  39.10),
 (N'BPS-B1', N'Облигации БПС-Банка',            N'ОАО «БПС-Банк»',             N'Облигация', N'Corp Bonds',  50,  50000, 14.00,0.30, N'Размещён',         51.10,  51.90),
 (N'MTB-S',  N'Акции МТ-Банка',                 N'ОАО «МТ-Банк»',              N'Акция',     N'Equity',      15, 180000,  0,   0.50, N'Размещён',         17.60,  17.95),
 (N'GEI-B1', N'Облигации ЗелёнаяЭнергия-Инвест',N'ОАО «ЗелёнаяЭнергия-Инвест»',N'Облигация', N'Corp Bonds', 100,  30000, 12.00,0.30, N'Размещён',        100.00, 100.00),
 (N'BEF-B1', N'Облигации БелЭнерго-Финанс',     N'ОАО «БелЭнерго-Финанс»',     N'Облигация', N'Corp Bonds', 100,  45000, 13.00,0.30, N'На регистрации',  100.00, 100.00),
 (N'TPI-B1', N'Облигации ТехноПарк Инвест',     N'ООО «ТехноПарк Инвест»',     N'Облигация', N'Corp Bonds', 100,  35000, 14.50,0.35, N'Зарегистрирован', 100.00, 100.00)
) v(Symbol,Name,Issuer,Kind,Segment,Nominal,Volume,Rate,Exp,Status,Price,Prev)
JOIN Issuers i ON i.Name = v.Issuer
WHERE NOT EXISTS (SELECT 1 FROM Securities s WHERE s.Symbol = v.Symbol);
GO

/* ---------------- 4. Пользователи и счета депо ---------------- */
IF NOT EXISTS (SELECT 1 FROM Users WHERE Login='admin')
INSERT Users(CompanyId,Login,PasswordHash,Role) VALUES
 ('ASB','admin', CONVERT(CHAR(64),HASHBYTES('SHA2_256','admin123'),2),'Admin');
GO
IF NOT EXISTS (SELECT 1 FROM Users WHERE Login='employee')
INSERT Users(CompanyId,Login,PasswordHash,Role) VALUES
 ('ASB','employee',CONVERT(CHAR(64),HASHBYTES('SHA2_256','emp123'),2),'Employee');
GO
IF NOT EXISTS (SELECT 1 FROM Users WHERE Login='ivanova')
INSERT Users(CompanyId,Login,PasswordHash,Role) VALUES
 ('ASB','ivanova',CONVERT(CHAR(64),HASHBYTES('SHA2_256','emp123'),2),'Employee');
GO
IF NOT EXISTS (SELECT 1 FROM Users WHERE Login='kozlov')
INSERT Users(CompanyId,Login,PasswordHash,Role) VALUES
 ('ASB','kozlov', CONVERT(CHAR(64),HASHBYTES('SHA2_256','emp123'),2),'Employee');
GO

-- вход предприятия: Company ID = Login = УНП
INSERT Users(CompanyId,Login,PasswordHash,Role,ClientId)
SELECT UNP, UNP, CONVERT(CHAR(64),HASHBYTES('SHA2_256','client123'),2), 'Client', Id
FROM Clients c
WHERE Kind = 'Company'
  AND NOT EXISTS (SELECT 1 FROM Users u WHERE u.ClientId = c.Id AND u.CompanyId = c.UNP);
GO

-- физические лица: вход по User ID
INSERT Users(CompanyId,Login,PasswordHash,Role,ClientId)
SELECT 'PERSONAL', v.Login, CONVERT(CHAR(64),HASHBYTES('SHA2_256','user123'),2), 'Client', c.Id
FROM (VALUES ('900000001','ivanov'),('900000002','petrova'),('900000003','sidorov')) v(UNP,Login)
JOIN Clients c ON c.UNP = v.UNP
WHERE NOT EXISTS (SELECT 1 FROM Users u WHERE u.Login = v.Login AND u.CompanyId = 'PERSONAL');
GO

-- клиент `client` из прежнего демо-набора (вход по User ID)
IF NOT EXISTS (SELECT 1 FROM Users WHERE Login='client')
INSERT Users(CompanyId,Login,PasswordHash,Role,ClientId)
SELECT 'PERSONAL','client',CONVERT(CHAR(64),HASHBYTES('SHA2_256','client123'),2),'Client',Id
FROM Clients WHERE UNP='100234567';
GO

INSERT DepoAccounts(ClientId,Number)
SELECT Id, 'DEPO-' + UNP FROM Clients c
WHERE NOT EXISTS (SELECT 1 FROM DepoAccounts d WHERE d.ClientId = c.Id);
GO

/* ---------------- 5. Портфели ---------------- */
INSERT Holdings(DepoAccountId,SecurityId,Quantity,TargetPct)
SELECT d.Id, s.Id, v.Qty, v.Tgt
FROM (VALUES
 ('100200300','BNH-B1',150, 0),('100200300','TPI-S',  80, 0),
 ('190456789','BYN-GB1',600,40),('190456789','BNH-B1',300,30),('190456789','PAG-S',1200,20),('190456789','ASB-B1',100,10),
 ('291234567','AGPB-S',2000,35),('291234567','BYN-GB3',400,40),('291234567','MSI-B2',500,15),('291234567','BEF-S',700,10),
 ('100987654','BYN-GB1',300,30),('100987654','BYN-GB4',500,30),('100987654','ASB-S',400,25),('100987654','MTB-S',600,15),
 ('590123456','ASB-B1',200,50),('590123456','GEI-B1',150,30),('590123456','PAG-S',300,20),
 ('490765432','BYN-GB3',700,45),('490765432','BPS-B1',500,25),('490765432','TPI-S',150,20),('490765432','MTB-S',400,10),
 ('390654321','AGPB-B2',800,30),('390654321','BNH-B1',350,30),('390654321','BEF-S',500,20),('390654321','GEI-B1',250,20),
 ('191345678','TPI-S',400,40),('191345678','ASB-S',250,30),('191345678','PAG-S',600,30),
 ('900000001','BYN-GB1',50,50),('900000001','ASB-B1',30,30),('900000001','MTB-S',100,20),
 ('900000002','GEI-B1',40,60),('900000002','BYN-GB3',20,40),
 ('900000003','PAG-S',150,50),('900000003','TPI-S',60,50)
) v(UNP,Symbol,Qty,Tgt)
JOIN Clients c ON c.UNP = v.UNP
JOIN DepoAccounts d ON d.ClientId = c.Id
JOIN Securities s ON s.Symbol = v.Symbol
WHERE NOT EXISTS (SELECT 1 FROM Holdings h WHERE h.DepoAccountId = d.Id AND h.SecurityId = s.Id);
GO

/* ---------------- 6. История сделок ---------------- */
INSERT Transactions(DepoAccountId,SecurityId,Type,Quantity,Price,Commission,Status,[Date])
SELECT d.Id, s.Id, v.Type, v.Qty, s.Price,
       CAST(ROUND(v.Qty*s.Price*0.005,2) AS DECIMAL(18,2)), v.Status,
       DATEADD(MINUTE, -(v.Days*1440 + v.Qty % 600), GETDATE())
FROM (VALUES
 ('190456789','BYN-GB1','Buy',600, N'Исполнена',58),('190456789','BNH-B1','Buy',300, N'Исполнена',51),
 ('190456789','PAG-S', 'Buy',1200,N'Исполнена',44),('190456789','ASB-B1','Buy',100, N'Исполнена',30),
 ('190456789','MTB-S', 'Buy',200, N'Исполнена',21),('190456789','MTB-S', 'Sell',200,N'Исполнена',9),
 ('291234567','AGPB-S','Buy',2000,N'Исполнена',55),('291234567','BYN-GB3','Buy',400,N'Исполнена',47),
 ('291234567','MSI-B2','Buy',500, N'Исполнена',39),('291234567','BEF-S', 'Buy',900,N'Исполнена',28),
 ('291234567','BEF-S', 'Sell',200,N'Исполнена',12),
 ('100987654','BYN-GB1','Buy',300,N'Исполнена',49),('100987654','BYN-GB4','Buy',500,N'Исполнена',41),
 ('100987654','ASB-S', 'Buy',400,N'Исполнена',33),('100987654','MTB-S', 'Buy',600,N'Исполнена',25),
 ('590123456','ASB-B1','Buy',200,N'Исполнена',36),('590123456','GEI-B1','Buy',150,N'Исполнена',27),
 ('590123456','PAG-S', 'Buy',300,N'Исполнена',15),
 ('490765432','BYN-GB3','Buy',700,N'Исполнена',46),('490765432','BPS-B1','Buy',500,N'Исполнена',38),
 ('490765432','TPI-S', 'Buy',150,N'Исполнена',20),
 ('390654321','AGPB-B2','Buy',800,N'Исполнена',52),('390654321','BNH-B1','Buy',350,N'Исполнена',43),
 ('390654321','GEI-B1','Buy',250,N'Исполнена',19),
 ('191345678','TPI-S', 'Buy',400,N'Исполнена',31),('191345678','ASB-S','Buy',250,N'Исполнена',22),
 ('191345678','PAG-S', 'Sell',100,N'Исполнена',6),
 ('900000001','BYN-GB1','Buy',50, N'Исполнена',34),('900000001','ASB-B1','Buy',30, N'Исполнена',18),
 ('900000002','GEI-B1','Buy',40, N'Исполнена',29),('900000002','BYN-GB3','Buy',20, N'Исполнена',14),
 ('900000003','PAG-S','Buy',150, N'Исполнена',26),('900000003','TPI-S','Buy',60, N'Исполнена',8),
 ('100200300','BNH-B1','Buy',150,N'Исполнена',16),('100200300','TPI-S','Buy',80, N'Исполнена',3)
) v(UNP,Symbol,Type,Qty,Status,Days)
JOIN Clients c ON c.UNP = v.UNP
JOIN DepoAccounts d ON d.ClientId = c.Id
JOIN Securities s ON s.Symbol = v.Symbol
WHERE NOT EXISTS (SELECT 1 FROM Transactions t WHERE t.DepoAccountId = d.Id AND t.SecurityId = s.Id AND t.Type = v.Type);
GO

/* ---------------- 7. Депозитные сертификаты ---------------- */
INSERT DepositCertificates(ClientId,Amount,Rate,DemandRate,StartDate,EndDate,Status)
SELECT c.Id, v.Amount, v.Rate, v.Demand,
       DATEADD(DAY,v.StartOff,CAST(GETDATE() AS DATE)),
       DATEADD(DAY,v.StartOff+v.Dur,CAST(GETDATE() AS DATE)), v.Status
FROM (VALUES
 ('190456789',50000,14.5,1.0,-90,180,N'Активен'),('291234567',120000,15.0,1.0,-200,365,N'Активен'),
 ('100987654',80000,14.0,1.0,-400,365,N'Погашен'),('590123456',15000,13.5,1.0,-30,90,N'Активен'),
 ('490765432',60000,14.8,1.0,-10,270,N'Оформлен'),('191345678',25000,13.9,1.0,-120,180,N'Активен')
) v(UNP,Amount,Rate,Demand,StartOff,Dur,Status)
JOIN Clients c ON c.UNP = v.UNP
WHERE NOT EXISTS (SELECT 1 FROM DepositCertificates x WHERE x.ClientId = c.Id);
GO

/* ---------------- 8. Инвестиционные проекты ---------------- */
INSERT InvestmentProjects(Name,Rate,CashFlows)
SELECT v.Name, v.Rate, v.CF FROM (VALUES
 (N'Модернизация филиала',                  10, N'-1000;300;400;500;300'),
 (N'Модернизация склада',                   12, N'-150000;45000;60000;70000;50000'),
 (N'Солнечная электростанция',              10, N'-300000;80000;90000;95000;100000;60000'),
 (N'Открытие нового отделения в Гродно',    12, N'-2500;600;800;1000;1200;900'),
 (N'Внедрение системы цифровых платежей',   15, N'-1800;400;700;900;1100'),
 (N'Модернизация банкоматной сети',         10, N'-1200;250;350;450;500;500'),
 (N'Мобильное приложение для малого бизнеса',14, N'-900;100;300;500;700'),
 (N'Покупка офисного здания',                9, N'-5000;700;700;700;700;700;5200'),
 (N'Расширение колл-центра',                16, N'-1500;200;250;300;300')
) v(Name,Rate,CF)
WHERE NOT EXISTS (SELECT 1 FROM InvestmentProjects p WHERE p.Name = v.Name);
GO

/* ---------------- 9. Журнал действий ---------------- */
IF NOT EXISTS (SELECT 1 FROM AuditLog)
INSERT AuditLog([At],UserLogin,Action,Details) VALUES
 (DATEADD(DAY,-3,GETDATE()),'admin',  N'Вход в систему',''),
 (DATEADD(DAY,-3,GETDATE()),'admin',  N'Создан сотрудник','ivanova'),
 (DATEADD(DAY,-2,GETDATE()),'ivanova',N'Вход в систему',''),
 (DATEADD(DAY,-1,GETDATE()),'kozlov', N'Вход в систему','');
GO

/* ---------------- 10. История цен: почасовая за 60 суток + ежедневная за ~6 лет ----------------
   Случайное блуждание, пересчитанное так, чтобы последняя точка равнялась текущей цене бумаги.
   Выполняется только если истории ещё нет. */
IF NOT EXISTS (SELECT 1 FROM PriceHistory)
BEGIN
  DECLARE @now DATETIME = DATEADD(HOUR, DATEDIFF(HOUR, 0, GETDATE()), 0);
  DECLARE @today DATETIME = DATEADD(DAY, DATEDIFF(DAY, 0, GETDATE()), 0);

  SELECT TOP (1440) CAST(ROW_NUMBER() OVER (ORDER BY (SELECT 1)) - 1 AS INT) AS k INTO #hk FROM sys.all_objects a CROSS JOIN sys.all_objects b;
  SELECT TOP (2200) CAST(ROW_NUMBER() OVER (ORDER BY (SELECT 1)) + 60 AS INT) AS k INTO #dk FROM sys.all_objects a CROSS JOIN sys.all_objects b;

  SELECT DATEADD(HOUR, -k, @now) AS At, 'h' AS Grain INTO #times FROM #hk
  UNION ALL SELECT DATEADD(DAY, -k, @today), 'd' FROM #dk;

  SELECT s.Id AS SecurityId, t.At,
         LOG(1 + (CASE WHEN s.Segment = N'Gov Bonds'  THEN (CASE t.Grain WHEN 'h' THEN 0.0005 ELSE 0.0025 END)
                       WHEN s.Segment = N'Corp Bonds' THEN (CASE t.Grain WHEN 'h' THEN 0.0010 ELSE 0.0050 END)
                       ELSE                                (CASE t.Grain WHEN 'h' THEN 0.0035 ELSE 0.0120 END) END)
                  * ((ABS(CHECKSUM(NEWID())) % 2001 - 1000) / 1000.0)) AS lf
  INTO #g FROM Securities s CROSS JOIN #times t WHERE s.Status = N'Размещён';

  SELECT SecurityId, At, SUM(lf) OVER (PARTITION BY SecurityId ORDER BY At ROWS UNBOUNDED PRECEDING) AS cum INTO #c FROM #g;

  INSERT PriceHistory(SecurityId, [At], Price)
  SELECT c.SecurityId, c.At, CAST(s.Price * EXP(c.cum - c.lastcum) AS DECIMAL(18,2))
  FROM (SELECT SecurityId, At, cum, FIRST_VALUE(cum) OVER (PARTITION BY SecurityId ORDER BY At DESC) AS lastcum FROM #c) c
  JOIN Securities s ON s.Id = c.SecurityId;

  UPDATE s SET PrevPrice = ISNULL((SELECT TOP 1 p.Price FROM PriceHistory p WHERE p.SecurityId = s.Id AND p.[At] <= DATEADD(HOUR, -24, @now) ORDER BY p.[At] DESC), s.Price)
  FROM Securities s WHERE s.Status = N'Размещён';

  DROP TABLE #hk, #dk, #times, #g, #c;
END
GO

/* ---------------- 11. Предложения о продаже ---------------- */
INSERT Listings(SellerClientId, SecurityId, Quantity, Price)
SELECT c.Id, s.Id, v.Qty, CAST(ROUND(s.Price * v.F, 2) AS DECIMAL(18,2))
FROM (VALUES
 ('190456789','PAG-S',400,1.02),('190456789','BNH-B1',100,0.99),('190456789','BYN-GB1',200,1.01),
 ('291234567','AGPB-S',800,1.03),('291234567','BEF-S',300,0.98),('291234567','MSI-B2',200,1.00),
 ('100987654','ASB-S',150,1.02),('100987654','MTB-S',250,0.99),('100987654','BYN-GB4',300,1.01),
 ('590123456','GEI-B1',80,1.00),('590123456','PAG-S',150,1.04),
 ('490765432','BYN-GB3',300,0.995),('490765432','BPS-B1',200,1.01),('490765432','TPI-S',60,1.02),
 ('390654321','AGPB-B2',300,1.00),('390654321','BNH-B1',150,1.015),('390654321','BEF-S',200,1.03),
 ('191345678','TPI-S',150,0.985),('191345678','ASB-S',100,1.01),
 ('100200300','AGPB-S',300,1.00),('100200300','BYN-GB1',150,1.01),
 ('900000001','MTB-S',40,1.02),('900000003','PAG-S',50,1.01)
) v(UNP, Symbol, Qty, F)
JOIN Clients c ON c.UNP = v.UNP
JOIN Securities s ON s.Symbol = v.Symbol
WHERE NOT EXISTS (SELECT 1 FROM Listings l WHERE l.SellerClientId = c.Id AND l.SecurityId = s.Id AND l.Status = N'Активно');
GO

PRINT N'BankInvest: демо-данные загружены';
GO
