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

        // все показатели считает сервер — одинаково для веб-версии и приложения
        var d = Api.Get("/home");
        Api.StartListening();   // держим живое соединение (если окно пересоздано после входа)
        kpis.Controls.Clear();
        var colors = new Dictionary<string, Color>
        {
            ["blue"] = Color.SteelBlue, ["green"] = Green, ["orange"] = Color.DarkOrange, ["purple"] = Color.MediumPurple
        };
        foreach (var k in (System.Text.Json.Nodes.JsonArray)d["kpis"]!)
        {
            var accent = colors.TryGetValue(k!["accent"]?.ToString() ?? "", out var c) ? c : Green;
            kpis.Controls.Add(Card(T(k["key"]!.ToString()), k["value"]!.ToString(), accent));
        }

        Fill(gUp, Api.Table(d["up"]!));
        Fill(gDown, Api.Table(d["down"]!));
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
