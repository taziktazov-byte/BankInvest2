namespace BankInvest;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Loc.Load();

        // Перед входом проверяем связь с сервером: он — общий источник данных
        // для этой (десктопной) и веб-версии.
        if (!EnsureServer()) return;

        while (true)
        {
            // Как и в веб-версии: если сессия сохранена — входим без окна пароля.
            bool restored = false;
            try { restored = Api.TryRestore(); } catch { }

            if (!restored)
            {
                using var login = new LoginForm();
                if (login.ShowDialog() != DialogResult.OK) break;
            }

            var main = new MainForm();
            Application.Run(main);
            if (main.LoggedOut) { Api.Logout(); continue; }
            Api.Logout();
            break;
        }
    }

    static bool EnsureServer()
    {
        while (true)
        {
            try
            {
                Api.Ping();
                return true;
            }
            catch (Exception ex)
            {
                using var dlg = new ServerForm(ex.Message);
                var r = dlg.ShowDialog();
                if (r != DialogResult.OK) return false;
            }
        }
    }
}

public static class Session
{
    public static string Login = "", Role = "", ClientName = "";
    public static int? ClientId;
    public static bool IsStaff => Role != "Client";
    public static bool IsAdmin => Role == "Admin";

    public static void Reset() { Login = ""; Role = ""; ClientName = ""; ClientId = null; }
}
