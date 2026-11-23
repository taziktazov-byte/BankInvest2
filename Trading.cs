using Microsoft.Data.SqlClient;
using static BankInvest.Loc;

namespace BankInvest;

// Торговля: покупка по предложению, выставление на продажу, отзыв предложения
public static class Trading
{
    static Exception Map(SqlException ex)
    {
        string k = ex.Message switch
        {
            "ERR_NOLISTING" => "e.nolisting", "ERR_OWN" => "e.own", "ERR_QTY" => "e.qty", "ERR_ACC" => "e.noaccount",
            "ERR_SELLERQTY" => "e.sellerqty", "ERR_FREE" => "e.free", "ERR_PRICE" => "e.price", _ => ""
        };
        return k == "" ? ex : new Exception(T(k));
    }

    public static void Buy(int listingId, int buyerId, int qty)
    {
        try { Db.Exec("EXEC usp_BuyListing @l,@b,@q", "@l", listingId, "@b", buyerId, "@q", qty); }
        catch (SqlException ex) { throw Map(ex); }
        Db.Audit("Покупка по предложению", $"Listing={listingId} x{qty}");
    }

    public static void Sell(int clientId, int securityId, int qty, decimal price)
    {
        try
        {
            Db.Exec(@"SET XACT_ABORT ON; BEGIN TRAN;
                DECLARE @acc INT = (SELECT TOP 1 Id FROM DepoAccounts WHERE ClientId=@c);
                DECLARE @have INT = ISNULL((SELECT Quantity FROM Holdings WHERE DepoAccountId=@acc AND SecurityId=@s),0);
                DECLARE @res INT = ISNULL((SELECT SUM(Quantity) FROM Listings WHERE SellerClientId=@c AND SecurityId=@s AND Status=N'Активно'),0);
                DECLARE @mp DECIMAL(18,2) = (SELECT Price FROM Securities WHERE Id=@s);
                IF @q <= 0 OR @q > @have - @res BEGIN ROLLBACK; RAISERROR(N'ERR_FREE',16,1); RETURN; END
                IF @p <= 0 OR @p < @mp*0.3 OR @p > @mp*3 BEGIN ROLLBACK; RAISERROR(N'ERR_PRICE',16,1); RETURN; END
                INSERT Listings(SellerClientId,SecurityId,Quantity,Price) VALUES(@c,@s,@q,@p);
                COMMIT;", "@c", clientId, "@s", securityId, "@q", qty, "@p", Math.Round(price, 2));
        }
        catch (SqlException ex) { throw Map(ex); }
        Db.Audit("Выставлено на продажу", $"Security={securityId} x{qty} @ {price}");
    }

    public static void Withdraw(int listingId, int clientId)
    {
        Db.Exec("UPDATE Listings SET Status=N'Отозвано' WHERE Id=@i AND SellerClientId=@c AND Status=N'Активно'", "@i", listingId, "@c", clientId);
        Db.Audit("Предложение отозвано", "Id=" + listingId);
    }
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

    // предложения о продаже (для окна покупки и страницы бумаги); исключаем собственные предложения клиента
    public const string OffersSql = @"SELECT l.Id, l.SecurityId, s.Symbol, s.Name,
           CASE WHEN c.Kind='Personal' THEN N'Personal' ELSE c.Name END AS Seller,
           l.Quantity AS Available, l.Price AS Price,
           CAST((l.Price - s.Price) * 100.0 / NULLIF(s.Price,0) AS DECIMAL(9,2)) AS VsMarket
        FROM Listings l JOIN Securities s ON s.Id=l.SecurityId JOIN Clients c ON c.Id=l.SellerClientId
        WHERE l.Status=N'Активно' AND l.Quantity>0 AND (@c IS NULL OR l.SellerClientId<>@c) AND (@s IS NULL OR l.SecurityId=@s)
        ORDER BY s.Symbol, l.Price";
}
