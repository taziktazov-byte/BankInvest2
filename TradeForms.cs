using System.Data;
using static BankInvest.Loc;

namespace BankInvest;

static class Dlg
{
    public static void Init(Form f, string title, Size size)
    {
        f.Text = title; f.ClientSize = size; f.StartPosition = FormStartPosition.CenterParent;
        f.FormBorderStyle = FormBorderStyle.FixedDialog; f.MaximizeBox = false; f.MinimizeBox = false;
        f.BackColor = Color.White; f.Font = new Font("Segoe UI", 9.5f);
    }

    public static Label Cap(Form f, string text, int x, int y)
    {
        var l = new Label { Text = text, Left = x, Top = y, AutoSize = true, Font = new Font("Segoe UI", 9, FontStyle.Bold) };
        f.Controls.Add(l); return l;
    }

    // панель итогов: подписи слева, значения справа
    public static (Label[] cap, Label[] val) Summary(Form f, Point at, int width, string[] keys)
    {
        var box = new Panel { Location = at, Size = new Size(width, 14 + keys.Length * 27), BackColor = Color.FromArgb(244, 248, 251) };
        var cap = new Label[keys.Length]; var val = new Label[keys.Length];
        for (int i = 0; i < keys.Length; i++)
        {
            bool last = i == keys.Length - 1;
            var fnt = new Font("Segoe UI", last ? 10.5f : 9.5f, last ? FontStyle.Bold : FontStyle.Regular);
            cap[i] = new Label { Text = T(keys[i]), Left = 14, Top = 10 + i * 27, Width = width / 2 - 14, Font = fnt };
            val[i] = new Label { Left = width / 2, Top = 10 + i * 27, Width = width / 2 - 14, TextAlign = ContentAlignment.TopRight, Font = fnt };
            box.Controls.Add(cap[i]); box.Controls.Add(val[i]);
        }
        f.Controls.Add(box);
        return (cap, val);
    }

    public static Button Primary(string text, Color c, Rectangle b)
    {
        var ok = new Button { Text = text, Bounds = b, BackColor = c, ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI", 10, FontStyle.Bold) };
        ok.FlatAppearance.BorderSize = 0; return ok;
    }
}

// ---------- Покупка: выбрать предложение продавца ----------
public class BuyForm : Form
{
    readonly int clientId;
    readonly ComboBox cb = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 740 };
    readonly DataGridView g = Ui.Grid();
    readonly NumericUpDown nud = new() { Minimum = 1, Maximum = 1, Value = 1, Width = 150 };
    readonly Label lblAvail = new() { AutoSize = true, ForeColor = Color.Gray };
    readonly Label[] cap, val;
    readonly Button ok, cancel = new();
    bool busy;

    public BuyForm(int clientId, int? securityId = null)
    {
        this.clientId = clientId;
        Dlg.Init(this, T("buy.title"), new Size(780, 560));
        Dlg.Cap(this, T("col.Security"), 20, 14);
        cb.Location = new Point(20, 36); Controls.Add(cb);
        var dt = Db.Table("SELECT Id, Symbol + N'  —  ' + Name AS Label FROM Securities WHERE Status=N'Размещён' ORDER BY Symbol");
        var all = dt.NewRow(); all["Id"] = 0; all["Label"] = T("b.all"); dt.Rows.InsertAt(all, 0);
        cb.DisplayMember = "Label"; cb.ValueMember = "Id"; cb.DataSource = dt;
        if (securityId != null) cb.SelectedValue = securityId.Value;

        Dlg.Cap(this, T("buy.pick"), 20, 76);
        g.SetBounds(20, 98, 740, 240); Controls.Add(g);

        Dlg.Cap(this, T("p.Qty"), 20, 356);
        nud.Location = new Point(20, 378); lblAvail.Location = new Point(185, 382);
        Controls.AddRange(new Control[] { nud, lblAvail });
        (cap, val) = Dlg.Summary(this, new Point(400, 350), 360, new[] { "o.price", "o.amount", "o.comm", "o.pay" });

        cancel.Text = T("cancel"); cancel.SetBounds(20, 490, 130, 44); cancel.FlatStyle = FlatStyle.Flat; cancel.DialogResult = DialogResult.Cancel;
        ok = Dlg.Primary(T("b.Buy"), Ui.Green, new Rectangle(400, 490, 360, 44));
        ok.Click += (_, _) => DoBuy();
        Controls.AddRange(new Control[] { ok, cancel });
        CancelButton = cancel;

        cb.SelectedIndexChanged += (_, _) => LoadOffers();
        g.SelectionChanged += (_, _) => Upd();
        nud.ValueChanged += (_, _) => Upd();
        LoadOffers();
    }

    DataRow? Cur => (g.CurrentRow?.DataBoundItem as DataRowView)?.Row;

    void LoadOffers()
    {
        int sid = cb.SelectedValue is int v ? v : 0;
        g.DataSource = Db.Table(Ui.OffersSql, "@c", clientId, "@s", sid == 0 ? null : sid);
        Ui.Headers(g);
        Upd();
    }

    void Upd()
    {
        if (busy) return;
        var row = Cur;
        if (row == null)
        {
            lblAvail.Text = T("buy.empty"); ok.Enabled = false; nud.Enabled = false;
            foreach (var l in val) l.Text = "";
            return;
        }
        int avail = row.Field<int>("Available"); decimal price = row.Field<decimal>("Price");
        busy = true; nud.Enabled = true; nud.Maximum = Math.Max(1, avail); if (nud.Value > avail) nud.Value = avail; busy = false;
        int qty = (int)nud.Value;
        decimal amount = price * qty, comm = Math.Round(amount * 0.005m, 2);
        lblAvail.Text = string.Format(T("buy.avail"), avail);
        val[0].Text = price.ToString("N2") + " BYN"; val[1].Text = amount.ToString("N2") + " BYN";
        val[2].Text = comm.ToString("N2") + " BYN"; val[3].Text = (amount + comm).ToString("N2") + " BYN";
        val[3].ForeColor = cap[3].ForeColor = Ui.Green;
        ok.Enabled = qty >= 1 && qty <= avail;
    }

    void DoBuy()
    {
        var row = Cur; if (row == null) return;
        try
        {
            Trading.Buy(row.Field<int>("Id"), clientId, (int)nud.Value);
            MessageBox.Show(string.Format(T("buy.ok"), (int)nud.Value, row.Field<string>("Symbol")));
            DialogResult = DialogResult.OK;
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, T("err.title"), MessageBoxButtons.OK, MessageBoxIcon.Warning); LoadOffers(); }
    }
}

// ---------- Продажа: выставить свои бумаги на рынок ----------
public class SellForm : Form
{
    readonly int clientId;
    readonly ComboBox cb = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 440 };
    readonly NumericUpDown nQty = new() { Minimum = 1, Maximum = 1, Value = 1, Width = 150 };
    readonly NumericUpDown nPrice = new() { DecimalPlaces = 2, Minimum = 0.01m, Maximum = 1000000m, Increment = 0.10m, Value = 1, Width = 150 };
    readonly Label lblFree = new() { AutoSize = true, ForeColor = Color.Gray }, lblMarket = new() { AutoSize = true, ForeColor = Color.Gray };
    readonly Label[] cap, val;
    readonly Button ok, cancel = new();
    bool busy;

    public SellForm(int clientId, int? securityId = null)
    {
        this.clientId = clientId;
        Dlg.Init(this, T("sell.title"), new Size(480, 400));
        Dlg.Cap(this, T("col.Security"), 20, 14);
        cb.Location = new Point(20, 36); Controls.Add(cb);
        var t = Db.Table(@"SELECT s.Id, s.Symbol, s.Name, s.Price,
              h.Quantity - ISNULL((SELECT SUM(l.Quantity) FROM Listings l WHERE l.SellerClientId=@c AND l.SecurityId=h.SecurityId AND l.Status=N'Активно'),0) AS Free
              FROM Holdings h JOIN DepoAccounts d ON d.Id=h.DepoAccountId JOIN Securities s ON s.Id=h.SecurityId
              WHERE d.ClientId=@c AND s.Status=N'Размещён'", "@c", clientId);
        t.Columns.Add("Label", typeof(string), "Symbol + '  —  ' + Name + '  (' + Convert(Free, 'System.String') + ')'");
        cb.DisplayMember = "Label"; cb.ValueMember = "Id";
        cb.DataSource = new DataView(t) { RowFilter = "Free > 0" };
        if (securityId != null) cb.SelectedValue = securityId.Value;

        Dlg.Cap(this, T("p.Qty"), 20, 80);
        nQty.Location = new Point(20, 102); lblFree.Location = new Point(185, 106);
        Dlg.Cap(this, T("sell.price"), 20, 146);
        nPrice.Location = new Point(20, 168); lblMarket.Location = new Point(185, 172);
        Controls.AddRange(new Control[] { nQty, lblFree, nPrice, lblMarket });
        (cap, val) = Dlg.Summary(this, new Point(20, 214), 440, new[] { "o.amount", "o.comm", "o.receive" });

        cancel.Text = T("cancel"); cancel.SetBounds(20, 330, 130, 44); cancel.FlatStyle = FlatStyle.Flat; cancel.DialogResult = DialogResult.Cancel;
        ok = Dlg.Primary(T("sell.submit"), Ui.Red, new Rectangle(170, 330, 290, 44));
        ok.Click += (_, _) => DoSell();
        Controls.AddRange(new Control[] { ok, cancel });
        CancelButton = cancel;

        cb.SelectedIndexChanged += (_, _) => OnSecurity();
        nQty.ValueChanged += (_, _) => Upd();
        nPrice.ValueChanged += (_, _) => Upd();
        OnSecurity();
    }

    DataRow? Cur => (cb.SelectedItem as DataRowView)?.Row;

    void OnSecurity()
    {
        var row = Cur;
        if (row == null) { lblFree.Text = T("sell.none"); ok.Enabled = false; foreach (var l in val) l.Text = ""; return; }
        int free = row.Field<int>("Free"); decimal mp = row.Field<decimal>("Price");
        busy = true;
        nQty.Maximum = Math.Max(1, free); nQty.Value = Math.Min(Math.Max(1, nQty.Value), free);
        nPrice.Value = Math.Min(Math.Max(mp, nPrice.Minimum), nPrice.Maximum);
        busy = false;
        Upd();
    }

    void Upd()
    {
        if (busy || Cur is not DataRow row) return;
        int free = row.Field<int>("Free"); decimal mp = row.Field<decimal>("Price");
        int qty = (int)nQty.Value; decimal price = nPrice.Value;
        decimal amount = price * qty, comm = Math.Round(amount * 0.005m, 2);
        decimal diff = mp == 0 ? 0 : (price - mp) / mp * 100;
        lblFree.Text = string.Format(T("sell.free"), free);
        lblMarket.Text = string.Format(T("sell.market"), mp.ToString("N2")) + $"  ({diff:+0.0;-0.0;0.0}%)";
        val[0].Text = amount.ToString("N2") + " BYN"; val[1].Text = comm.ToString("N2") + " BYN";
        val[2].Text = (amount - comm).ToString("N2") + " BYN"; val[2].ForeColor = cap[2].ForeColor = Ui.Red;
        bool priceOk = price >= mp * 0.3m && price <= mp * 3m;
        lblMarket.ForeColor = priceOk ? Color.Gray : Ui.Red;
        ok.Enabled = qty >= 1 && qty <= free && priceOk;
    }

    void DoSell()
    {
        if (Cur is not DataRow row) return;
        try
        {
            Trading.Sell(clientId, row.Field<int>("Id"), (int)nQty.Value, nPrice.Value);
            MessageBox.Show(string.Format(T("sell.ok"), (int)nQty.Value, nPrice.Value.ToString("N2")));
            DialogResult = DialogResult.OK;
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, T("err.title"), MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }
}

// ---------- Мои предложения: просмотр и отзыв ----------
public class OffersForm : Form
{
    readonly int clientId;
    readonly DataGridView g = Ui.Grid();

    public OffersForm(int clientId)
    {
        this.clientId = clientId;
        Dlg.Init(this, T("offers.title"), new Size(720, 400));
        g.SetBounds(20, 20, 680, 280); Controls.Add(g);
        var close = new Button { Text = T("b.Close"), Bounds = new Rectangle(20, 320, 130, 44), FlatStyle = FlatStyle.Flat, DialogResult = DialogResult.Cancel };
        var withdraw = Dlg.Primary(T("b.Withdraw"), Ui.Red, new Rectangle(440, 320, 260, 44));
        withdraw.Click += (_, _) =>
        {
            if (g.CurrentRow?.Cells["Id"].Value is not int id) return;
            try { Trading.Withdraw(id, clientId); Reload(); }
            catch (Exception ex) { MessageBox.Show(ex.Message, T("err.title")); }
        };
        Controls.AddRange(new Control[] { close, withdraw });
        CancelButton = close;
        Reload();
    }

    void Reload()
    {
        g.DataSource = Db.Table(@"SELECT l.Id, s.Symbol, s.Name, l.Quantity AS Qty, l.Price AS Price, l.CreatedAt
                                  FROM Listings l JOIN Securities s ON s.Id=l.SecurityId
                                  WHERE l.SellerClientId=@c AND l.Status=N'Активно' ORDER BY l.CreatedAt DESC", "@c", clientId);
        Ui.Headers(g);
    }
}
