using static BankInvest.Loc;

namespace BankInvest;

// Окно входа: две отдельные вкладки (Company ID / User ID), регистрация, выбор языка под окном
public class LoginForm : Form
{
    static readonly Color Green = Color.FromArgb(0, 128, 0);
    readonly Panel card = new() { Size = new Size(460, 500), BackColor = Color.White };
    readonly Label secure = new(), titleLbl = new(), subLbl = new();
    readonly TabControl tabs = new();
    readonly TabPage tpC = new() { UseVisualStyleBackColor = false, BackColor = Color.White };
    readonly TabPage tpU = new() { UseVisualStyleBackColor = false, BackColor = Color.White };
    readonly Label lCompany = new(), lCompPass = new(), lUser = new(), lUserPass = new();
    readonly TextBox tbCompany = new(), tbCompPass = new(), tbUser = new(), tbUserPass = new();
    readonly Button btn = new(), btnReg = new();

    public LoginForm()
    {
        ClientSize = new Size(900, 640);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(46, 94, 62);
        card.Location = new Point((ClientSize.Width - card.Width) / 2, 40);
        Controls.Add(card);

        card.Controls.Add(new Label
        {
            Text = "ASB", Font = new Font("Segoe UI", 24, FontStyle.Bold), ForeColor = Color.White, BackColor = Green,
            TextAlign = ContentAlignment.MiddleCenter, Size = new Size(90, 65), Location = new Point(185, 22)
        });
        secure.SetBounds(0, 94, 460, 22); secure.TextAlign = ContentAlignment.MiddleCenter; secure.Font = new Font("Segoe UI", 8, FontStyle.Italic);
        var band = new Panel { Top = 122, Width = 460, Height = 78, BackColor = Color.FromArgb(245, 245, 245) };
        titleLbl.Dock = DockStyle.Top; titleLbl.Height = 40; titleLbl.TextAlign = ContentAlignment.BottomCenter; titleLbl.Font = new Font("Segoe UI", 15);
        subLbl.Dock = DockStyle.Fill; subLbl.TextAlign = ContentAlignment.MiddleCenter; subLbl.Font = new Font("Segoe UI", 8);
        band.Controls.Add(subLbl); band.Controls.Add(titleLbl);
        card.Controls.AddRange(new Control[] { secure, band });

        tabs.SetBounds(0, 210, 460, 150);
        tabs.SizeMode = TabSizeMode.Fixed; tabs.ItemSize = new Size(228, 30); tabs.Font = new Font("Segoe UI", 10);
        tabs.TabPages.AddRange(new[] { tpC, tpU });
        tabs.SelectedIndexChanged += (_, _) => (tabs.SelectedTab == tpC ? tbCompany : tbUser).Focus();
        AddRow(tpC, lCompany, tbCompany, 22, false); AddRow(tpC, lCompPass, tbCompPass, 68, true);
        AddRow(tpU, lUser, tbUser, 22, false); AddRow(tpU, lUserPass, tbUserPass, 68, true);
        card.Controls.Add(tabs);

        btn.SetBounds(135, 375, 190, 38); btn.BackColor = Green; btn.ForeColor = Color.White; btn.FlatStyle = FlatStyle.Flat;
        btn.Font = new Font("Segoe UI", 9, FontStyle.Bold); btn.FlatAppearance.BorderSize = 0;
        btn.Click += (_, _) => DoLogin();
        btnReg.SetBounds(135, 425, 190, 34); btnReg.FlatStyle = FlatStyle.Flat; btnReg.ForeColor = Green;
        btnReg.FlatAppearance.BorderColor = Green;
        btnReg.Click += (_, _) => OpenRegister();
        card.Controls.AddRange(new Control[] { btn, btnReg });
        AcceptButton = btn;

        // выбор языка под окном входа
        Controls.Add(new LangBar(Color.White, true, card.Width) { Left = card.Left, Top = card.Bottom + 12 });

        ApplyLang();
        Loc.Changed += ApplyLang;
        FormClosed += (_, _) => Loc.Changed -= ApplyLang;
    }

    static void AddRow(TabPage p, Label l, TextBox t, int y, bool pw)
    {
        l.SetBounds(10, y + 4, 140, 22); l.TextAlign = ContentAlignment.TopRight; l.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        t.SetBounds(160, y, 260, 26); t.UseSystemPasswordChar = pw;
        p.Controls.AddRange(new Control[] { l, t });
    }

    void ApplyLang()
    {
        Text = T("app.title");
        secure.Text = T("login.secure"); titleLbl.Text = T("login.title"); subLbl.Text = T("login.sub");
        tpC.Text = T("tab.company"); tpU.Text = T("tab.user");
        lCompany.Text = T("tab.company") + " *"; lUser.Text = T("tab.user") + " *";
        lCompPass.Text = lUserPass.Text = T("lbl.pass") + " *";
        tbCompany.PlaceholderText = T("hint.company"); tbUser.PlaceholderText = T("hint.user");
        tbCompPass.PlaceholderText = tbUserPass.PlaceholderText = T("hint.pass");
        btn.Text = T("btn.login"); btnReg.Text = T("btn.register");
    }

    void OpenRegister()
    {
        using var r = new RegisterForm();
        if (r.ShowDialog(this) == DialogResult.OK && r.NewId != null)
        {
            tabs.SelectedTab = r.NewCompany ? tpC : tpU;
            (r.NewCompany ? tbCompany : tbUser).Text = r.NewId;
        }
    }

    void DoLogin()
    {
        try
        {
            bool company = tabs.SelectedTab == tpC;
            string id = (company ? tbCompany : tbUser).Text.Trim();
            string pass = (company ? tbCompPass : tbUserPass).Text;
            var t = company
                ? Db.Table("SELECT Login,Role,ClientId,PasswordHash FROM Users WHERE CompanyId=@i AND Login=@i AND Role='Client' AND IsActive=1", "@i", id)
                : Db.Table("SELECT Login,Role,ClientId,PasswordHash FROM Users WHERE Login=@i AND CompanyId IN ('ASB','PERSONAL') AND IsActive=1", "@i", id);
            bool ok = t.Rows.Count == 1 &&
                      string.Equals((string)t.Rows[0]["PasswordHash"], Db.Hash(pass), StringComparison.OrdinalIgnoreCase);
            Session.Login = id;
            if (!ok)
            {
                Db.Audit("Неудачная попытка входа", (company ? "Company=" : "User=") + id);
                MessageBox.Show(T("login.fail"), T("err.title"), MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            Session.Role = (string)t.Rows[0]["Role"];
            Session.ClientId = t.Rows[0]["ClientId"] as int?;
            Db.Audit("Вход в систему");
            DialogResult = DialogResult.OK;
        }
        catch (Exception ex) { MessageBox.Show(T("err.db") + "\n" + ex.Message, T("err.title")); }
    }
}
