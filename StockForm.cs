using System.Data;
using static BankInvest.Loc;

namespace BankInvest;

// Страница бумаги: цена, изменение за 24 ч, график (часы/дни/недели/месяцы/годы), предложения продавцов, кнопки Купить/Продать
public class StockForm : Form
{
    static readonly Color Up = Color.FromArgb(34, 160, 90), Down = Color.FromArgb(205, 60, 55);
    static readonly string[] Axis = { "dd.MM HH:mm", "dd.MM", "dd.MM.yy", "MM.yyyy", "yyyy" };
    static readonly string[] Tip = { "dd.MM.yyyy HH:mm", "dd.MM.yyyy", "dd.MM.yyyy", "MM.yyyy", "yyyy" };
    static readonly string[] Keys = { "s.hours", "s.days", "s.weeks", "s.months", "s.years" };

    readonly string symbol;
    readonly int? clientId;
    int secId, grain = 1;

    readonly Label lblTitle = new() { Left = 24, Top = 10, AutoSize = true, Font = new Font("Segoe UI", 18, FontStyle.Bold) };
    readonly Label lblSub = new() { Left = 26, Top = 50, AutoSize = true, ForeColor = Color.Gray };
    readonly Label lblPrice = new() { Left = 24, Top = 74, AutoSize = true, Font = new Font("Segoe UI", 20, FontStyle.Bold) };
    readonly Label lblChange = new() { Top = 84, AutoSize = true, Font = new Font("Segoe UI", 11, FontStyle.Bold) };
    readonly Label lblHint = new() { AutoSize = true, ForeColor = Color.Gray, Font = new Font("Segoe UI", 9), Anchor = AnchorStyles.Top | AnchorStyles.Right };
    readonly Label lblStats = new() { Top = 17, AutoSize = true, Font = new Font("Segoe UI", 10, FontStyle.Bold) };
    readonly RadioButton[] rb = new RadioButton[5];
    readonly PriceChart chart = new() { Dock = DockStyle.Fill };
    readonly DataGridView g = Ui.Grid();
    readonly Label lblOffers = new() { Left = 24, Top = 12, AutoSize = true, Font = new Font("Segoe UI", 11, FontStyle.Bold) };
    readonly Button btnBuy, btnSell;


    public StockForm(string symbol, int? clientId)
    {
        this.symbol = symbol; this.clientId = clientId;
        ClientSize = new Size(1040, 760); MinimumSize = new Size(900, 640);
        StartPosition = FormStartPosition.CenterParent; BackColor = Color.White; Font = new Font("Segoe UI", 9.5f);

        var header = new Panel { Dock = DockStyle.Top, Height = 124, BackColor = Color.FromArgb(244, 248, 251) };
        header.Controls.AddRange(new Control[] { lblTitle, lblSub, lblPrice, lblChange, lblHint });
        lblHint.Location = new Point(ClientSize.Width - 360, 18);

        var bar = new Panel { Dock = DockStyle.Top, Height = 54 };
        for (int i = 0; i < 5; i++)
        {
            int idx = i;
            var b = new RadioButton
            {
                Appearance = Appearance.Button, FlatStyle = FlatStyle.Flat, TextAlign = ContentAlignment.MiddleCenter,
                Size = new Size(100, 34), Location = new Point(24 + i * 106, 10), Checked = i == grain
            };
            b.FlatAppearance.BorderColor = Color.Silver;
            b.CheckedChanged += (_, _) => { Style(b); if (b.Checked) { grain = idx; Safe(LoadChart); } };
            rb[i] = b; bar.Controls.Add(b);
        }
        lblStats.Left = 24 + 5 * 106 + 20; bar.Controls.Add(lblStats);

        var host = new Panel { Dock = DockStyle.Fill, Padding = new Padding(14, 4, 14, 4) };
        host.Controls.Add(chart);

        var bottom = new Panel { Dock = DockStyle.Bottom, Height = 230 };
        var strip = new Panel { Dock = DockStyle.Top, Height = 46 };
        btnBuy = Dlg.Primary("", Ui.Green, new Rectangle(0, 5, 130, 36)); btnSell = Dlg.Primary("", Ui.Red, new Rectangle(0, 5, 130, 36));
        btnBuy.Anchor = btnSell.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        strip.Controls.AddRange(new Control[] { lblOffers, btnBuy, btnSell });
        strip.Resize += (_, _) => { btnBuy.Left = strip.Width - 154; btnSell.Left = strip.Width - 294; };
        g.Dock = DockStyle.Fill;
        var gHost = new Panel { Dock = DockStyle.Fill, Padding = new Padding(24, 0, 24, 14) };
        gHost.Controls.Add(g);
        bottom.Controls.AddRange(new Control[] { gHost, strip });
        gHost.BringToFront();

        Controls.AddRange(new Control[] { host, bottom, bar, header });
        host.BringToFront();

        btnBuy.Visible = btnSell.Visible = clientId != null;     // торговать может клиент (или сотрудник от имени выбранного клиента)
        btnBuy.Click += (_, _) => Safe(() => { using var f = new BuyForm(clientId!.Value, secId); if (f.ShowDialog(this) == DialogResult.OK) ReloadAll(); });
        btnSell.Click += (_, _) => Safe(() => { using var f = new SellForm(clientId!.Value, secId); if (f.ShowDialog(this) == DialogResult.OK) ReloadAll(); });

        LoadHeader(); ApplyTexts(); LoadChart(); LoadOffers();
        // страница сама обновляется, когда сервер сообщает об изменении цен или данных
        Api.ServerEvent += OnServerEvent;
        FormClosed += (_, _) => Api.ServerEvent -= OnServerEvent;
    }

    static void Safe(Action a) { try { a(); } catch (Exception ex) { MessageBox.Show(ex.Message, T("err.title")); } }

    void OnServerEvent(string type, string user)
    {
        if (IsDisposed || !IsHandleCreated) return;
        try { BeginInvoke(() => Safe(ReloadAll)); } catch { }
    }

    static void Style(RadioButton b)
    {
        b.BackColor = b.Checked ? Ui.Green : Color.White; b.ForeColor = b.Checked ? Color.White : Color.Black;
    }

    void ReloadAll() { LoadHeader(); LoadChart(); LoadOffers(); }

    void ApplyTexts()
    {
        for (int i = 0; i < 5; i++) { rb[i].Text = T(Keys[i]); Style(rb[i]); }
        lblOffers.Text = T("s.offers"); lblHint.Text = T("s.hint");
        btnBuy.Text = T("b.Buy"); btnSell.Text = T("b.Sell");
    }

    void LoadHeader()
    {
        var r = Api.Get("/stock/" + Uri.EscapeDataString(symbol));
        secId = Api.Int(r["Id"]);
        decimal price = Api.Dec(r["Price"]), prev = Api.Dec(r["PrevPrice"]);
        decimal chg = prev == 0 ? 0 : (price - prev) / prev * 100;
        var c = chg > 0 ? Up : chg < 0 ? Down : Color.Gray;
        Text = $"{symbol} — {r["Name"]}";
        lblTitle.Text = $"{symbol}  ·  {r["Name"]}";
        lblSub.Text = $"{T("s.issuer")}: {r["Issuer"]}   ·   {Val(r["Kind"]!.ToString())} / {r["Segment"]}   ·   {T("s.nominal")}: {Api.Dec(r["Nominal"]):N2}   ·   {T("s.rate")}: {Api.Dec(r["Rate"]):N2}   ·   {T("s.volume")}: {Api.Dec(r["Volume"]):N0}";
        lblPrice.Text = price.ToString("N2") + " BYN";
        lblChange.Left = lblPrice.Right + 16;
        lblChange.Text = (chg > 0 ? "▲ +" : chg < 0 ? "▼ " : "") + chg.ToString("N2") + "%  (24h)";
        lblChange.ForeColor = c;
    }

    void LoadChart()
    {
        // группировку (часы / дни / недели / месяцы / годы) выполняет сервер
        var res = Api.Get($"/stock/{Uri.EscapeDataString(symbol)}/chart?grain={grain}");
        var list = new List<(DateTime t, decimal p)>();
        foreach (var pt in (JsonArray)res["points"]!)
            list.Add((Api.Date(pt!["t"]!.ToString()), Api.Dec(pt["p"])));

        chart.SetData(list, Axis[grain], Tip[grain]);
        if (list.Count == 0) { lblStats.Text = ""; return; }
        decimal first = list[0].Item2, last = list[^1].Item2, low = list.Min(x => x.Item2), high = list.Max(x => x.Item2);
        decimal chg = first == 0 ? 0 : (last - first) / first * 100;
        lblStats.Text = $"{T("s.low")}: {low:N2}      {T("s.high")}: {high:N2}      {T("s.period")}: {chg:+0.00;-0.00;0.00}%";
        lblStats.ForeColor = chg > 0 ? Up : chg < 0 ? Down : Color.Gray;
    }

    void LoadOffers()
    {
        g.DataSource = Ui.Offers(clientId, secId);
        Ui.Headers(g);
        if (g.Columns.Contains("Symbol")) g.Columns["Symbol"]!.Visible = false;
        if (g.Columns.Contains("Name")) g.Columns["Name"]!.Visible = false;
    }
}
