using System.Text.RegularExpressions;
using static BankInvest.Loc;

namespace BankInvest;

// Регистрация: предприятие (Company ID = УНП) или личное пользование (User ID = логин)
public class RegisterForm : Form
{
    static readonly Color Green = Color.FromArgb(0, 128, 0);
    public string? NewId;
    public bool NewCompany;

    class Row { public string Key = ""; public Func<string> Text = () => ""; public int Mode; public bool Req, Pw; public Label L = new(); public TextBox T = new(); }

    readonly Panel card = new() { BackColor = Color.White };
    readonly Label title = new(), typeLbl = new();
    readonly RadioButton rbC = new() { Checked = true, AutoSize = true }, rbP = new() { AutoSize = true };
    readonly List<Row> rows = new();
    readonly Button btnOk = new(), btnBack = new();

    public RegisterForm()
    {
        ClientSize = new Size(560, 700);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; MinimizeBox = false;
        BackColor = Color.FromArgb(46, 94, 62);
        card.SetBounds(40, 20, 480, 620);
        Controls.Add(card);

        title.SetBounds(0, 15, 480, 40); title.TextAlign = ContentAlignment.MiddleCenter; title.Font = new Font("Segoe UI", 16);
        typeLbl.SetBounds(30, 65, 420, 20); typeLbl.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        rbC.Location = new Point(30, 90); rbP.Location = new Point(30, 115);
        rbC.CheckedChanged += (_, _) => { ApplyLang(); LayoutRows(); };
        card.Controls.AddRange(new Control[] { title, typeLbl, rbC, rbP });

        AddRow("name", () => T(rbC.Checked ? "reg.cname" : "reg.pname"), 0, true, false);
        AddRow("unp", () => T("reg.unp"), 1, true, false);
        AddRow("login", () => T("reg.login"), 2, true, false);
        AddRow("addr", () => T("reg.address"), 0, false, false);
        AddRow("contacts", () => T("reg.contacts"), 0, false, false);
        AddRow("pass", () => T("reg.pass"), 0, true, true);
        AddRow("pass2", () => T("reg.pass2"), 0, true, true);

        btnOk.Size = new Size(190, 38); btnOk.BackColor = Green; btnOk.ForeColor = Color.White; btnOk.FlatStyle = FlatStyle.Flat;
        btnOk.FlatAppearance.BorderSize = 0; btnOk.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        btnOk.Click += (_, _) => Submit();
        btnBack.Size = new Size(110, 38); btnBack.FlatStyle = FlatStyle.Flat; btnBack.DialogResult = DialogResult.Cancel;
        card.Controls.AddRange(new Control[] { btnOk, btnBack });
        AcceptButton = btnOk; CancelButton = btnBack;

        // выбор языка под окном регистрации
        Controls.Add(new LangBar(Color.White, true, card.Width) { Left = card.Left, Top = card.Bottom + 12 });

        ApplyLang(); LayoutRows();
        Loc.Changed += OnLang;
        FormClosed += (_, _) => Loc.Changed -= OnLang;
    }

    void OnLang() { ApplyLang(); LayoutRows(); }

    void AddRow(string key, Func<string> text, int mode, bool req, bool pw)
    {
        var r = new Row { Key = key, Text = text, Mode = mode, Req = req, Pw = pw };
        r.L.Left = 30; r.L.Width = 420; r.L.Height = 18; r.L.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        r.T.Left = 30; r.T.Width = 420; r.T.UseSystemPasswordChar = pw;
        card.Controls.AddRange(new Control[] { r.L, r.T });
        rows.Add(r);
    }

    void ApplyLang()
    {
        Text = T("reg.title"); title.Text = T("reg.title"); typeLbl.Text = T("reg.type");
        rbC.Text = T("reg.company"); rbP.Text = T("reg.personal");
        foreach (var r in rows) r.L.Text = r.Text() + (r.Req ? " *" : "");
        btnOk.Text = T("reg.submit"); btnBack.Text = T("reg.back");
    }

    void LayoutRows()
    {
        int y = 155;
        foreach (var r in rows)
        {
            bool vis = r.Mode == 0 || (r.Mode == 1) == rbC.Checked;
            r.L.Visible = r.T.Visible = vis;
            if (vis) { r.L.Top = y; r.T.Top = y + 20; y += 56; }
        }
        btnOk.SetBounds(60, y + 15, 190, 38); btnBack.SetBounds(270, y + 15, 110, 38);
    }

    string V(string key) => rows.First(r => r.Key == key).T.Text.Trim();

    void Submit()
    {
        try
        {
            bool comp = rbC.Checked;
            string name = V("name"), addr = V("addr"), contacts = V("contacts");
            string pass = rows.First(r => r.Key == "pass").T.Text, pass2 = rows.First(r => r.Key == "pass2").T.Text;
            if (name == "" || pass == "") throw new Exception(T("reg.e.empty"));
            if (pass != pass2 || pass.Length < 6) throw new Exception(T("reg.e.pass"));

            // Проверки (УНП, уникальность, длина логина) выполняет сервер — правила одинаковы для веб и десктопа
            var body = new Dictionary<string, object>
            {
                ["kind"] = comp ? "company" : "personal",
                ["name"] = name, ["address"] = addr, ["contacts"] = contacts,
                ["password"] = pass, ["password2"] = pass2,
            };
            if (comp)
            {
                string unp = V("unp");
                if (!Regex.IsMatch(unp, @"^\d{9}$")) throw new Exception(T("reg.e.unp"));
                body["unp"] = unp;
            }
            else
            {
                string login = V("login");
                if (login == "") throw new Exception(T("reg.e.empty"));
                if (login.Length < 3) throw new Exception(T("reg.e.login"));
                body["login"] = login;
            }

            var res = Api.Post("/auth/register", body);
            NewId = res["login"]?.ToString();
            NewCompany = comp;
            MessageBox.Show(T("reg.ok"));
            DialogResult = DialogResult.OK;
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, T("err.title"), MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }
}
