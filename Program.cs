using System.Data;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.SqlClient;

namespace BankInvest;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Loc.Load();
        while (true)
        {
            using var login = new LoginForm();
            if (login.ShowDialog() != DialogResult.OK) break;
            var main = new MainForm();
            Application.Run(main);
            if (!main.LoggedOut) break;
        }
    }
}

public static class Session
{
    public static string Login = "", Role = "";
    public static int? ClientId;
    public static bool IsStaff => Role != "Client";
    public static bool IsAdmin => Role == "Admin";
}

public static class Db
{
    // Измените строку подключения под свой сервер
    public const string Cs = @"Server= .;Database=BankInvest;Trusted_Connection=True;TrustServerCertificate=True";

    static SqlCommand Cmd(SqlConnection c, string sql, object?[] p)
    {
        var cmd = new SqlCommand(sql, c);
        for (int i = 0; i + 1 < p.Length; i += 2)
            cmd.Parameters.AddWithValue((string)p[i]!, p[i + 1] ?? DBNull.Value);
        return cmd;
    }

    public static DataTable Table(string sql, params object?[] p)
    {
        using var c = new SqlConnection(Cs);
        using var a = new SqlDataAdapter(Cmd(c, sql, p));
        var t = new DataTable();
        a.Fill(t);
        return t;
    }

    public static int Exec(string sql, params object?[] p)
    {
        using var c = new SqlConnection(Cs);
        c.Open();
        return Cmd(c, sql, p).ExecuteNonQuery();
    }

    public static object? Scalar(string sql, params object?[] p)
    {
        using var c = new SqlConnection(Cs);
        c.Open();
        var r = Cmd(c, sql, p).ExecuteScalar();
        return r == DBNull.Value ? null : r;
    }

    public static string Hash(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s)));

    public static void Audit(string action, string details = "")
    {
        try { Exec("INSERT AuditLog(UserLogin,Action,Details) VALUES(@u,@a,@d)", "@u", Session.Login, "@a", action, "@d", details); }
        catch { }
    }
}
