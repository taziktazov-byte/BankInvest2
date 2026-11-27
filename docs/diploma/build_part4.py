#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Глава 3, заключение, источники и приложения."""
from docx.shared import Cm

from build_part1 import bullet, caption, code_block, h1, h2, p, page_break, table


def chapter3(doc):
    h1(doc, "ГЛАВА 3 ГЕНЕРАЦИЯ ПРОГРАММНОГО КОДА")
    p(doc, "По построенной модели получен программный код. Серверная часть написана на "
           "JavaScript для платформы Node.js 22, клиентов два: веб-версия на HTML, CSS и "
           "JavaScript и оконное приложение на C# для .NET 8 (WPF). Хранение данных – Microsoft "
           "SQL Server, а правила исполнения сделок и обновления цен вынесены в хранимые процедуры.")
    p(doc, "Структура проекта повторяет диаграмму компонентов и приведена в таблице 3.1.")
    caption(doc, "Таблица 3.1 – Структура программного проекта")
    table(doc,
          ["Каталог / файл", "Состав", "Назначение"],
          [["server/src/server.js", "маршруты /api/*, статические файлы",
            "Интерфейс сервера (API)"],
           ["server/src/logic.js", "buy, sell, withdraw, portfolio, report, users",
            "Бизнес-логика"],
           ["server/src/db.js", "query, exec, tx, пул соединений",
            "Доступ к данным SQL Server"],
           ["server/src/i18n.json", "три языка интерфейса",
            "Локализация (русский, английский, белорусский)"],
           ["server/web/", "index.html, app.js, styles.css", "Веб-клиент"],
           ["server/src/tools/", "db-init, db-check, db-restore, sql-doctor",
            "Служебные скрипты развёртывания и диагностики"],
           ["db/schema.sql", "13 таблиц, 2 процедуры, права",
            "Схема базы данных"],
           ["db/seed.sql", "демонстрационные данные", "Наполнение базы"],
           ["*Form.cs, MainForm.cs", "окна WPF", "Десктоп-клиент"],
           ["Api.cs", "HTTP-клиент", "Обращение десктопа к серверу"]],
          [5.4, 5.6, 5.0])
    p(doc, "Пример полученного каркаса – функция покупки в бизнес-логике: она проверяет, что "
           "предложение существует и не принадлежит самому покупателю, затем передаёт исполнение "
           "хранимой процедуре и рассчитывает комиссию для ответа клиенту.")
    code_block(doc, [
        "async function buy(s, body) {",
        "  const listingId = Number(body.listingId);",
        "  const buyerId = isStaff(s) ? Number(body.clientId) : s.ClientId;",
        "  const qty = Number(body.qty);",
        "  if (!buyerId) throw err('e.noaccount');",
        "",
        "  const before = await get('SELECT * FROM Listings WHERE Id=?', listingId);",
        "  if (!before) throw err('e.nolisting');",
        "  if (Number(before.SellerClientId) === Number(buyerId)) throw err('e.own');",
        "",
        "  await exec('EXEC usp_BuyListing @ListingId=?, @BuyerId=?, @Qty=?',",
        "             listingId, buyerId, qty);",
        "",
        "  const price = Number(before.Price);",
        "  const comm  = round2(price * qty * COMMISSION_RATE);   // 0,5 % с каждой стороны",
        "  await D.audit(s.Login, 'Покупка по предложению', `Listing=${listingId} x${qty}`);",
        "  return { qty, price, amount: round2(price * qty), commission: comm };",
        "}",
    ])
    p(doc, "Главное правило учёта – целостность остатков – реализовано в базе данных. Процедура "
           "usp_BuyListing блокирует строку предложения, проверяет допустимость операции и "
           "изменяет три таблицы в одной транзакции: списывает бумаги у продавца, зачисляет их "
           "покупателю и уменьшает остаток предложения. Если хотя бы одна проверка не пройдена, "
           "выполняется ROLLBACK, и данные остаются прежними.")
    code_block(doc, [
        "CREATE PROCEDURE usp_BuyListing @ListingId INT, @BuyerId INT, @Qty INT AS",
        "BEGIN",
        "  SET NOCOUNT ON; SET XACT_ABORT ON;",
        "  BEGIN TRAN;",
        "  SELECT @sec = SecurityId, @seller = SellerClientId, @price = Price, @left = Quantity",
        "  FROM Listings WITH (UPDLOCK, HOLDLOCK) WHERE Id = @ListingId AND Status = N'Активно';",
        "  IF @sec IS NULL  BEGIN ROLLBACK; RAISERROR(N'ERR_NOLISTING', 16, 1); RETURN; END",
        "  IF @seller = @BuyerId BEGIN ROLLBACK; RAISERROR(N'ERR_OWN', 16, 1); RETURN; END",
        "  IF @Qty <= 0 OR @Qty > @left BEGIN ROLLBACK; RAISERROR(N'ERR_QTY', 16, 1); RETURN; END",
        "",
        "  UPDATE Holdings SET Quantity = Quantity - @Qty",
        "  WHERE DepoAccountId = @sa AND SecurityId = @sec AND Quantity >= @Qty;",
        "  IF @@ROWCOUNT = 0 BEGIN ROLLBACK; RAISERROR(N'ERR_SELLERQTY', 16, 1); RETURN; END",
        "",
        "  DECLARE @comm DECIMAL(18,2) = ROUND(@price * @Qty * 0.005, 2);  -- 0,5 %",
        "  INSERT Transactions(DepoAccountId, SecurityId, Type, Quantity, Price, Commission, Status)",
        "  VALUES (@ba, @sec, 'Buy',  @Qty, @price, @comm, N'Исполнена'),",
        "         (@sa, @sec, 'Sell', @Qty, @price, @comm, N'Исполнена');",
        "  COMMIT;",
        "END",
    ])
    p(doc, "По модели также построены диаграммы состояний и деятельности, и именно по ним "
           "проверяются переходы статусов: предложение нельзя выкупить, если оно не «Активно», а "
           "количество не может превысить остаток. Эти же правила видны клиенту в виде понятных "
           "сообщений на русском, английском и белорусском языках.")
    p(doc, "Состояние проекта и оставшийся объём работ определены дорожной картой (приложение Б). "
           "Выполнены основные механизмы: вход по токену, справочники клиентов, эмитентов и бумаг, "
           "портфель с переоценкой и целевыми долями, рынок предложений с частичным выкупом и "
           "отзывом, журнал сделок, отчёты, журнал действий и развёртывание базы скриптами. "
           "Ведётся разработка планирования инвестиционных проектов и напоминаний о погашении "
           "выпусков.")
    p(doc, "Работоспособность подтверждена автотестами серверной части: 20 проверок модулей и "
           "API выполняются командой npm test в каталоге server. Кроме того, в комплект входят "
           "скрипты диагностики (db-check, sql-doctor), которые проверяют подключение к SQL Server, "
           "наличие таблиц, прав на процедуры и права изменять схему.")
    p(doc, "Таким образом, генерация кода дала каркас, структура которого соответствует диаграммам "
           "классов и компонентов, а дорожная карта показывает, что уже сделано и что осталось "
           "выполнить.")
    page_break(doc)


def conclusion(doc):
    h1(doc, "ЗАКЛЮЧЕНИЕ")
    p(doc, "В ходе работы спроектирована сетевая программная система управления инвестициями и "
           "ценными бумагами банка. Выяснено, для кого она создаётся и какие задачи решает: клиент "
           "видит свой портфель и торгует бумагами, сотрудник обслуживает клиентов и ведёт выпуски, "
           "администратор управляет доступом, а руководитель получает отчёт о работе за период.")
    p(doc, "Проанализированы проблемы текущей организации работы: разрозненность данных, ручное "
           "согласование сделок, отсутствие гарантий целостности при одновременных операциях и "
           "непрозрачность структуры портфеля. Для каждой проблемы предложено мероприятие, а "
           "трассировочная матрица связала потребности участников с функциями системы и вариантами "
           "использования.")
    p(doc, "Разработан полный комплекс диаграмм UML: варианты использования с потоками событий и "
           "сценариями, диаграммы последовательности и кооперации для ключевой операции покупки, "
           "диаграмма классов с шаблонами Repository, Singleton и Command, диаграммы состояний "
           "выпуска и предложения, диаграмма деятельности с дорожками, а также диаграммы "
           "компонентов и размещения.")
    p(doc, "По модели получен работающий программный код: сервер на Node.js, веб-клиент и "
           "оконное приложение, единая база SQL Server с хранимыми процедурами. Благодаря этому "
           "веб-версия и десктоп работают с одними и теми же данными: сделка, совершённая в "
           "браузере, сразу видна сотруднику в его окне, а исполнение фиксируется в журнале "
           "действий.")
    p(doc, "Внедрение системы позволит собрать сведения о клиентах, портфелях и сделках в одной "
           "базе, исключить потерю данных при одновременных операциях и перейти от ручного "
           "согласования к прозрачному рынку предложений с понятными статусами.")
    page_break(doc)


def sources(doc):
    h1(doc, "СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ")
    items = [
        "О рынке ценных бумаг : Закон Респ. Беларусь от 12 марта 1992 г. № 1512-XII // "
        "Национальный правовой Интернет-портал Республики Беларусь. – URL: https://pravo.by "
        "(дата обращения: 21.11.2026).",
        "О защите персональных данных : Закон Респ. Беларусь от 7 мая 2021 г. № 99-З // "
        "Национальный правовой Интернет-портал Республики Беларусь. – URL: https://pravo.by "
        "(дата обращения: 21.11.2026).",
        "Буч, Г. Язык UML. Руководство пользователя / Г. Буч, Д. Рамбо, И. Якобсон. – 2-е изд. – "
        "М. : ДМК Пресс, 2006. – 496 с.",
        "Вендров, А. М. Проектирование программного обеспечения экономических информационных "
        "систем / А. М. Вендров. – 2-е изд. – М. : Финансы и статистика, 2006. – 544 с.",
        "Гамма, Э. Приёмы объектно-ориентированного проектирования. Паттерны проектирования / "
        "Э. Гамма, Р. Хелм, Р. Джонсон, Дж. Влиссидес. – СПб. : Питер, 2015. – 368 с.",
        "Ларман, К. Применение UML 2.0 и шаблонов проектирования / К. Ларман. – 3-е изд. – "
        "М. : Вильямс, 2013. – 736 с.",
        "Леоненков, А. В. Самоучитель UML 2 / А. В. Леоненков. – СПб. : БХВ-Петербург, 2007. – 576 с.",
        "Средства и технологии анализа и разработки информационных систем : метод. рекомендации "
        "и требования по выполнению самостоятельных работ для студентов спец. 1-40 05 01 "
        "«Информационные системы и технологии» / сост. : кафедра информационных технологий. – "
        "Пинск : ПолесГУ, 2026.",
        "Фаулер, М. Архитектура корпоративных программных приложений / М. Фаулер. – М. : "
        "Вильямс, 2006. – 544 с.",
        "SQL Server documentation / Microsoft Learn. – URL: https://learn.microsoft.com/sql "
        "(дата обращения: 21.11.2026).",
        "Node.js Documentation. – URL: https://nodejs.org/docs (дата обращения: 21.11.2026).",
        "mssql (npm package) documentation. – URL: https://www.npmjs.com/package/mssql "
        "(дата обращения: 21.11.2026).",
    ]
    for i, t in enumerate(items, 1):
        par = p(doc, f"{i}. {t}", first_line=0)
        par.paragraph_format.left_indent = Cm(0)
    page_break(doc)


def appendix_a(doc):
    h1(doc, "ПРИЛОЖЕНИЯ")
    p(doc, "ПРИЛОЖЕНИЕ А", align=1, first_line=0, bold=True)
    p(doc, "(обязательное)", align=1, first_line=0)
    p(doc, "Листинг основных модулей программного средства", align=1, first_line=0)
    p(doc, "", first_line=0)

    p(doc, "А.1 Функция покупки бумаги (server/src/logic.js)", first_line=0, bold=True)
    code_block(doc, [
        "async function buy(s, body) {",
        "  const listingId = Number(body.listingId);",
        "  // сотрудник может купить от имени выбранного клиента, клиент - только себе",
        "  const buyerId = isStaff(s) ? Number(body.clientId) : s.ClientId;",
        "  const qty = Number(body.qty);",
        "  if (!buyerId) throw err('e.noaccount');",
        "",
        "  const before = await get('SELECT * FROM Listings WHERE Id=?', listingId);",
        "  if (!before) throw err('e.nolisting');",
        "  if (Number(before.SellerClientId) === Number(buyerId)) throw err('e.own');",
        "",
        "  // всё остальное - одной транзакцией внутри SQL Server",
        "  await exec('EXEC usp_BuyListing @ListingId=?, @BuyerId=?, @Qty=?',",
        "             listingId, buyerId, qty);",
        "",
        "  const price = Number(before.Price);",
        "  const comm = round2(price * qty * COMMISSION_RATE);",
        "  const result = {",
        "    qty,",
        "    symbol: before.Symbol || await scalar('SELECT Symbol FROM Securities WHERE Id=?',",
        "                                            before.SecurityId),",
        "    price, amount: round2(price * qty), commission: comm,",
        "    total: round2(price * qty + comm),",
        "  };",
        "  await D.audit(s.Login, 'Покупка по предложению', `Listing=${listingId} x${qty}`);",
        "  return result;",
        "}",
    ])

    p(doc, "А.2 Выставление предложения о продаже (server/src/logic.js)", first_line=0, bold=True)
    code_block(doc, [
        "async function sell(s, body) {",
        "  const clientId = isStaff(s) ? Number(body.clientId) : s.ClientId;",
        "  const securityId = Number(body.securityId);",
        "  const qty = Number(body.qty);",
        "  const price = round2(body.price);",
        "  if (!clientId) throw err('e.noaccount');",
        "",
        "  const result = await tx(async t => {",
        "    const acc = await t.scalar('SELECT TOP (1) Id FROM DepoAccounts WHERE ClientId=?', clientId);",
        "    const have = await t.scalar('SELECT ISNULL(SUM(Quantity),0) FROM Holdings",
        "                                WHERE DepoAccountId=? AND SecurityId=?', acc, securityId);",
        "    // уже выставленные бумаги зарезервированы и продавать их повторно нельзя",
        "    const reserved = await t.scalar(`SELECT ISNULL(SUM(Quantity),0) FROM Listings",
        "                                     WHERE SellerClientId=? AND SecurityId=?",
        "                                       AND Status='Активно'`, clientId, securityId);",
        "    const sec = await t.get('SELECT Price, Symbol FROM Securities WHERE Id=?', securityId);",
        "    if (!sec) throw err('e.nosec');",
        "    const free = Number(have || 0) - Number(reserved || 0);",
        "    if (!Number.isInteger(qty) || qty <= 0 || qty > free) throw err('e.free');",
        "    const mp = Number(sec.Price);",
        "    // защита от опечатки: цена не должна отличаться от рыночной более чем втрое",
        "    if (!(price > 0) || price < mp * 0.3 || price > mp * 3) throw err('e.price');",
        "    // ...INSERT INTO Listings(...) в той же транзакции",
        "  });",
        "  await D.audit(s.Login, 'Выставлено предложение', `${body.symbol} x${qty} @ ${price}`);",
        "  return result;",
        "}",
    ])

    p(doc, "А.3 Проверка сессии по токену (server/src/logic.js)", first_line=0, bold=True)
    code_block(doc, [
        "async function readToken(token) {",
        "  if (!token) return null;",
        "  const s = await get('SELECT TOP 1 * FROM Sessions WHERE Token=?', token);",
        "  if (!s) return null;",
        "  // отметка активности: по SeenAt видно, кто работает прямо сейчас",
        "  run('UPDATE Sessions SET SeenAt=GETDATE() WHERE Token=?', token).catch(() => {});",
        "  return s;",
        "}",
    ])

    p(doc, "А.4 Пул соединений и доступ к данным (server/src/db.js)", first_line=0, bold=True)
    code_block(doc, [
        "const sql = require('mssql');",
        "",
        "async function ensurePool() {",
        "  if (pool && pool.connected) return pool;",
        "  if (!pool) pool = new sql.ConnectionPool(CONFIG);",
        "  try {",
        "    await pool.connect();",
        "  } catch (e) {",
        "    pool = null;",
        "    // базы может не быть: создаём её в master и повторяем подключение",
        "    if (e && e.number === 4060 && (USER || process.env.BANKINVEST_CREATE_DB !== '0')) {",
        "      await createDatabase(e);",
        "      return ensurePool();",
        "    }",
        "    throw sqlError(e);",
        "  }",
        "  return pool;",
        "}",
        "",
        "async function query(text, params = [], conn = null) {",
        "  const p = conn || await ensurePool();",
        "  const req = bind(p.request(), params);",
        "  try {",
        "    const r = await req.query(namedParams(text));   // '?' -> '@pN'",
        "    return { rows: firstRows(r), raw: r };",
        "  } catch (e) {",
        "    const mapped = tradeError(e);",
        "    if (mapped) throw new ApiError(mapped, 400);",
        "    throw sqlError(e);",
        "  }",
        "}",
    ])

    p(doc, "А.5 Хранимая процедура обновления цен (db/schema.sql)", first_line=0, bold=True)
    code_block(doc, [
        "CREATE PROCEDURE usp_UpdatePrices AS",
        "BEGIN",
        "  SET NOCOUNT ON;",
        "  DECLARE @r INT, @added INT = 0;",
        "  -- одна процедура не должна выполняться одновременно двумя серверами",
        "  EXEC @r = sp_getapplock @Resource = 'BankInvest.UpdatePrices',",
        "                          @LockMode = 'Exclusive', @LockOwner = 'Session',",
        "                          @LockTimeout = 0;",
        "  IF @r < 0 BEGIN SELECT 0; RETURN; END",
        "  -- случайное блуждание цены в пределах ±2 % с записью точки в PriceHistory",
        "  -- ... UPDATE Securities SET PrevPrice = Price, Price = ROUND(Price * (1 + @d), 2);",
        "  -- ... INSERT PriceHistory(SecurityId, Price) SELECT Id, Price FROM Securities;",
        "  EXEC sp_releaseapplock @Resource = 'BankInvest.UpdatePrices', @LockOwner = 'Session';",
        "  SELECT @added;",
        "END",
    ])
    page_break(doc)


def appendix_b(doc):
    p(doc, "ПРИЛОЖЕНИЕ Б", align=1, first_line=0, bold=True)
    p(doc, "(справочное)", align=1, first_line=0)
    p(doc, "Дорожная карта проекта", align=1, first_line=0)
    p(doc, "", first_line=0)
    table(doc,
          ["Этап", "Содержание работ", "Состояние"],
          [["1", "Схема базы данных: 13 таблиц, ограничения целостности, индексы", "выполнено"],
           ["2", "Хранимые процедуры usp_BuyListing и usp_UpdatePrices, права логина", "выполнено"],
           ["3", "Сервер API: вход по токену, сессии, роли и проверка прав", "выполнено"],
           ["4", "Клиенты: веб-версия в браузере и оконное приложение WPF", "выполнено"],
           ["5", "Портфель: переоценка по текущим ценам, доли и целевые доли", "выполнено"],
           ["6", "Рынок предложений: выставление, частичный выкуп, отзыв", "выполнено"],
           ["7", "Отчёты и журнал действий AuditLog", "выполнено"],
           ["8", "Развёртывание: скрипты db-init, db-check, db-restore, Docker", "выполнено"],
           ["9", "Планирование инвестиционных проектов (NPV, IRR, PI)", "в разработке"],
           ["10", "Напоминания о погашении выпусков и уведомления клиентам", "в разработке"],
           ["11", "Печатные формы отчётов и выгрузка в Excel", "запланировано"],
           ["12", "Резервное копирование по расписанию и аудит изменений схемы", "запланировано"]],
          [1.6, 10.4, 3.6])
    p(doc, "Обозначения: «выполнено» – работает и проверено; «в разработке» – реализуется; "
           "«запланировано» – определено в модели, код не начат.", first_line=0)
