using System.Data;
using System.Globalization;
using System.Text;
using Microsoft.Data.SqlClient;
using static BankInvest.Loc;

namespace BankInvest;

public class MainForm : Form
{
    public bool LoggedOut;
    static readonly Color Green = Color.FromArgb(56, 189, 150);
    static readonly Color Dark = Color.FromArgb(40, 55, 71);

    readonly FlowLayoutPanel side = new() { Dock = DockStyle.Left, Width = 230, BackColor = Dark, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(8, 20, 8, 0) };
    readonly Panel top = new() { Dock = DockStyle.Top, Height = 128, BackColor = Color.FromArgb(244, 248, 251) };
    readonly Label crumbs = new() { Left = 20, Top = 10, AutoSize = true, ForeColor = Color.Gray };
    readonly Label title = new() { Left = 20, Top = 34, AutoSize = true, Font = new Font("Segoe UI", 18, FontStyle.Bold), ForeColor = Color.FromArgb(110, 140, 170) };
    readonly FlowLayoutPanel actions = new() { Dock = DockStyle.Bottom, Height = 52, WrapContents = false, FlowDirection = FlowDirection.LeftToRight, Padding = new Padding(16, 6, 0, 0) };
    readonly DataGridView grid = new() { Dock = DockStyle.Fill, BackgroundColor = Color.White, BorderStyle = BorderStyle.None, RowHeadersVisible = false, AllowUserToAddRows = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, SelectionMode = DataGridViewSelectionMode.FullRowSelect, EnableHeadersVisualStyles = false };
    readonly Label totalLbl = new() { Dock = DockStyle.Bottom, Height = 44, Font = new Font("Segoe UI", 10, FontStyle.Bold), TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(20, 0, 0, 0), Visible = false };
    readonly Label info = new() { Dock = DockStyle.Fill, Font = new Font("Segoe UI", 12), Padding = new Padding(30), Visible = false };
    readonly ComboBox cbClient = new() { Width = 220, DropDownStyle = ComboBoxStyle.DropDownList, Margin = new Padding(4, 9, 4, 0) };
    readonly Label brand = new() { ForeColor = Color.White, Font = new Font("Segoe UI", 14, FontStyle.Bold), Width = 210, Height = 50 };
    readonly System.Windows.Forms.Timer priceTimer = new() { Interval = 60000 };
    readonly HomeView home = new() { Visible = false };
    readonly HelpPanel help = new() { Visible = false };
    readonly List<(Button b, string key)> menu = new();
    string view = "Home";

    public MainForm()
    {
        Size = new Size(1400, 840); MinimumSize = new Size(1100, 700);
        StartPosition = FormStartPosition.CenterScreen;
        top.Controls.AddRange(new Control[] { crumbs, title, actions });
        Controls.AddRange(new Control[] { grid, info, home, help, totalLbl, top, side });
        foreach (var c in new Control[] { grid, info, home, help }) c.BringToFront();
        grid.ColumnHeadersDefaultCellStyle.BackColor = Color.White;
        grid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        grid.RowTemplate.Height = 32;
        grid.DataError += (_, e) => { e.ThrowException = false; MessageBox.Show(T("e.bad")); };
        grid.CellEndEdit += (_, _) => { if (view == "Portfolio") Recalc(); };
        grid.CellDoubleClick += (_, e) =>
        {
            if (view == "Portfolio" && e.RowIndex >= 0 && grid.Rows[e.RowIndex].Cells["Symbol"].Value is string sym) OpenStock(sym, CurClient);
        };
        home.OpenStock += sym => OpenStock(sym, Session.ClientId);
        grid.CellFormatting += (_, e) =>
        {
            var name = grid.Columns[e.ColumnIndex].Name;
            if (view == "Portfolio" && name == "Amount" && e.Value is decimal v)
            {
                e.CellStyle.ForeColor = v > 0 ? Color.Green : v < 0 ? Color.Firebrick : Color.Gray;
                e.Value = (v > 0 ? "↑ " : v < 0 ? "↓ " : "= ") + Math.Abs(v).ToString("N2");
                e.FormattingApplied = true;
            }
            else if (e.Value is string s && (name is "Status" or "Type" or "Kind" or "Role"))
            {
                e.Value = Val(s); e.FormattingApplied = true; // значения из БД показываем на выбранном языке
            }
        };
        BuildMenu();
        ApplyLang();
        Loc.Changed += ApplyLang;                       // язык меняется прямо в приложении
        FormClosed += (_, _) => { Loc.Changed -= ApplyLang; priceTimer.Stop(); };
        priceTimer.Tick += (_, _) => TickPrices();
        priceTimer.Start();
        TickPrices(); // при запуске «догоняем» пропущенные часы
    }

    // ---------- меню ----------
    void BuildMenu()
    {
        side.Controls.Add(brand);
        var items = Session.IsStaff
            ? new List<(string, string)> { ("Home", "m.Home"), ("Clients", "m.Clients"), ("Projects", "m.Projects"), ("Portfolio", "m.Portfolio"), ("Transactions", "m.Transactions"), ("Reports", "m.Reports") }
            : new List<(string, string)> { ("Home", "m.Home"), ("Portfolio", "m.MyPortfolio"), ("Transactions", "m.History"), ("Profile", "m.Profile") };
        if (Session.IsAdmin) items.Add(("Admin", "m.Admin"));
        items.Add(("Help", "m.Help"));
        foreach (var (v, key) in items) side.Controls.Add(MenuBtn(key, () => Show(v)));
        var lo = MenuBtn("m.Logout", () => { Db.Audit("Выход"); LoggedOut = true; Close(); });
        lo.ForeColor = Color.IndianRed;
        side.Controls.Add(lo);
        side.Controls.Add(new LangBar(Color.White, false, 214) { Margin = new Padding(8, 25, 0, 0) });
    }

    Button MenuBtn(string key, Action a)
    {
        var b = new Button { Width = 214, Height = 44, FlatStyle = FlatStyle.Flat, ForeColor = Color.White, TextAlign = ContentAlignment.MiddleLeft, Font = new Font("Segoe UI", 10.5f) };
        b.FlatAppearance.BorderSize = 0;
        b.Click += (_, _) => Safe(a);
        menu.Add((b, key));
        return b;
    }

    void ApplyLang()
    {
        Text = $"{T("app.title")} [{Session.Login}, {Val(Session.Role)}]";
        brand.Text = T("bank");
        foreach (var (b, k) in menu) b.Text = "   " + T(k);
        Safe(() => Show(view));
    }

    Button Btn(string key, Action a, bool primary = false, Color? color = null)
    {
        var b = new Button { Text = T(key), AutoSize = true, MinimumSize = new Size(80, 34), FlatStyle = FlatStyle.Flat, Margin = new Padding(4, 4, 4, 0), BackColor = color ?? (primary ? Green : Color.White), ForeColor = (primary || color != null) ? Color.White : Color.Black };
        b.Click += (_, _) => Safe(a);
        return b;
    }

    static void Safe(Action a)
    {
        try { a(); } catch (Exception ex) { MessageBox.Show(ex.Message, T("err.title"), MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    // ---------- разделы ----------
    string ViewTitle() => view switch
    {
        "Home" => T("m.Home"), "Clients" => T("m.Clients"), "Profile" => T("m.Profile"),
        "Portfolio" => Session.IsStaff ? T("t.Portfolio") : T("m.MyPortfolio"),
        "Transactions" => Session.IsStaff ? T("m.Transactions") : T("m.History"),
        "Projects" => T("t.Projects"), "Reports" => T("t.Reports"), "Admin" => T("t.Admin"), "Help" => T("m.Help"), _ => view
    };

    void Show(string v)
    {
        view = v;
        actions.Controls.Clear();
        totalLbl.Visible = false;
        info.Visible = v == "Profile";
        home.Visible = v == "Home";
        help.Visible = v == "Help";
        grid.Visible = !(v is "Home" or "Profile" or "Help");
        grid.ReadOnly = true;
        grid.DataSource = null;
        title.Text = ViewTitle();
        crumbs.Text = T("bank") + "  >  " + title.Text;
        switch (v)
        {
            case "Home": home.Reload(); break;
            case "Help": help.Reload(); break;
            case "Profile": LoadProfile(); break;
            case "Clients": LoadClients(); break;
            case "Portfolio": SetupPortfolio(); break;
            case "Transactions": LoadTransactions(); break;
            case "Projects": LoadProjects(); break;
            case "Reports": LoadReport(); break;
            case "Admin": LoadUsers(); break;
        }
    }

    void Bind(DataTable t)
    {
        grid.DataSource = t;
        foreach (DataGridViewColumn c in grid.Columns) c.HeaderText = Col(c.Name);
        if (grid.Columns.Contains("Id")) grid.Columns["Id"]!.Visible = false;
    }

    void LoadProfile()
    {
        var c = Db.Table("SELECT Name, CASE WHEN Kind='Personal' THEN NULL ELSE UNP END AS UNP, Address, Contacts, Status, Kind FROM Clients WHERE Id=@i", "@i", Session.ClientId);
        if (c.Rows.Count == 0) { info.Text = T("nodata"); return; }
        var r = c.Rows[0];
        string F(string col, bool loc = false) { var s = r[col]?.ToString() ?? ""; return $"{Col(col)}: {(loc ? Val(s) : s)}\n"; }
        info.Text = F("Name") + (r["UNP"] is DBNull ? "" : F("UNP")) + F("Address") + F("Contacts") + F("Status", true) + F("Kind", true);
    }

    // ---------- клиенты ----------
    void LoadClients()
    {
        Bind(Db.Table(@"SELECT c.Id, c.Name, CASE WHEN c.Kind='Personal' THEN NULL ELSE c.UNP END AS UNP, c.Address, c.Contacts, c.Status, c.Kind,
                        (SELECT TOP 1 Number FROM DepoAccounts d WHERE d.ClientId=c.Id) AS Depo FROM Clients c ORDER BY c.Name"));
        actions.Controls.Add(Btn("b.AddClient", AddClient, true));
        if (Session.IsAdmin) actions.Controls.Add(Btn("b.Delete", () =>
        {
            if (SelId() is not int id) return;
            if (MessageBox.Show(T("e.delclient"), T("e.cascade"), MessageBoxButtons.YesNo) != DialogResult.Yes) return;
            Db.Exec("DELETE FROM Clients WHERE Id=@i", "@i", id);
            Db.Audit("Удаление клиента", "Id=" + id);
            LoadClients();
        }));
        actions.Controls.Add(Btn("b.Export", Export));
    }

    void AddClient()
    {
        var v = Prompt(T("p.NewClient"), (T("col.Name"), "", false), (T("reg.unp"), "", false), (T("reg.address"), "", false), (T("reg.contacts"), "", false), (T("reg.pass"), "", true));
        if (v == null) return;
        if (!System.Text.RegularExpressions.Regex.IsMatch(v[1], @"^\d{9}$")) throw new Exception(T("reg.e.unp"));
        if (v[0] == "" || v[4].Length < 6) throw new Exception(T("reg.e.empty"));
        if (Db.Scalar("SELECT 1 FROM Clients WHERE UNP=@u", "@u", v[1]) != null) throw new Exception(T("reg.e.exists"));
        Db.Exec(@"SET XACT_ABORT ON; BEGIN TRAN;
                  INSERT Clients(Name,UNP,Address,Contacts,Kind) VALUES(@n,@u,@a,@c,'Company');
                  DECLARE @id INT = SCOPE_IDENTITY();
                  INSERT DepoAccounts(ClientId,Number) VALUES(@id,'DEPO-'+@u);
                  INSERT Users(CompanyId,Login,PasswordHash,Role,ClientId) VALUES(@u,@u,@h,'Client',@id);
                  COMMIT;", "@n", v[0], "@u", v[1], "@a", v[2], "@c", v[3], "@h", Db.Hash(v[4]));
        Db.Audit("Создан клиент + счёт депо", v[1]);
        LoadClients();
    }

    // ---------- портфель ----------
    void SetupPortfolio()
    {
        if (Session.IsStaff)
        {
            var keep = cbClient.SelectedValue as int?;
            cbClient.SelectedIndexChanged -= CbChanged;
            cbClient.DataSource = Db.Table("SELECT Id,Name FROM Clients ORDER BY Name");
            cbClient.DisplayMember = "Name"; cbClient.ValueMember = "Id";
            if (keep != null) cbClient.SelectedValue = keep;
            cbClient.SelectedIndexChanged += CbChanged;
            actions.Controls.Add(cbClient);
            actions.Controls.Add(Btn("b.AddHolding", AddHolding));
        }
        actions.Controls.Add(Btn("b.Buy", DoBuy, color: Green));
        actions.Controls.Add(Btn("b.Sell", DoSell, color: Color.FromArgb(214, 69, 65)));
        actions.Controls.Add(Btn("b.MyOffers", DoOffers));
        actions.Controls.Add(Btn("b.Export", Export));
        actions.Controls.Add(Btn("b.Save", SaveTargets, true));
        LoadPortfolio();
    }

    void CbChanged(object? s, EventArgs e) => Safe(LoadPortfolio);
    int? CurClient => Session.IsStaff ? cbClient.SelectedValue as int? : Session.ClientId;

    void LoadPortfolio()
    {
        var t = Db.Table(@"SELECT h.Id, s.Symbol, s.Name, s.Segment, h.Quantity AS Qty,
                           ISNULL((SELECT SUM(l.Quantity) FROM Listings l WHERE l.SellerClientId=d.ClientId AND l.SecurityId=h.SecurityId AND l.Status=N'Активно'),0) AS ForSale,
                           s.Price AS Price, s.ExpenseRatio, h.Quantity*s.Price AS CurrentValue, h.TargetPct
                           FROM Holdings h JOIN DepoAccounts d ON d.Id=h.DepoAccountId JOIN Securities s ON s.Id=h.SecurityId
                           WHERE d.ClientId=@c ORDER BY s.Symbol", "@c", CurClient);
        t.Columns.Add("CurrentPct", typeof(decimal)).SetOrdinal(9);
        t.Columns.Add("TargetValue", typeof(decimal)).SetOrdinal(10);
        t.Columns.Add("Amount", typeof(decimal));
        Bind(t);
        foreach (DataGridViewColumn c in grid.Columns) c.ReadOnly = c.Name != "TargetPct";
        grid.Columns["Qty"]!.FillWeight = 45; grid.Columns["ForSale"]!.FillWeight = 55; grid.Columns["Price"]!.FillWeight = 55;
        grid.Columns["Segment"]!.FillWeight = 70; grid.Columns["Name"]!.FillWeight = 130;
        grid.ReadOnly = false;
        totalLbl.Visible = true;
        Recalc();
    }

    void Recalc()
    {
        if (grid.DataSource is not DataTable t) return;
        grid.EndEdit();
        decimal tot = t.AsEnumerable().Sum(r => r.Field<decimal>("CurrentValue"));
        foreach (DataRow r in t.Rows)
        {
            var cv = r.Field<decimal>("CurrentValue");
            var tp = r.IsNull("TargetPct") ? 0 : r.Field<decimal>("TargetPct");
            r["CurrentPct"] = tot == 0 ? 0 : Math.Round(cv / tot * 100, 2);
            r["TargetValue"] = Math.Round(tot * tp / 100, 2);
            r["Amount"] = (decimal)r["TargetValue"] - cv; // >0 купить, <0 продать
        }
        decimal tv = t.AsEnumerable().Sum(r => r.Field<decimal>("TargetValue"));
        decimal tpSum = t.AsEnumerable().Sum(r => r.IsNull("TargetPct") ? 0 : r.Field<decimal>("TargetPct"));
        totalLbl.Text = string.Format(T("total"), tot.ToString("N2"), tv.ToString("N2"), tpSum.ToString("N2"), (tv - tot).ToString("N2"));
    }

    void SaveTargets()
    {
        if (grid.DataSource is not DataTable t) return;
        Recalc();
        if (t.AsEnumerable().Sum(r => r.Field<decimal>("TargetPct")) > 100) throw new Exception(T("e.sum100"));
        foreach (DataRow r in t.Rows) Db.Exec("UPDATE Holdings SET TargetPct=@p WHERE Id=@i", "@p", r["TargetPct"], "@i", r["Id"]);
        Db.Audit("Сохранены целевые доли", "Client=" + CurClient);
        MessageBox.Show(T("e.saved"));
    }

    void AddHolding()
    {
        var v = Prompt(T("b.AddHolding"), (T("col.Symbol"), "", false), (T("p.Qty"), "1", false));
        if (v == null) return;
        if (!int.TryParse(v[1], out int q) || q <= 0) throw new Exception(T("e.qty"));
        var acc = Db.Scalar("SELECT TOP 1 Id FROM DepoAccounts WHERE ClientId=@c", "@c", CurClient) ?? throw new Exception(T("e.noaccount"));
        var sec = Db.Scalar("SELECT Id FROM Securities WHERE Symbol=@s", "@s", v[0]) ?? throw new Exception(T("e.nosec"));
        Db.Exec(@"IF EXISTS(SELECT 1 FROM Holdings WHERE DepoAccountId=@a AND SecurityId=@s) UPDATE Holdings SET Quantity=Quantity+@q WHERE DepoAccountId=@a AND SecurityId=@s
                  ELSE INSERT Holdings(DepoAccountId,SecurityId,Quantity) VALUES(@a,@s,@q)", "@a", acc, "@s", sec, "@q", q);
        Db.Audit("Добавлен актив", v[0]);
        LoadPortfolio();
    }

    // ---------- транзакции ----------
    void LoadTransactions()
    {
        Bind(Db.Table(@"SELECT t.Id, t.Date AS [Date], c.Name AS Client, s.Symbol AS Security, t.Type AS [Type], t.Quantity AS Qty,
                        t.Price AS Price, t.Commission AS Commission, t.Status AS Status
                        FROM Transactions t JOIN DepoAccounts d ON d.Id=t.DepoAccountId JOIN Clients c ON c.Id=d.ClientId JOIN Securities s ON s.Id=t.SecurityId
                        WHERE (@c IS NULL OR c.Id=@c) ORDER BY t.Date DESC", "@c", Session.IsStaff ? null : Session.ClientId));
        actions.Controls.Add(Btn("b.Export", Export));
    }

    // ---------- инвестпроекты ----------
    void LoadProjects()
    {
        var t = Db.Table("SELECT Id, Name AS Project, Rate, CashFlows FROM InvestmentProjects");
        foreach (var n in new[] { "NPV", "IRR", "PI", "Payback" }) t.Columns.Add(n, typeof(string));
        foreach (DataRow r in t.Rows)
        {
            var cf = ((string)r["CashFlows"]).Split(';').Select(x => double.Parse(x.Trim(), CultureInfo.InvariantCulture)).ToArray();
            double rate = (double)(decimal)r["Rate"] / 100;
            double Npv(double q) => cf.Select((c, i) => c / Math.Pow(1 + q, i)).Sum();
            double lo = -0.99, hi = 10; // IRR — бисекция
            for (int i = 0; i < 200; i++) { double mid = (lo + hi) / 2; if (Npv(mid) > 0) lo = mid; else hi = mid; }
            double pi = cf.Skip(1).Select((c, i) => c / Math.Pow(1 + rate, i + 1)).Sum() / -cf[0];
            double cum = cf[0]; string pb = T("p.never");
            for (int i = 1; i < cf.Length; i++) { if (cum + cf[i] >= 0) { pb = (i - 1 + -cum / cf[i]).ToString("0.00"); break; } cum += cf[i]; }
            r["NPV"] = Npv(rate).ToString("N2"); r["IRR"] = (lo * 100).ToString("N2"); r["PI"] = pi.ToString("N2"); r["Payback"] = pb;
        }
        Bind(t);
        actions.Controls.Add(Btn("b.AddProject", () =>
        {
            var v = Prompt(T("p.NewProject"), (T("col.Project"), "", false), (T("p.Rate"), "10", false), (T("p.Flows") + " (-1000;300;400)", "", false));
            if (v == null) return;
            Db.Exec("INSERT InvestmentProjects(Name,Rate,CashFlows) VALUES(@n,@r,@c)", "@n", v[0], "@r", decimal.Parse(v[1], CultureInfo.InvariantCulture), "@c", v[2]);
            LoadProjects();
        }, true));
        actions.Controls.Add(Btn("b.Export", Export));
    }

    // ---------- отчёты ----------
    void LoadReport()
    {
        var t = Db.Table(@"DECLARE @f DATETIME=DATEADD(DAY,-30,GETDATE());
            SELECT N'r.ops' AS Metric, CAST(COUNT(*) AS DECIMAL(18,2)) AS Value FROM Transactions WHERE Status=N'Исполнена' AND Date>=@f
            UNION ALL SELECT N'r.income', ISNULL(SUM(Commission),0) FROM Transactions WHERE Status=N'Исполнена' AND Date>=@f
            UNION ALL SELECT N'r.top:'+Symbol, Cnt FROM (SELECT TOP 3 s.Symbol, CAST(COUNT(*) AS DECIMAL(18,2)) Cnt FROM Transactions t JOIN Securities s ON s.Id=t.SecurityId
                      WHERE t.Date>=@f GROUP BY s.Symbol ORDER BY COUNT(*) DESC) x");
        foreach (DataRow r in t.Rows)
        {
            var m = (string)r["Metric"];
            r["Metric"] = m.StartsWith("r.top:") ? T("r.top") + m[6..] : T(m);
        }
        Bind(t);
        actions.Controls.Add(Btn("b.Export", Export, true));
    }

    // ---------- администрирование ----------
    void LoadUsers()
    {
        Bind(Db.Table("SELECT Id, CompanyId AS Company, Login, Role, IsActive AS Active FROM Users ORDER BY Role, Login"));
        actions.Controls.Add(Btn("b.AddEmployee", () =>
        {
            var v = Prompt(T("p.NewEmp"), (T("reg.login"), "", false), (T("reg.pass"), "", true), (T("p.Role"), "Employee", false));
            if (v == null) return;
            if (v[0].Length < 3 || v[1].Length < 6) throw new Exception(T("reg.e.empty"));
            if (Db.Scalar("SELECT 1 FROM Users WHERE Login=@l AND CompanyId IN ('ASB','PERSONAL')", "@l", v[0]) != null) throw new Exception(T("reg.e.exists"));
            Db.Exec("INSERT Users(CompanyId,Login,PasswordHash,Role) VALUES('ASB',@l,@h,@r)", "@l", v[0], "@h", Db.Hash(v[1]), "@r", v[2] == "Admin" ? "Admin" : "Employee");
            Db.Audit("Создан сотрудник", v[0]);
            LoadUsers();
        }, true));
        actions.Controls.Add(Btn("b.Delete", () =>
        {
            if (SelId() is not int id) return;
            if (grid.CurrentRow!.Cells["Login"].Value?.ToString() == Session.Login) throw new Exception(T("e.self"));
            Db.Exec("DELETE FROM Users WHERE Id=@i", "@i", id);
            Db.Audit("Удалена учётная запись", "Id=" + id);
            LoadUsers();
        }));
        actions.Controls.Add(Btn("b.Log", () =>
        {
            title.Text = T("t.Log");
            Bind(Db.Table("SELECT TOP 500 At AS [Time], UserLogin AS [User], Action, Details FROM AuditLog ORDER BY Id DESC"));
        }));
    }

    // ---------- торговля и рынок ----------
    void DoBuy()
    {
        if (CurClient is not int c) return;
        using var f = new BuyForm(c);
        if (f.ShowDialog(this) == DialogResult.OK) LoadPortfolio();
    }

    void DoSell()
    {
        if (CurClient is not int c) return;
        using var f = new SellForm(c);
        if (f.ShowDialog(this) == DialogResult.OK) LoadPortfolio();
    }

    void DoOffers()
    {
        if (CurClient is not int c) return;
        using var f = new OffersForm(c);
        f.ShowDialog(this);
        LoadPortfolio();
    }

    void OpenStock(string symbol, int? clientId) => Safe(() =>
    {
        using var f = new StockForm(symbol, clientId);
        f.ShowDialog(this);
        if (view == "Home") home.Reload(); else if (view == "Portfolio") LoadPortfolio();
    });

    // Раз в минуту просим БД дописать цены за каждый ещё не записанный час; если что-то добавилось — обновляем главную
    async void TickPrices()
    {
        try
        {
            var added = await Task.Run(() => Db.Scalar("EXEC usp_UpdatePrices"));
            if (Convert.ToInt32(added ?? 0) > 0 && view == "Home") home.Reload();
        }
        catch { }
    }

    // ---------- утилиты ----------
    int? SelId() => grid.CurrentRow != null && grid.Columns.Contains("Id") ? Convert.ToInt32(grid.CurrentRow.Cells["Id"].Value) : null;

    void Export() // CSV с ';' и BOM — открывается в Excel
    {
        using var d = new SaveFileDialog { Filter = "CSV (Excel)|*.csv", FileName = view + ".csv" };
        if (d.ShowDialog() != DialogResult.OK) return;
        var cols = grid.Columns.Cast<DataGridViewColumn>().Where(c => c.Visible).ToList();
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(";", cols.Select(c => c.HeaderText)));
        foreach (DataGridViewRow r in grid.Rows)
            sb.AppendLine(string.Join(";", cols.Select(c => Convert.ToString(r.Cells[c.Index].FormattedValue, CultureInfo.CurrentCulture)?.Replace(";", ","))));
        File.WriteAllText(d.FileName, sb.ToString(), new UTF8Encoding(true));
        Db.Audit("Экспорт", view);
    }

    static string[]? Prompt(string title, params (string label, string def, bool pw)[] f)
    {
        using var d = new Form { Text = title, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false, ClientSize = new Size(440, 75 + f.Length * 34) };
        var boxes = new List<TextBox>();
        int y = 15;
        foreach (var (l, v, pw) in f)
        {
            d.Controls.Add(new Label { Text = l, Left = 15, Top = y + 3, Width = 200 });
            var tb = new TextBox { Left = 220, Top = y, Width = 205, Text = v, UseSystemPasswordChar = pw };
            d.Controls.Add(tb); boxes.Add(tb); y += 34;
        }
        var ok = new Button { Text = T("ok"), Left = 250, Top = y + 8, Width = 80, DialogResult = DialogResult.OK };
        var cancel = new Button { Text = T("cancel"), Left = 340, Top = y + 8, Width = 85, DialogResult = DialogResult.Cancel };
        d.Controls.AddRange(new Control[] { ok, cancel });
        d.AcceptButton = ok; d.CancelButton = cancel;
        return d.ShowDialog() == DialogResult.OK ? boxes.Select(b => b.Text.Trim()).ToArray() : null;
    }
}
