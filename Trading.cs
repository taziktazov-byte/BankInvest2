using static BankInvest.Loc;

namespace BankInvest;

// Торговля: покупка по предложению, выставление на продажу, отзыв предложения.
// Все правила (комиссия 0,5 %, лимиты цены ±, свободный остаток) проверяет сервер,
// поэтому сделка из веб-версии и из приложения учитывается одинаково.
public static class Trading
{
    public static void Buy(int listingId, int buyerId, int qty) =>
        Api.Post("/trade/buy", new { listingId, qty, clientId = buyerId });

    public static void Sell(int clientId, int securityId, int qty, decimal price) =>
        Api.Post("/trade/sell", new { securityId, qty, price, clientId });

    public static void Withdraw(int listingId, int clientId) =>
        Api.Post("/trade/withdraw", new { listingId, clientId });
}

public static class Ui
{
    public static readonly Color Green = Color.FromArgb(56, 189, 150), Red = Color.FromArgb(214, 69, 65);

    public static DataGridView Grid()
    {
        var g = new DataGridView
        {
            ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false, RowHeadersVisible = false, BackgroundColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect, MultiSelect = false, EnableHeadersVisualStyles = false
        };
        g.RowTemplate.Height = 30;
        g.ColumnHeadersDefaultCellStyle.BackColor = Color.White;
        g.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        // «Продавец»-физлицо и «К рынку %» оформляются одним обработчиком
        g.CellFormatting += (_, e) =>
        {
            var name = g.Columns[e.ColumnIndex].Name;
            if (name == "Seller" && e.Value is string s && s == "Personal") { e.Value = Val("Personal"); e.FormattingApplied = true; }
            else if (name == "VsMarket" && e.Value is decimal v)
            {
                var c = v < 0 ? Color.FromArgb(34, 160, 90) : v > 0 ? Color.FromArgb(205, 60, 55) : Color.Gray; // дешевле рынка — зелёный
                e.CellStyle.ForeColor = c; e.CellStyle.SelectionForeColor = c;
                e.Value = (v > 0 ? "+" : "") + v.ToString("N2") + "%"; e.FormattingApplied = true;
            }
            else if (name == "Status" && e.Value is string st) { e.Value = Val(st); e.FormattingApplied = true; }
        };
        return g;
    }

    public static void Headers(DataGridView g)
    {
        foreach (DataGridViewColumn c in g.Columns)
        {
            c.HeaderText = Col(c.Name);
            if (c.Name is "Id" or "SecurityId") c.Visible = false;
            if (c.Name == "Price") c.DefaultCellStyle.Format = "N2";
        }
    }

    // предложения о продаже (для окна покупки и страницы бумаги); свои предложения сервер исключает
    public static DataTable Offers(int? clientId, int? securityId)
    {
        var q = "/offers?";
        if (clientId != null) q += "clientId=" + clientId + "&";
        if (securityId != null) q += "security=" + securityId;
        return Api.Table(q);
    }
}
