using static BankInvest.Loc;

namespace BankInvest;

// Окно появляется, если приложение не может связаться с сервером:
// показывает адрес, объясняет, что сервер нужно запустить, и позволяет его изменить.
public class ServerForm : Form
{
    readonly TextBox url = new() { Left = 15, Top = 34, Width = 420 };
    readonly Label status = new() { Left = 15, Top = 68, Width = 420, Height = 78, ForeColor = Color.Firebrick };
    readonly Button ok = new() { Text = "OK", Left = 255, Top = 156, Width = 85, DialogResult = DialogResult.OK };
    readonly Button cancel = new() { Text = "Отмена", Left = 350, Top = 156, Width = 85, DialogResult = DialogResult.Cancel };

    public ServerForm(string error)
    {
        Text = T("srv.title");
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; MinimizeBox = false;
        ClientSize = new Size(450, 200);
        Font = new Font("Segoe UI", 9.5f);

        Controls.Add(new Label { Text = T("srv.url"), Left = 15, Top = 12, AutoSize = true, Font = new Font("Segoe UI", 9, FontStyle.Bold) });
        url.Text = Api.BaseUrl;
        status.Text = T("srv.fail") + "\n" + error + "\n\n" + T("srv.hint");
        Controls.AddRange(new Control[] { url, status, ok, cancel });
        AcceptButton = ok; CancelButton = cancel;
        ok.Click += (_, _) => Api.SetBaseUrl(url.Text);
    }
}
