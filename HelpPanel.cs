using static BankInvest.Loc;

namespace BankInvest;

// Помощь: слева список разделов, справа страница с описанием, внизу кнопки «Назад / Далее»
public class HelpPanel : Panel
{
    readonly ListBox list = new() { Dock = DockStyle.Left, Width = 330, BorderStyle = BorderStyle.None, Font = new Font("Segoe UI", 13), DrawMode = DrawMode.OwnerDrawFixed, ItemHeight = 46, BackColor = Color.FromArgb(244, 248, 251), IntegralHeight = false };
    readonly Label pageTitle = new() { Dock = DockStyle.Top, Height = 84, Font = new Font("Segoe UI", 24, FontStyle.Bold), ForeColor = Color.FromArgb(70, 100, 130), TextAlign = ContentAlignment.MiddleLeft };
    readonly RichTextBox body = new() { Dock = DockStyle.Fill, ReadOnly = true, BorderStyle = BorderStyle.None, BackColor = Color.White, Font = new Font("Segoe UI", 15), ScrollBars = RichTextBoxScrollBars.Vertical, TabStop = false };
    readonly Label pageNo = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.Gray };
    readonly Button prev = new() { Dock = DockStyle.Left, Width = 190, Font = new Font("Segoe UI", 12), FlatStyle = FlatStyle.Flat, BackColor = Color.White };
    readonly Button next = new() { Dock = DockStyle.Right, Width = 190, Font = new Font("Segoe UI", 12), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(56, 189, 150), ForeColor = Color.White };
    List<(string title, string body)> topics = new();
    int idx;
    bool busy;

    public HelpPanel()
    {
        Dock = DockStyle.Fill; BackColor = Color.White;
        var content = new Panel { Dock = DockStyle.Fill, Padding = new Padding(40, 10, 40, 10) };
        var bar = new Panel { Dock = DockStyle.Bottom, Height = 72 };
        bar.Controls.AddRange(new Control[] { pageNo, prev, next });
        pageNo.BringToFront();
        content.Controls.AddRange(new Control[] { body, bar, pageTitle });
        body.BringToFront();
        Controls.AddRange(new Control[] { content, list });
        content.BringToFront();

        list.DrawItem += (_, e) =>
        {
            if (e.Index < 0) return;
            e.DrawBackground();
            var fg = (e.State & DrawItemState.Selected) != 0 ? Color.White : Color.Black;
            TextRenderer.DrawText(e.Graphics, list.Items[e.Index].ToString(), list.Font,
                new Rectangle(e.Bounds.X + 8, e.Bounds.Y, e.Bounds.Width - 12, e.Bounds.Height), fg, TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        };
        list.SelectedIndexChanged += (_, _) => { if (!busy && list.SelectedIndex >= 0) { idx = list.SelectedIndex; ShowPage(); } };
        prev.Click += (_, _) => { if (idx > 0) { idx--; ShowPage(); } };
        next.Click += (_, _) => { if (idx < topics.Count - 1) { idx++; ShowPage(); } };
    }

    public void Reload()
    {
        topics = Session.IsStaff
            ? new() { ("m.Home", "h.Home"), ("h.stockTitle", "h.Stock"), ("m.Clients", "h.Clients"), ("m.Projects", "h.Projects"), ("m.Portfolio", "h.Portfolio"), ("m.Transactions", "h.Transactions"), ("m.Reports", "h.Reports") }
            : new() { ("m.Home", "h.Home"), ("h.stockTitle", "h.Stock"), ("m.MyPortfolio", "h.MyPortfolio"), ("m.History", "h.History"), ("m.Profile", "h.Profile") };
        if (Session.IsAdmin) topics.Add(("m.Admin", "h.Admin"));
        topics.Add(("h.generalTitle", "h.General"));
        idx = Math.Clamp(idx, 0, topics.Count - 1);

        busy = true;
        list.Items.Clear();
        for (int i = 0; i < topics.Count; i++) list.Items.Add($" {i + 1}.  {T(topics[i].title)}");
        busy = false;
        ShowPage();
    }

    void ShowPage()
    {
        busy = true; list.SelectedIndex = idx; busy = false;
        pageTitle.Text = T(topics[idx].title);
        body.Text = T(topics[idx].body);
        pageNo.Text = string.Format(T("h.page"), idx + 1, topics.Count);
        prev.Text = "◀  " + T("h.prev"); next.Text = T("h.next") + "  ▶";
        prev.Enabled = idx > 0; next.Enabled = idx < topics.Count - 1;
    }
}
