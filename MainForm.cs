using System.Data;
using System.Globalization;
using System.Text;
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
        // предупреждаем только при вводе целевых долей в портфеле (в остальных разделах данные только для чтения)
        grid.DataError += (_, e) => { e.ThrowException = false; if (view == "Portfolio" && !grid.ReadOnly) MessageBox.Show(T("e.bad")); };
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
        FormClosed += (_, _) => { Loc.Changed -= ApplyLang; Api.ServerEvent -= OnServerEvent; };
        Api.ServerEvent += OnServerEvent;   // живые обновления: изменения из веб-версии и с других ПК
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
        var lo = MenuBtn("m.Logout", () => { LoggedOut = true; Close(); });   // сервер фиксирует выход при закрытии сессии
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
        var p = Api.Get("/profile");
        string F(string col, bool loc = false) { var v = p[col]?.ToString() ?? ""; return $"{Col(col)}: {(loc ? Val(v) : v)}\n"; }
        info.Text = F("Name") + (p["UNP"] == null ? "" : F("UNP")) + F("Address") + F("Contacts") + F("Status", true) + F("Kind", true);
    }

    // ---------- клиенты ----------
    void LoadClients()
    {
        Bind(Api.Table("/clients"));
        actions.Controls.Add(Btn("b.AddClient", AddClient, true));
        if (Session.IsAdmin) actions.Controls.Add(Btn("b.Delete", () =>
        {
            if (SelId() is not int id) return;
            if (MessageBox.Show(T("e.delclient"), T("e.cascade"), MessageBoxButtons.YesNo) != DialogResult.Yes) return;
            Api.Delete("/clients/" + id);
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
        Api.Post("/clients", new { name = v[0], unp = v[1], address = v[2], contacts = v[3], password = v[4] });
        LoadClients();
    }

    // ---------- портфель ----------
    void SetupPortfolio()
    {
        if (Session.IsStaff)
        {
            var keep = cbClient.SelectedValue as int?;
            cbClient.SelectedIndexChanged -= CbChanged;
            cbClient.DataSource = Api.Table("/clients/lite");
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
        var d = Api.Get("/portfolio" + (Session.IsStaff ? "?clientId=" + CurClient : ""));
        var t = Api.Table(d["rows"]!);
        // порядок столбцов — как в исходном приложении
        var order = new[] { "Id", "Symbol", "Name", "Segment", "Qty", "ForSale", "Price", "ExpenseRatio", "CurrentValue", "CurrentPct", "TargetValue", "TargetPct", "Amount" };
        for (int i = 0; i < order.Length; i++) if (t.Columns.Contains(order[i])) t.Columns[order[i]]!.SetOrdinal(i);
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
        if (t.AsEnumerable().Sum(r => r.IsNull("TargetPct") ? 0 : r.Field<decimal>("TargetPct")) > 100) throw new Exception(T("e.sum100"));
        var rows = t.AsEnumerable().Select(r => new
        {
            id = Convert.ToInt32(r["Id"]),
            targetPct = r.IsNull("TargetPct") ? (decimal?)null : r.Field<decimal>("TargetPct")
        }).ToArray();
        Api.Post("/portfolio/targets", new { clientId = Session.IsStaff ? CurClient : (int?)null, rows });
        MessageBox.Show(T("e.saved"));
    }

    void AddHolding()
    {
        var v = Prompt(T("b.AddHolding"), (T("col.Symbol"), "", false), (T("p.Qty"), "1", false));
        if (v == null) return;
        if (!int.TryParse(v[1], out int q) || q <= 0) throw new Exception(T("e.qty"));
        Api.Post("/portfolio/holdings", new { symbol = v[0], qty = q, clientId = CurClient });
        LoadPortfolio();
    }

    // ---------- транзакции ----------
    void LoadTransactions()
    {
        Bind(Api.Table("/transactions"));   // сервер сам ограничивает выборку клиентом или показывает все для сотрудника
        actions.Controls.Add(Btn("b.Export", Export));
    }

    // ---------- инвестпроекты ----------
    void LoadProjects()
    {
        // NPV, IRR, PI и срок окупаемости считает сервер (одинаково для веб и десктопа)
        Bind(Api.Table("/projects"));
        actions.Controls.Add(Btn("b.AddProject", () =>
        {
            var v = Prompt(T("p.NewProject"), (T("col.Project"), "", false), (T("p.Rate"), "10", false), (T("p.Flows") + " (-1000;300;400)", "", false));
            if (v == null) return;
            Api.Post("/projects", new { name = v[0], rate = double.Parse(v[1], CultureInfo.InvariantCulture), cashFlows = v[2] });
            LoadProjects();
        }, true));
        actions.Controls.Add(Btn("b.Export", Export));
    }

    // ---------- отчёты ----------
    void LoadReport()
    {
        var t = Api.Table("/report");
        if (t.Columns.Contains("metric")) t.Columns["metric"]!.ColumnName = "Metric";
        if (t.Columns.Contains("value")) t.Columns["value"]!.ColumnName = "Value";
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
        Bind(Api.Table("/users"));
        actions.Controls.Add(Btn("b.AddEmployee", () =>
        {
            var v = Prompt(T("p.NewEmp"), (T("reg.login"), "", false), (T("reg.pass"), "", true), (T("p.Role"), "Employee", false));
            if (v == null) return;
            if (v[0].Length < 3 || v[1].Length < 6) throw new Exception(T("reg.e.empty"));
            Api.Post("/users", new { login = v[0], password = v[1], role = v[2] == "Admin" ? "Admin" : "Employee" });
            LoadUsers();
        }, true));
        actions.Controls.Add(Btn("b.Delete", () =>
        {
            if (SelId() is not int id) return;
            if (grid.CurrentRow!.Cells["Login"].Value?.ToString() == Session.Login) throw new Exception(T("e.self"));
            Api.Delete("/users/" + id);
            LoadUsers();
        }));
        actions.Controls.Add(Btn("b.Log", () =>
        {
            title.Text = T("t.Log");
            Bind(Api.Table("/audit"));
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

    // Сервер присылает события: «prices» — обновились котировки, «changed» — кто-то (веб-версия
    // или другой компьютер) изменил данные. Тогда просто перечитываем текущий раздел.
    void OnServerEvent(string type, string user)
    {
        if (IsDisposed || !IsHandleCreated) return;
        try
        {
            BeginInvoke(() =>
            {
                try
                {
                    if (view is "Home" or "Portfolio" or "Transactions") Show(view);
                }
                catch { }
            });
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
        Api.Post("/audit", new { action = "Экспорт", details = view });
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
