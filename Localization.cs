namespace BankInvest;

// Локализация: 0 = Русский, 1 = English, 2 = Беларуская. Выбор хранится в памяти и в %AppData%\BankInvest\lang.txt,
// поэтому не сбрасывается ни при входе/выходе, ни при перезапуске.
public static class Loc
{
    public static int Lang;
    public static event Action? Changed;
    static readonly string FilePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "BankInvest", "lang.txt");

    public static void Load()
    {
        try { if (File.Exists(FilePath)) Lang = Math.Clamp(int.Parse(File.ReadAllText(FilePath).Trim()), 0, 2); } catch { }
    }

    public static void Set(int l)
    {
        if (l == Lang) return;
        Lang = l;
        try { Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!); File.WriteAllText(FilePath, l.ToString()); } catch { }
        Changed?.Invoke();
    }

    public static string T(string k) => D.TryGetValue(k, out var v) ? v[Lang] : k;      // обычный текст
    public static string Col(string c) => D.TryGetValue("col." + c, out var v) ? v[Lang] : c; // заголовок колонки
    public static string Val(string s) => D.TryGetValue("v." + s, out var v) ? v[Lang] : s;   // значение из БД (статус, роль...)

    static string[] X(string ru, string en, string be) => new[] { ru, en, be };

    static readonly Dictionary<string, string[]> D = new()
    {
        // --- общие ---
        ["app.title"] = X("Беларусбанк — Инвестиции и ценные бумаги", "Belarusbank — Investments & Securities", "Беларусбанк — Інвестыцыі і каштоўныя паперы"),
        ["bank"] = X("БЕЛАРУСБАНК", "BELARUSBANK", "БЕЛАРУСБАНК"),
        ["lang.label"] = X("Язык:", "Language:", "Мова:"),
        ["err.title"] = X("Ошибка", "Error", "Памылка"),
        ["ok"] = X("OK", "OK", "OK"),
        ["cancel"] = X("Отмена", "Cancel", "Скасаваць"),
        // --- вход ---
        ["login.secure"] = X("Беларусбанк · Защищённое соединение", "Belarusbank · Secure connection", "Беларусбанк · Абароненае злучэнне"),
        ["login.title"] = X("Вход в систему", "Sign in", "Уваход у сістэму"),
        ["login.sub"] = X("Введите данные для доступа к счетам.  * — обязательные поля", "Enter your login information to access your accounts.  * Required fields", "Увядзіце даныя для доступу да рахункаў.  * — абавязковыя палі"),
        ["tab.company"] = X("ID организации", "Company ID", "ID арганізацыі"),
        ["tab.user"] = X("ID пользователя", "User ID", "ID карыстальніка"),
        ["hint.company"] = X("Введите ID организации (УНП)", "Enter Company ID (UNP)", "Увядзіце ID арганізацыі (УНП)"),
        ["hint.user"] = X("Введите ID пользователя", "Enter User ID", "Увядзіце ID карыстальніка"),
        ["lbl.pass"] = X("Пароль", "Passcode", "Пароль"),
        ["hint.pass"] = X("Введите пароль", "Enter Passcode", "Увядзіце пароль"),
        ["btn.login"] = X("Войти", "Access Accounts", "Увайсці"),
        ["btn.register"] = X("Регистрация", "Register", "Рэгістрацыя"),
        ["login.fail"] = X("Неверные данные для входа.", "Invalid login details.", "Няправільныя даныя для ўваходу."),
        ["err.db"] = X("Ошибка подключения к БД:", "Database connection error:", "Памылка падключэння да БД:"),
        // --- регистрация ---
        ["reg.title"] = X("Регистрация", "Registration", "Рэгістрацыя"),
        ["reg.type"] = X("Тип аккаунта", "Account type", "Тып акаўнта"),
        ["reg.company"] = X("Для предприятия", "For a company", "Для прадпрыемства"),
        ["reg.personal"] = X("Для личного пользования", "For personal use", "Для асабістага карыстання"),
        ["reg.cname"] = X("Наименование организации", "Company name", "Найменне арганізацыі"),
        ["reg.pname"] = X("ФИО", "Full name", "ПІБ"),
        ["reg.unp"] = X("ID организации (УНП, 9 цифр)", "Company ID (UNP, 9 digits)", "ID арганізацыі (УНП, 9 лічбаў)"),
        ["reg.login"] = X("ID пользователя (логин)", "User ID (login)", "ID карыстальніка (лагін)"),
        ["reg.address"] = X("Адрес", "Address", "Адрас"),
        ["reg.contacts"] = X("Контакты", "Contacts", "Кантакты"),
        ["reg.pass"] = X("Пароль", "Password", "Пароль"),
        ["reg.pass2"] = X("Повторите пароль", "Repeat password", "Паўтарыце пароль"),
        ["reg.submit"] = X("Зарегистрироваться", "Create account", "Зарэгістравацца"),
        ["reg.back"] = X("Назад", "Back", "Назад"),
        ["reg.ok"] = X("Регистрация прошла успешно. Теперь вы можете войти.", "Registration successful. You can now sign in.", "Рэгістрацыя прайшла паспяхова. Цяпер вы можаце ўвайсці."),
        ["reg.e.unp"] = X("УНП должен состоять из 9 цифр.", "Company ID (UNP) must be 9 digits.", "УНП павінен складацца з 9 лічбаў."),
        ["reg.e.empty"] = X("Заполните все обязательные поля.", "Fill in all required fields.", "Запоўніце ўсе абавязковыя палі."),
        ["reg.e.pass"] = X("Пароли не совпадают или короче 6 символов.", "Passwords do not match or are shorter than 6 characters.", "Паролі не супадаюць або карацейшыя за 6 сімвалаў."),
        ["reg.e.exists"] = X("Такой ID уже зарегистрирован.", "This ID is already registered.", "Такі ID ужо зарэгістраваны."),
        ["reg.e.login"] = X("ID пользователя: минимум 3 символа.", "User ID must be at least 3 characters.", "ID карыстальніка: мінімум 3 сімвалы."),
        // --- меню и заголовки ---
        ["m.Home"] = X("Главная", "Home", "Галоўная"),
        ["m.Clients"] = X("Клиенты", "Clients", "Кліенты"),
        ["m.Projects"] = X("Инвест. проекты", "Investment projects", "Інвест. праекты"),
        ["m.Portfolio"] = X("Портфели", "Portfolios", "Партфелі"),
        ["m.MyPortfolio"] = X("Мои активы", "My Portfolio", "Мае актывы"),
        ["m.Transactions"] = X("Транзакции", "Transactions", "Транзакцыі"),
        ["m.History"] = X("История операций", "Transaction history", "Гісторыя аперацый"),
        ["m.Reports"] = X("Отчёты / Аналитика", "Reports / Analytics", "Справаздачы / Аналітыка"),
        ["m.Profile"] = X("Профиль", "Profile", "Профіль"),
        ["m.Admin"] = X("Администрирование", "Administration", "Адміністраванне"),
        ["m.Logout"] = X("Выход", "Log out", "Выхад"),
        ["t.Portfolio"] = X("Инвестиционный портфель клиента", "Client investment portfolio", "Інвестыцыйны партфель кліента"),
        ["t.Projects"] = X("Инвестиционные проекты", "Investment projects", "Інвестыцыйныя праекты"),
        ["t.Reports"] = X("Отчёты / Аналитика (последние 30 дней)", "Reports / Analytics (last 30 days)", "Справаздачы / Аналітыка (апошнія 30 дзён)"),
        ["t.Admin"] = X("Администрирование: учётные записи", "Administration: user accounts", "Адміністраванне: уліковыя запісы"),
        ["t.Log"] = X("Журнал действий (AuditLog)", "Activity log (AuditLog)", "Журнал дзеянняў (AuditLog)"),
        ["home.welcome"] = X("Добро пожаловать, {0}!\n\nРоль: {1}\n\nВыберите раздел в меню слева.", "Welcome, {0}!\n\nRole: {1}\n\nChoose a section in the menu on the left.", "Сардэчна запрашаем, {0}!\n\nРоль: {1}\n\nВыберыце раздзел у меню злева."),
        ["nodata"] = X("Нет данных", "No data", "Няма даных"),
        // --- кнопки ---
        ["b.AddClient"] = X("Добавить клиента", "Add client", "Дадаць кліента"),
        ["b.Delete"] = X("Удалить", "Delete", "Выдаліць"),
        ["b.Export"] = X("Экспорт", "Export", "Экспарт"),
        ["b.AddHolding"] = X("Добавить актив", "Add Holding", "Дадаць актыў"),
        ["b.Save"] = X("Сохранить", "Save", "Захаваць"),
        ["b.NewOrder"] = X("Новая заявка", "New order", "Новая заяўка"),
        ["b.Confirm"] = X("Подтвердить", "Confirm", "Пацвердзіць"),
        ["b.AddProject"] = X("Добавить проект", "Add project", "Дадаць праект"),
        ["b.AddEmployee"] = X("Добавить сотрудника", "Add employee", "Дадаць супрацоўніка"),
        ["b.Log"] = X("Журнал", "Audit log", "Журнал"),
        // --- диалоги ввода ---
        ["p.NewClient"] = X("Новый клиент (предприятие)", "New client (company)", "Новы кліент (прадпрыемства)"),
        ["p.Qty"] = X("Количество", "Quantity", "Колькасць"),
        ["p.TypeBS"] = X("Тип (Buy/Sell)", "Type (Buy/Sell)", "Тып (Buy/Sell)"),
        ["p.UnpClient"] = X("УНП клиента", "Client UNP", "УНП кліента"),
        ["p.Order"] = X("Заявка на покупку/продажу", "Buy/Sell order", "Заяўка на куплю/продаж"),
        ["p.NewProject"] = X("Новый проект", "New project", "Новы праект"),
        ["p.Rate"] = X("Ставка дисконтирования %", "Discount rate %", "Стаўка дыскантавання %"),
        ["p.Flows"] = X("Потоки через ';'", "Cash flows separated by ';'", "Патокі праз ';'"),
        ["p.NewEmp"] = X("Новый сотрудник", "New employee", "Новы супрацоўнік"),
        ["p.Role"] = X("Роль (Employee/Admin)", "Role (Employee/Admin)", "Роль (Employee/Admin)"),
        // --- сообщения ---
        ["e.qty"] = X("Некорректное количество.", "Invalid quantity.", "Некарэктная колькасць."),
        ["e.noaccount"] = X("Счёт депо не найден.", "Depo account not found.", "Рахунак дэпо не знойдзены."),
        ["e.nosec"] = X("Бумага не найдена.", "Security not found.", "Папера не знойдзена."),
        ["e.notplaced"] = X("Выпуск ещё не размещён.", "The issue has not been placed yet.", "Выпуск яшчэ не размешчаны."),
        ["e.nothave"] = X("Недостаточно бумаг на счёте депо (есть {0}).", "Not enough securities on the depo account (available: {0}).", "Недастаткова папер на рахунку дэпо (ёсць {0})."),
        ["e.bad"] = X("Некорректное значение.", "Invalid value.", "Некарэктнае значэнне."),
        ["e.sum100"] = X("Сумма целевых долей превышает 100%.", "Target shares exceed 100%.", "Сума мэтавых долей перавышае 100%."),
        ["e.self"] = X("Нельзя удалить себя.", "You cannot delete yourself.", "Нельга выдаліць сябе."),
        ["e.noorder"] = X("Заявка не найдена или уже обработана.", "Order not found or already processed.", "Заяўка не знойдзена або ўжо апрацавана."),
        ["e.notenough"] = X("Недостаточно бумаг.", "Not enough securities.", "Недастаткова папер."),
        ["e.delclient"] = X("Удалить клиента со всеми счетами и операциями?", "Delete the client with all accounts and transactions?", "Выдаліць кліента з усімі рахункамі і аперацыямі?"),
        ["e.cascade"] = X("Каскадное удаление", "Cascade delete", "Каскаднае выдаленне"),
        ["e.saved"] = X("Сохранено.", "Saved.", "Захавана."),
        ["p.never"] = X("не окупается", "not recovered", "не акупаецца"),
        ["total"] = X("Итого:   Текущая {0}   |   100.00%   |   Целевая {1}   |   Цель % {2}   |   К действию {3}", "Total:   Current {0}   |   100.00%   |   Target {1}   |   Target % {2}   |   Action {3}", "Усяго:   Бягучая {0}   |   100.00%   |   Мэтавая {1}   |   Мэта % {2}   |   Да дзеяння {3}"),
        // --- отчёты ---
        ["r.ops"] = X("Исполнено операций", "Executed transactions", "Выканана аперацый"),
        ["r.income"] = X("Доход банка (комиссии)", "Bank income (commissions)", "Даход банка (камісіі)"),
        ["r.top"] = X("Востребовано: ", "Most in demand: ", "Запатрабавана: "),
        // --- заголовки колонок ---
        ["col.Symbol"] = X("Тикер", "Symbol", "Тыкер"),
        ["col.Name"] = X("Наименование", "Name", "Найменне"),
        ["col.Segment"] = X("Сегмент", "Segment", "Сегмент"),
        ["col.ExpenseRatio"] = X("Расходы %", "Expense Ratio %", "Расходы %"),
        ["col.CurrentValue"] = X("Текущая стоимость", "Current Value", "Бягучая кошт"),
        ["col.CurrentPct"] = X("Текущая доля %", "Current %", "Бягучая доля %"),
        ["col.TargetValue"] = X("Целевая стоимость", "Target Value", "Мэтавая кошт"),
        ["col.TargetPct"] = X("Целевая доля %", "Target %", "Мэтавая доля %"),
        ["col.Amount"] = X("Сумма к действию", "Amount of Action", "Сума да дзеяння"),
        ["col.UNP"] = X("УНП", "UNP", "УНП"),
        ["col.Address"] = X("Адрес", "Address", "Адрас"),
        ["col.Contacts"] = X("Контакты", "Contacts", "Кантакты"),
        ["col.Status"] = X("Статус", "Status", "Статус"),
        ["col.Kind"] = X("Тип клиента", "Client type", "Тып кліента"),
        ["col.Depo"] = X("Счёт депо", "Depo account", "Рахунак дэпо"),
        ["col.Date"] = X("Дата", "Date", "Дата"),
        ["col.Client"] = X("Клиент", "Client", "Кліент"),
        ["col.Security"] = X("Бумага", "Security", "Папера"),
        ["col.Type"] = X("Тип", "Type", "Тып"),
        ["col.Qty"] = X("Кол-во", "Qty", "Колькасць"),
        ["col.Price"] = X("Цена", "Price", "Цана"),
        ["col.Commission"] = X("Комиссия", "Commission", "Камісія"),
        ["col.Project"] = X("Проект", "Project", "Праект"),
        ["col.Rate"] = X("Ставка %", "Rate %", "Стаўка %"),
        ["col.CashFlows"] = X("Потоки", "Cash flows", "Патокі"),
        ["col.NPV"] = X("NPV", "NPV", "NPV"),
        ["col.IRR"] = X("IRR %", "IRR %", "IRR %"),
        ["col.PI"] = X("PI", "PI", "PI"),
        ["col.Payback"] = X("Окупаемость (лет)", "Payback (years)", "Акупнасць (гадоў)"),
        ["col.Metric"] = X("Показатель", "Metric", "Паказчык"),
        ["col.Value"] = X("Значение", "Value", "Значэнне"),
        ["col.Company"] = X("Организация", "Organization", "Арганізацыя"),
        ["col.Login"] = X("Логин", "Login", "Лагін"),
        ["col.Role"] = X("Роль", "Role", "Роль"),
        ["col.Active"] = X("Активна", "Active", "Актыўная"),
        ["col.Time"] = X("Время", "Time", "Час"),
        ["col.User"] = X("Пользователь", "User", "Карыстальнік"),
        ["col.Action"] = X("Действие", "Action", "Дзеянне"),
        ["col.Details"] = X("Детали", "Details", "Дэталі"),
        // --- значения из БД ---
        ["v.Новая"] = X("Новая", "New", "Новая"),
        ["v.Исполнена"] = X("Исполнена", "Executed", "Выканана"),
        ["v.Активен"] = X("Активен", "Active", "Актыўны"),
        ["v.Company"] = X("Предприятие", "Company", "Прадпрыемства"),
        ["v.Personal"] = X("Физическое лицо", "Individual", "Фізічная асоба"),
        ["v.Buy"] = X("Покупка", "Buy", "Купля"),
        ["v.Sell"] = X("Продажа", "Sell", "Продаж"),
        ["v.Admin"] = X("Администратор", "Administrator", "Адміністратар"),
        ["v.Employee"] = X("Сотрудник", "Employee", "Супрацоўнік"),
        ["v.Client"] = X("Клиент", "Client", "Кліент"),
        // --- меню, главная ---
        ["m.Help"] = X("Помощь в использовании", "Help / How to use", "Дапамога ў выкарыстанні"),
        ["home.hello"] = X("Добро пожаловать, {0}  ·  Роль: {1}", "Welcome, {0}  ·  Role: {1}", "Сардэчна запрашаем, {0}  ·  Роль: {1}"),
        ["home.up"] = X("▲ Растут в цене", "▲ Rising in price", "▲ Растуць у кошце"),
        ["home.down"] = X("▼ Падают в цене", "▼ Falling in price", "▼ Падаюць у кошце"),
        ["k.clients"] = X("Клиентов", "Clients", "Кліентаў"),
        ["k.aum"] = X("Стоимость активов", "Assets value", "Кошт актываў"),
        ["k.neworders"] = X("Новых заявок", "New orders", "Новых заявак"),
        ["k.income"] = X("Доход банка", "Bank income", "Даход банка"),
        ["k.pv"] = X("Стоимость портфеля", "Portfolio value", "Кошт партфеля"),
        ["k.secs"] = X("Бумаг в портфеле", "Securities held", "Папер у партфелі"),
        ["k.myops"] = X("Моих операций", "My transactions", "Маіх аперацый"),
        ["col.Change"] = X("Изм. за 24 ч, %", "24h change %", "Змяненне за 24 г, %"),
        // --- окно заявки ---
        ["o.type"] = X("Тип операции", "Operation type", "Тып аперацыі"),
        ["o.price"] = X("Цена за 1 шт.", "Price per unit", "Цана за 1 шт."),
        ["o.amount"] = X("Сумма", "Amount", "Сума"),
        ["o.comm"] = X("Комиссия (0,5%)", "Commission (0.5%)", "Камісія (0,5%)"),
        ["o.pay"] = X("К оплате", "To pay", "Да аплаты"),
        ["o.receive"] = X("К получению", "To receive", "Да атрымання"),
        ["o.avail"] = X("Доступно на счёте депо: {0} шт.", "Available on depo account: {0} pcs", "Даступна на рахунку дэпо: {0} шт."),
        ["o.submit"] = X("Подать заявку", "Place order", "Падаць заяўку"),
        // --- помощь ---
        ["h.prev"] = X("Назад", "Previous", "Назад"),
        ["h.next"] = X("Далее", "Next", "Далей"),
        ["h.page"] = X("Страница {0} из {1}", "Page {0} of {1}", "Старонка {0} з {1}"),
        ["h.generalTitle"] = X("Язык, выход и экспорт", "Language, log out and export", "Мова, выхад і экспарт"),
        ["h.stockTitle"] = X("Страница бумаги и график цен", "Security page and price chart", "Старонка паперы і графік коштаў"),
        ["h.Stock"] = X(
            "Страница бумаги открывается двойным щелчком по строке на главной странице или в портфеле. Вверху — текущая цена, изменение за 24 часа и данные выпуска (эмитент, номинал, ставка, объём).\n\nГрафик показывает историю цены. Кнопки «Часы», «Дни», «Недели», «Месяцы» и «Годы» меняют масштаб: последние 48 часов, 30 дней, 26 недель, 24 месяца и 5 лет. Наведите курсор на график, чтобы увидеть цену в конкретный момент. Над графиком — минимум, максимум и изменение за выбранный период.\n\nВнизу список предложений продавцов по этой бумаге. Клиент может нажать «Купить» или «Продать» прямо на этой странице.",
            "A security's page opens with a double-click on its row on the Home page or in a portfolio. At the top you see the current price, the 24-hour change and the issue details (issuer, nominal, rate, volume).\n\nThe chart shows the price history. The “Hours”, “Days”, “Weeks”, “Months” and “Years” buttons change the scale: the last 48 hours, 30 days, 26 weeks, 24 months and 5 years. Hover over the chart to see the price at a specific moment. Above the chart are the low, the high and the change for the selected period.\n\nAt the bottom is the list of sellers' offers for this security. A client can press “Buy” or “Sell” right on this page.",
            "Старонка паперы адкрываецца двайным пстрычком па радку на галоўнай старонцы або ў партфелі. Уверсе — бягучая цана, змяненне за 24 гадзіны і даныя выпуску (эмітэнт, намінал, стаўка, аб’ём).\n\nГрафік паказвае гісторыю цаны. Кнопкі «Гадзіны», «Дні», «Тыдні», «Месяцы» і «Гады» мяняюць маштаб: апошнія 48 гадзін, 30 дзён, 26 тыдняў, 24 месяцы і 5 гадоў. Навядзіце курсор на графік, каб убачыць цану ў пэўны момант. Над графікам — мінімум, максімум і змяненне за абраны перыяд.\n\nУнізе — спіс прапаноў прадаўцоў па гэтай паперы. Кліент можа націснуць «Купіць» або «Прадаць» прама на гэтай старонцы."),
        // --- торговля ---
        ["b.Buy"] = X("Купить", "Buy", "Купіць"),
        ["b.Sell"] = X("Продать", "Sell", "Прадаць"),
        ["b.MyOffers"] = X("Мои предложения", "My offers", "Мае прапановы"),
        ["b.Withdraw"] = X("Отозвать предложение", "Withdraw offer", "Адклікаць прапанову"),
        ["b.Close"] = X("Закрыть", "Close", "Закрыць"),
        ["b.all"] = X("Все бумаги", "All securities", "Усе паперы"),
        ["k.offers"] = X("Активных предложений", "Active offers", "Актыўных прапаноў"),
        ["k.myoffers"] = X("Мои предложения", "My offers", "Мае прапановы"),
        ["home.hint"] = X("Дважды щёлкните по бумаге, чтобы открыть её страницу с графиком цен. Цены обновляются автоматически раз в час.", "Double-click a security to open its page with the price chart. Prices update automatically every hour.", "Двойчы пстрыкніце па паперы, каб адкрыць яе старонку з графікам коштаў. Цэны абнаўляюцца аўтаматычна раз на гадзіну."),
        ["col.Seller"] = X("Продавец", "Seller", "Прадавец"),
        ["col.Available"] = X("Доступно", "Available", "Даступна"),
        ["col.VsMarket"] = X("К рынку %", "vs market %", "Да рынку %"),
        ["col.ForSale"] = X("На продаже", "For sale", "У продажы"),
        ["col.CreatedAt"] = X("Создано", "Created", "Створана"),
        ["buy.title"] = X("Покупка ценных бумаг", "Buy securities", "Купля каштоўных папер"),
        ["buy.pick"] = X("Выберите предложение продавца:", "Select a seller's offer:", "Абярыце прапанову прадаўца:"),
        ["buy.avail"] = X("Доступно у продавца: {0} шт.", "Available from the seller: {0} pcs", "Даступна ў прадаўца: {0} шт."),
        ["buy.empty"] = X("Предложений пока нет.", "No offers yet.", "Прапаноў пакуль няма."),
        ["buy.ok"] = X("Покупка выполнена: {0} × {1}.", "Purchase completed: {0} × {1}.", "Купля выканана: {0} × {1}."),
        ["sell.title"] = X("Продажа: выставить предложение", "Sell: create an offer", "Продаж: выставіць прапанову"),
        ["sell.price"] = X("Ваша цена за 1 шт. (BYN)", "Your price per unit (BYN)", "Ваша цана за 1 шт. (BYN)"),
        ["sell.market"] = X("Рыночная цена: {0} BYN", "Market price: {0} BYN", "Рынкавая цана: {0} BYN"),
        ["sell.free"] = X("Свободно для продажи: {0} шт.", "Free to sell: {0} pcs", "Свабодна для продажу: {0} шт."),
        ["sell.none"] = X("На счёте нет бумаг, свободных для продажи.", "No securities available to sell.", "На рахунку няма папер, свабодных для продажу."),
        ["sell.submit"] = X("Выставить на продажу", "Put up for sale", "Выставіць на продаж"),
        ["sell.ok"] = X("Предложение выставлено: {0} шт. по {1} BYN.", "Offer created: {0} pcs at {1} BYN.", "Прапанова выстаўлена: {0} шт. па {1} BYN."),
        ["offers.title"] = X("Мои предложения о продаже", "My sell offers", "Мае прапановы аб продажы"),
        ["e.nolisting"] = X("Предложение уже недоступно (его купили или отозвали).", "The offer is no longer available (it was bought or withdrawn).", "Прапанова ўжо недаступная (яе купілі або адклікалі)."),
        ["e.own"] = X("Нельзя купить собственное предложение.", "You cannot buy your own offer.", "Нельга купіць уласную прапанову."),
        ["e.sellerqty"] = X("У продавца недостаточно бумаг.", "The seller does not have enough securities.", "У прадаўца недастаткова папер."),
        ["e.free"] = X("Недостаточно свободных бумаг для продажи.", "Not enough free securities to sell.", "Недастаткова свабодных папер для продажу."),
        ["e.price"] = X("Цена должна быть от 30% до 300% от рыночной.", "The price must be between 30% and 300% of the market price.", "Цана павінна быць ад 30% да 300% ад рынкавай."),
        // --- страница бумаги ---
        ["s.hours"] = X("Часы", "Hours", "Гадзіны"),
        ["s.days"] = X("Дни", "Days", "Дні"),
        ["s.weeks"] = X("Недели", "Weeks", "Тыдні"),
        ["s.months"] = X("Месяцы", "Months", "Месяцы"),
        ["s.years"] = X("Годы", "Years", "Гады"),
        ["s.low"] = X("Мин.", "Low", "Мін."),
        ["s.high"] = X("Макс.", "High", "Макс."),
        ["s.period"] = X("За период", "Period change", "За перыяд"),
        ["s.nodata"] = X("Нет данных для графика", "No chart data", "Няма даных для графіка"),
        ["s.offers"] = X("Предложения продавцов", "Sellers' offers", "Прапановы прадаўцоў"),
        ["s.hint"] = X("Цена обновляется автоматически раз в час", "The price updates automatically every hour", "Цана абнаўляецца аўтаматычна раз на гадзіну"),
        ["s.issuer"] = X("Эмитент", "Issuer", "Эмітэнт"),
        ["s.nominal"] = X("Номинал", "Nominal", "Намінал"),
        ["s.rate"] = X("Ставка, %", "Rate, %", "Стаўка, %"),
        ["s.volume"] = X("Объём выпуска", "Issue volume", "Аб’ём выпуску"),
        // --- значения из БД (рынок) ---
        ["v.Облигация"] = X("Облигация", "Bond", "Аблігацыя"),
        ["v.Акция"] = X("Акция", "Share", "Акцыя"),
        ["v.Активно"] = X("Активно", "Active", "Актыўна"),
        ["v.Продано"] = X("Продано", "Sold", "Прададзена"),
        ["v.Отозвано"] = X("Отозвано", "Withdrawn", "Адклікана"),
        ["v.Отменена"] = X("Отменена", "Cancelled", "Скасавана"),
        ["h.Home"] = X(
            "Главная страница — это сводка. Вверху ключевые показатели (количество клиентов, стоимость активов, число активных предложений на рынке, доход банка; у клиента — стоимость его портфеля, число бумаг, операций и собственных предложений).\n\nНиже рынок ценных бумаг банка: слева бумаги, которые подорожали за последние 24 часа (зелёная стрелка), справа — подешевевшие (красная стрелка). Дважды щёлкните по любой бумаге, чтобы открыть её страницу с графиком. Цены обновляются автоматически раз в час.",
            "The Home page is a summary. Key indicators are at the top (number of clients, assets value, number of active offers on the market, bank income; for a client — the value of their portfolio, number of securities, transactions and own offers).\n\nBelow is the bank's securities market: securities that gained in the last 24 hours on the left (green arrow), those that lost on the right (red arrow). Double-click any security to open its page with the chart. Prices update automatically every hour.",
            "Галоўная старонка — гэта зводка. Уверсе ключавыя паказчыкі (колькасць кліентаў, кошт актываў, колькасць актыўных прапаноў на рынку, даход банка; у кліента — кошт яго партфеля, колькасць папер, аперацый і ўласных прапаноў).\n\nНіжэй рынак каштоўных папер банка: злева паперы, якія падаражэлі за апошнія 24 гадзіны (зялёная стрэлка), справа — якія патаннелі (чырвоная стрэлка). Двойчы пстрыкніце па любой паперы, каб адкрыць яе старонку з графікам. Цэны абнаўляюцца аўтаматычна раз на гадзіну."),
        ["h.Clients"] = X(
            "Раздел «Клиенты» содержит список всех клиентов банка: предприятий и физических лиц. Кнопка «Добавить клиента» создаёт карточку предприятия, счёт депо и учётную запись для входа (логин — УНП). УНП проверяется: ровно 9 цифр и уникальность.\n\nАдминистратор дополнительно видит кнопку «Удалить» — она удаляет клиента вместе со счетами, портфелем и операциями (действие необратимо). Кнопка «Экспорт» сохраняет таблицу в файл, который открывается в Excel.",
            "The Clients section lists all bank clients: companies and individuals. The “Add client” button creates a company card, a depo account and a login account (the login is the UNP). The UNP is validated: exactly 9 digits and unique.\n\nThe administrator also sees the “Delete” button — it removes the client together with accounts, portfolio and transactions (this cannot be undone). The “Export” button saves the table to a file that opens in Excel.",
            "Раздзел «Кліенты» утрымлівае спіс усіх кліентаў банка: прадпрыемстваў і фізічных асоб. Кнопка «Дадаць кліента» стварае картку прадпрыемства, рахунак дэпо і ўліковы запіс для ўваходу (лагін — УНП). УНП правяраецца: роўна 9 лічбаў і ўнікальнасць.\n\nАдміністратар дадаткова бачыць кнопку «Выдаліць» — яна выдаляе кліента разам з рахункамі, партфелем і аперацыямі (дзеянне незваротнае). Кнопка «Экспарт» захоўвае табліцу ў файл, які адкрываецца ў Excel."),
        ["h.Projects"] = X(
            "В разделе «Инвест. проекты» перечислены проекты банка с автоматическим расчётом NPV (чистая приведённая стоимость), IRR (внутренняя норма доходности), PI (индекс рентабельности) и срока окупаемости.\n\nПроект считается выгодным, если NPV больше нуля, IRR выше ставки дисконтирования, а PI больше единицы. Кнопка «Добавить проект» принимает название, ставку дисконтирования и денежные потоки через «;» — первый поток (вложения) должен быть отрицательным, например: -1000;300;400;500.",
            "The Investment projects section lists the bank's projects with automatic calculation of NPV (net present value), IRR (internal rate of return), PI (profitability index) and payback period.\n\nA project is attractive when NPV is above zero, IRR is above the discount rate and PI is above one. The “Add project” button takes a name, a discount rate and cash flows separated by “;” — the first flow (the investment) must be negative, for example: -1000;300;400;500.",
            "У раздзеле «Інвест. праекты» пералічаны праекты банка з аўтаматычным разлікам NPV (чыстая прыведзеная кошт), IRR (ўнутраная норма даходнасці), PI (індэкс рэнтабельнасці) і тэрміну акупнасці.\n\nПраект лічыцца выгадным, калі NPV больш за нуль, IRR вышэй за стаўку дыскантавання, а PI больш за адзінку. Кнопка «Дадаць праект» прымае назву, стаўку дыскантавання і грашовыя патокі праз «;» — першы паток (укладанні) павінен быць адмоўным, напрыклад: -1000;300;400;500."),
        ["h.Portfolio"] = X(
            "В разделе «Портфели» выберите клиента в списке справа вверху — появится его портфель: бумага, количество, сколько выставлено на продажу, цена, стоимость и доля. Кнопки «Купить», «Продать» и «Мои предложения» работают от имени выбранного клиента (как в разделе «Мои активы» у клиента).\n\nВ колонке «Целевая доля %» можно прямо в таблице ввести желаемую долю; колонка «Сумма к действию» подскажет, сколько купить (зелёная стрелка вверх) или продать (красная стрелка вниз). Кнопка «Сохранить» записывает целевые доли (сумма не больше 100%), «Добавить актив» вносит бумагу на счёт депо клиента. Двойной щелчок по строке открывает страницу бумаги.",
            "In the Portfolios section pick a client in the list at the top right — the client's portfolio appears: security, quantity, how many are offered for sale, price, value and share. The “Buy”, “Sell” and “My offers” buttons work on behalf of the selected client (just like in the client's My Portfolio section).\n\nIn the “Target %” column you can type the desired share right in the table; the “Amount of Action” column shows how much to buy (green up arrow) or sell (red down arrow). “Save” stores the target shares (the sum must not exceed 100%), “Add Holding” puts a security on the client's depo account. Double-click a row to open the security's page.",
            "У раздзеле «Партфелі» абярыце кліента ў спісе справа ўверсе — з’явіцца яго партфель: папера, колькасць, колькі выстаўлена на продаж, цана, кошт і доля. Кнопкі «Купіць», «Прадаць» і «Мае прапановы» працуюць ад імя абранага кліента (як у раздзеле «Мае актывы» ў кліента).\n\nУ калонцы «Мэтавая доля %» можна прама ў табліцы ўвесці жаданую долю; калонка «Сума да дзеяння» падкажа, колькі купіць (зялёная стрэлка ўверх) або прадаць (чырвоная стрэлка ўніз). Кнопка «Захаваць» запісвае мэтавыя долі (сума не больш за 100%), «Дадаць актыў» уносіць паперу на рахунак дэпо кліента. Двойчы пстрыкніце па радку, каб адкрыць старонку паперы."),
        ["h.MyPortfolio"] = X(
            "Раздел «Мои активы» — ваш портфель и торговля. В таблице видны бумаги на счёте депо: количество, сколько из них выставлено на продажу, цена, стоимость и доля в портфеле. Двойной щелчок по строке открывает страницу бумаги с графиком.\n\nКнопка «Продать» (красная): выберите бумагу, количество и свою цену за 1 шт. — предложение появится на рынке, и другие пользователи смогут его купить. Выставленные бумаги резервируются. Кнопка «Мои предложения» позволяет отозвать предложение.\n\nКнопка «Купить» (зелёная): выберите предложение продавца и укажите количество — окно покажет сумму, комиссию (0,5%) и итог. После подтверждения бумаги сразу зачисляются на ваш счёт депо.\n\nВ колонке «Целевая доля %» можно задать желаемую долю и нажать «Сохранить»: колонка «Сумма к действию» покажет, сколько нужно докупить (↑) или продать (↓).",
            "The My Portfolio section is your portfolio and trading. The table shows the securities on your depo account: quantity, how many of them are offered for sale, price, value and share of the portfolio. Double-click a row to open the security's page with the chart.\n\nThe “Sell” button (red): choose a security, the quantity and your price per unit — the offer appears on the market and other users can buy it. Offered securities are reserved. The “My offers” button lets you withdraw an offer.\n\nThe “Buy” button (green): choose a seller's offer and enter the quantity — the window shows the amount, commission (0.5%) and total. After you confirm, the securities are credited to your depo account immediately.\n\nIn the “Target %” column you can set the desired share and press “Save”: the “Amount of Action” column shows how much to buy (↑) or sell (↓).",
            "Раздзел «Мае актывы» — ваш партфель і гандаль. У табліцы бачныя паперы на рахунку дэпо: колькасць, колькі з іх выстаўлена на продаж, цана, кошт і доля ў партфелі. Двойчы пстрыкніце па радку, каб адкрыць старонку паперы з графікам.\n\nКнопка «Прадаць» (чырвоная): абярыце паперу, колькасць і сваю цану за 1 шт. — прапанова з’явіцца на рынку, і іншыя карыстальнікі змогуць яе купіць. Выстаўленыя паперы рэзервуюцца. Кнопка «Мае прапановы» дазваляе адклікаць прапанову.\n\nКнопка «Купіць» (зялёная): абярыце прапанову прадаўца і ўкажыце колькасць — акно пакажа суму, камісію (0,5%) і вынік. Пасля пацверджання паперы адразу залічваюцца на ваш рахунак дэпо.\n\nУ калонцы «Мэтавая доля %» можна задаць жаданую долю і націснуць «Захаваць»: калонка «Сума да дзеяння» пакажа, колькі трэба дакупіць (↑) або прадаць (↓)."),
        ["h.Transactions"] = X(
            "Раздел «Транзакции» — журнал всех сделок клиентов: дата, клиент, бумага, тип (покупка или продажа), количество, цена и комиссия (0,5% с каждой стороны сделки). Сделки совершаются в разделах «Портфели» и «Мои активы» и исполняются сразу, поэтому подтверждать их не нужно. Кнопка «Экспорт» сохраняет журнал в файл для Excel.",
            "The Transactions section is a log of all client deals: date, client, security, type (buy or sell), quantity, price and commission (0.5% on each side of a deal). Deals are made in the Portfolios and My Portfolio sections and are executed immediately, so no confirmation is needed. The “Export” button saves the log to a file for Excel.",
            "Раздзел «Транзакцыі» — журнал усіх здзелак кліентаў: дата, кліент, папера, тып (купля або продаж), колькасць, цана і камісія (0,5% з кожнага боку здзелкі). Здзелкі здзяйсняюцца ў раздзелах «Партфелі» і «Мае актывы» і выконваюцца адразу, таму пацвярджаць іх не трэба. Кнопка «Экспарт» захоўвае журнал у файл для Excel."),
        ["h.History"] = X(
            "Раздел «История операций» показывает все ваши сделки: покупки и продажи, цену и комиссию. Новые сделки совершаются в разделе «Мои активы» кнопками «Купить» и «Продать»; они исполняются сразу, подтверждения сотрудника не требуется.",
            "The Transaction history section shows all your deals: purchases and sales, price and commission. New deals are made in the My Portfolio section with the “Buy” and “Sell” buttons; they are executed immediately and no confirmation from an employee is required.",
            "Раздзел «Гісторыя аперацый» паказвае ўсе вашы здзелкі: куплі і продажы, цану і камісію. Новыя здзелкі здзяйсняюцца ў раздзеле «Мае актывы» кнопкамі «Купіць» і «Прадаць»; яны выконваюцца адразу, пацверджанне супрацоўніка не патрэбна."),
        ["h.Reports"] = X(
            "Раздел «Отчёты / Аналитика» показывает сводные показатели за последние 30 дней: число исполненных операций, доход банка (сумма комиссий) и три самые востребованные бумаги. Кнопка «Экспорт» сохраняет отчёт в файл для Excel.",
            "The Reports / Analytics section shows summary indicators for the last 30 days: the number of executed transactions, the bank's income (sum of commissions) and the three most in-demand securities. The “Export” button saves the report to a file for Excel.",
            "Раздзел «Справаздачы / Аналітыка» паказвае зводныя паказчыкі за апошнія 30 дзён: колькасць выкананых аперацый, даход банка (сума камісій) і тры самыя запатрабаваныя паперы. Кнопка «Экспарт» захоўвае справаздачу ў файл для Excel."),
        ["h.Profile"] = X(
            "В разделе «Профиль» отображаются данные вашей учётной записи: наименование, УНП (для предприятий), адрес, контакты, статус и тип клиента.",
            "The Profile section displays your account details: name, UNP (for companies), address, contacts, status and client type.",
            "У раздзеле «Профіль» паказваюцца даныя вашага ўліковага запісу: найменне, УНП (для прадпрыемстваў), адрас, кантакты, статус і тып кліента."),
        ["h.Admin"] = X(
            "Раздел «Администрирование» доступен только администратору. Здесь собраны все учётные записи. «Добавить сотрудника» создаёт сотрудника или администратора (роль вводится как Employee или Admin, пароль — не короче 6 символов).\n\n«Удалить» удаляет выбранную запись (себя удалить нельзя). Кнопка «Журнал» открывает последние 500 действий пользователей и попыток входа.",
            "The Administration section is available to the administrator only. It lists all user accounts. “Add employee” creates an employee or an administrator (enter the role as Employee or Admin; the password must be at least 6 characters).\n\n“Delete” removes the selected account (you cannot delete yourself). The “Audit log” button opens the last 500 user actions and login attempts.",
            "Раздзел «Адміністраванне» даступны толькі адміністратару. Тут сабраны ўсе ўліковыя запісы. «Дадаць супрацоўніка» стварае супрацоўніка або адміністратара (роль уводзіцца як Employee або Admin, пароль — не карацейшы за 6 сімвалаў).\n\n«Выдаліць» выдаляе абраны запіс (сябе выдаліць нельга). Кнопка «Журнал» адкрывае апошнія 500 дзеянняў карыстальнікаў і спроб уваходу."),
        ["h.General"] = X(
            "Язык интерфейса переключается в левом нижнем углу, под кнопкой «Выход»: Русский, English или Беларуская. Выбор запоминается и не сбрасывается после входа. Перед сменой языка сохраните несохранённые изменения в таблице.\n\nЧтобы выйти из аккаунта, нажмите «Выход» в меню слева. Кнопка «Экспорт» в любом разделе сохраняет текущую таблицу в файл CSV, который открывается в Excel.",
            "The interface language is switched in the lower left corner, under the “Log out” button: Русский, English or Беларуская. The choice is remembered and is not reset after signing in. Save any unsaved changes in the table before switching the language.\n\nTo sign out, press “Log out” in the menu on the left. The “Export” button in any section saves the current table to a CSV file that opens in Excel.",
            "Мова інтэрфейсу пераключаецца ў левым ніжнім куце, пад кнопкай «Выхад»: Русский, English або Беларуская. Выбар запамінаецца і не скідаецца пасля ўваходу. Перад зменай мовы захавайце незахаваныя змены ў табліцы.\n\nКаб выйсці з акаўнта, націсніце «Выхад» у меню злева. Кнопка «Экспарт» у любым раздзеле захоўвае бягучую табліцу ў файл CSV, які адкрываецца ў Excel."),
    };
}

// Панель выбора языка (Русский | English | Беларуская). Обновляется при смене языка из любого места.
public class LangBar : Panel
{
    static readonly string[] Names = { "Русский", "English", "Беларуская" };
    readonly Label cap = new() { AutoSize = true };
    readonly Label[] ls = new Label[3];
    readonly bool center;

    public LangBar(Color fg, bool center, int width)
    {
        this.center = center; Width = width; Height = 26; BackColor = Color.Transparent;
        cap.ForeColor = fg; cap.Visible = center; Controls.Add(cap);
        for (int i = 0; i < 3; i++)
        {
            int idx = i;
            var l = new Label { AutoSize = true, Cursor = Cursors.Hand, ForeColor = fg, Text = Names[i] };
            l.Click += (_, _) => Loc.Set(idx);
            ls[i] = l; Controls.Add(l);
        }
        Loc.Changed += Upd;
        Disposed += (_, _) => Loc.Changed -= Upd;
        Upd();
    }

    void Upd()
    {
        cap.Text = Loc.T("lang.label");
        for (int i = 0; i < 3; i++)
            ls[i].Font = new Font("Segoe UI", 9, i == Loc.Lang ? FontStyle.Bold | FontStyle.Underline : FontStyle.Regular);
        var all = new List<Label>();
        if (center) all.Add(cap);
        all.AddRange(ls);
        int total = all.Sum(l => l.GetPreferredSize(Size.Empty).Width) + (all.Count - 1) * 10;
        int x = center ? Math.Max(0, (Width - total) / 2) : 0;
        foreach (var l in all) { l.Left = x; l.Top = 4; x += l.GetPreferredSize(Size.Empty).Width + 10; }
    }
}
