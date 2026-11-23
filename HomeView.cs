using System.Data;
using static BankInvest.Loc;

namespace BankInvest;

// Главная: ключевые показатели + рынок бумаг банка (выросли / упали в цене)
public class HomeView : Panel
{
    static readonly Color Green = Color.FromArgb(34, 160, 90), Red = Color.FromArgb(205, 60, 55);
    readonly Label hello = new() { Dock = DockStyle.Fill, Font = new Font("Segoe UI", 13), TextAlign = ContentAlignment.MiddleLeft };
    readonly FlowLayoutPanel kpis = new() { Dock = DockStyle.Fill, WrapContents = false };
    public event Action<string>? OpenStock;
    readonly Label hint = new() { Dock = DockStyle.Bottom, Height = 22, ForeColor = Color.Gray, Font = new Font("Segoe UI", 9) };
    readonly Label upT = new() { Dock = DockStyle.Fill, Font = new Font("Segoe UI", 12, FontStyle.Bold), ForeColor = Green, TextAlign = ContentAlignment.BottomLeft };
    readonly Label downT = new() { Dock = DockStyle.Fill, Font = new Font("Segoe UI", 12, FontStyle.Bold), ForeColor = Red, TextAlign = ContentAlignment.BottomLeft };
    readonly DataGridView gUp = MakeGrid(), gDown = MakeGrid();

    public HomeView()
    {
        Dock = DockStyle.Fill; BackColor = Color.FromArgb(240, 244, 248); Padding = new Padding(24, 8, 24, 20);
        var t = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 4, BackColor = Color.Transparent };
        t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50)); t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        t.RowStyles.Add(new RowStyle(SizeType.Absolute, 64)); t.RowStyles.Add(new RowStyle(SizeType.Absolute, 108));
        t.RowStyles.Add(new RowStyle(SizeType.Absolute, 44)); t.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var head = new Panel { Dock = DockStyle.Fill }; head.Controls.Add(hello); head.Controls.Add(hint); hello.BringToFront();
        t.Controls.Add(head, 0, 0); t.SetColumnSpan(head, 2);
        t.Controls.Add(kpis, 0, 1); t.SetColumnSpan(kpis, 2);
        t.Controls.Add(upT, 0, 2); t.Controls.Add(downT, 1, 2);
        gUp.Margin = new Padding(0, 6, 10, 0); gDown.Margin = new Padding(10, 6, 0, 0);
        t.Controls.Add(gUp, 0, 3); t.Controls.Add(gDown, 1, 3);
        Controls.Add(t);
        gUp.CellDoubleClick += (_, e) => Open(gUp, e.RowIndex);
        gDown.CellDoubleClick += (_, e) => Open(gDown, e.RowIndex);
        gUp.Cursor = gDown.Cursor = Cursors.Hand;
    }

    void Open(DataGridView g, int row)
    {
        if (row >= 0 && g.Rows[row].Cells["Symbol"].Value is string sym) OpenStock?.Invoke(sym);
    }

    static DataGridView MakeGrid()
    {
        var g = new DataGridView
        {
            Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, RowHeadersVisible = false, BackgroundColor = Color.White,
            BorderStyle = BorderStyle.None, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            EnableHeadersVisualStyles = false, ColumnHeadersHeight = 34, MultiSelect = false
        };
        g.RowTemplate.Height = 32;
        g.ColumnHeadersDefaultCellStyle.BackColor = Color.White;
        g.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        g.DefaultCellStyle.SelectionBackColor = Color.FromArgb(230, 240, 250);
        g.DefaultCellStyle.SelectionForeColor = Color.Black;
        g.CellFormatting += (_, e) =>
        {
            if (g.Columns[e.ColumnIndex].Name == "Change" && e.Value is decimal v)
            {
                var c = v > 0 ? Green : v < 0 ? Red : Color.Gray;
                e.CellStyle.ForeColor = c; e.CellStyle.SelectionForeColor = c;
                e.Value = (v > 0 ? "▲ +" : v < 0 ? "▼ " : "") + v.ToString("N2") + "%";
                e.FormattingApplied = true;
            }
        };
        return g;
    }

    Panel Card(string caption, string value, Color accent)
    {
        var p = new Panel { Size = new Size(235, 92), BackColor = Color.White, Margin = new Padding(0, 6, 16, 0) };
        p.Controls.Add(new Panel { Dock = DockStyle.Left, Width = 5, BackColor = accent });
        p.Controls.Add(new Label { Text = value, Left = 20, Top = 12, Width = 205, Height = 34, Font = new Font("Segoe UI", 15, FontStyle.Bold) });
        p.Controls.Add(new Label { Text = caption, Left = 20, Top = 56, Width = 205, ForeColor = Color.Gray });
        return p;
    }

    public void Reload()
    {
        hello.Text = string.Format(T("home.hello"), Session.Login, Val(Session.Role));
        upT.Text = T("home.up"); downT.Text = T("home.down"); hint.Text = T("home.hint");
        int? c = Session.IsStaff ? null : Session.ClientId;   // null = весь банк
        string M(object? o) => Convert.ToDecimal(o ?? 0).ToString("N2") + " BYN";

        var pv = Db.Scalar(@"SELECT ISNULL(SUM(h.Quantity*s.Price),0) FROM Holdings h JOIN DepoAccounts d ON d.Id=h.DepoAccountId
                             JOIN Securities s ON s.Id=h.SecurityId WHERE (@c IS NULL OR d.ClientId=@c)", "@c", c);
        var newOrders = Db.Scalar("SELECT COUNT(*) FROM Listings WHERE Status=N'Активно' AND (@c IS NULL OR SellerClientId=@c)", "@c", c);
        kpis.Controls.Clear();
        if (Session.IsStaff)
        {
            var clients = Db.Scalar("SELECT COUNT(*) FROM Clients");
            var income = Db.Scalar("SELECT ISNULL(SUM(Commission),0) FROM Transactions WHERE Status=N'Исполнена'");
            kpis.Controls.AddRange(new Control[] {
                Card(T("k.clients"), $"{clients}", Color.SteelBlue), Card(T("k.aum"), M(pv), Green),
                Card(T("k.offers"), $"{newOrders}", Color.DarkOrange), Card(T("k.income"), M(income), Color.MediumPurple) });
        }
        else
        {
            var secs = Db.Scalar(@"SELECT COUNT(*) FROM Holdings h JOIN DepoAccounts d ON d.Id=h.DepoAccountId
                                   WHERE d.ClientId=@c AND h.Quantity>0", "@c", c);
            var ops = Db.Scalar(@"SELECT COUNT(*) FROM Transactions t JOIN DepoAccounts d ON d.Id=t.DepoAccountId WHERE d.ClientId=@c", "@c", c);
            kpis.Controls.AddRange(new Control[] {
                Card(T("k.pv"), M(pv), Green), Card(T("k.secs"), $"{secs}", Color.SteelBlue),
                Card(T("k.myops"), $"{ops}", Color.MediumPurple), Card(T("k.myoffers"), $"{newOrders}", Color.DarkOrange) });
        }

        const string cols = "Symbol, Name, Price, CAST((Price-PrevPrice)*100.0/NULLIF(PrevPrice,0) AS DECIMAL(9,2)) AS Change";
        Fill(gUp, Db.Table($"SELECT TOP 8 {cols} FROM Securities WHERE Status=N'Размещён' AND Price>PrevPrice ORDER BY Change DESC"));
        Fill(gDown, Db.Table($"SELECT TOP 8 {cols} FROM Securities WHERE Status=N'Размещён' AND Price<PrevPrice ORDER BY Change ASC"));
    }

    static void Fill(DataGridView g, DataTable t)
    {
        g.DataSource = t;
        foreach (DataGridViewColumn c in g.Columns) c.HeaderText = Col(c.Name);
        if (g.Columns.Contains("Price")) g.Columns["Price"]!.DefaultCellStyle.Format = "N2";
        if (g.Columns.Contains("Name")) g.Columns["Name"]!.FillWeight = 150;
        g.ClearSelection();
    }
}
