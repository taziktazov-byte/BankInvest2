using System.Drawing.Drawing2D;
using static BankInvest.Loc;

namespace BankInvest;

// График цены, нарисованный средствами GDI+ (без сторонних библиотек): сетка, область под линией, подсказка при наведении
public class PriceChart : Control
{
    static readonly Color Up = Color.FromArgb(34, 160, 90), Down = Color.FromArgb(205, 60, 55);
    List<(DateTime t, decimal p)> pts = new();
    string axisFmt = "dd.MM", tipFmt = "dd.MM.yyyy";
    int hover = -1;
    decimal lo, hi;

    public PriceChart()
    {
        DoubleBuffered = true; ResizeRedraw = true; BackColor = Color.White; Font = new Font("Segoe UI", 9);
    }

    public void SetData(List<(DateTime t, decimal p)> data, string axis, string tip)
    {
        pts = data; axisFmt = axis; tipFmt = tip; hover = -1; Invalidate();
    }

    RectangleF Plot => new(72, 16, Math.Max(20, Width - 72 - 26), Math.Max(20, Height - 16 - 36));

    float X(int i, RectangleF r)
    {
        if (pts.Count == 1) return r.Left + r.Width / 2;
        double t0 = pts[0].t.Ticks, t1 = pts[^1].t.Ticks;
        return r.Left + (float)((pts[i].t.Ticks - t0) / (t1 - t0) * r.Width);
    }

    float Y(decimal p, RectangleF r) => r.Bottom - (float)((p - lo) / (hi - lo)) * r.Height;

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(BackColor);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        if (pts.Count == 0)
        {
            TextRenderer.DrawText(g, T("s.nodata"), Font, ClientRectangle, Color.Gray, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            return;
        }
        var r = Plot;
        decimal mn = pts.Min(x => x.p), mx = pts.Max(x => x.p);
        decimal pad = (mx - mn) * 0.12m;
        if (pad == 0) pad = Math.Max(0.01m, mx * 0.01m);
        lo = mn - pad; hi = mx + pad;
        var color = pts[^1].p >= pts[0].p ? Up : Down;

        using var gridPen = new Pen(Color.FromArgb(232, 237, 242));
        using var txt = new SolidBrush(Color.Gray);
        for (int i = 0; i <= 4; i++)                                     // горизонтальная сетка и подписи цены
        {
            float y = r.Top + r.Height * i / 4f;
            g.DrawLine(gridPen, r.Left, y, r.Right, y);
            string s = (hi - (hi - lo) * i / 4).ToString("N2");
            var sz = g.MeasureString(s, Font);
            g.DrawString(s, Font, txt, r.Left - sz.Width - 6, y - sz.Height / 2);
        }
        int n = pts.Count, ticks = Math.Min(6, n);
        for (int k = 0; k < ticks; k++)                                  // подписи времени
        {
            int i = ticks == 1 ? 0 : (int)Math.Round(k * (n - 1) / (double)(ticks - 1));
            float x = X(i, r);
            string s = pts[i].t.ToString(axisFmt);
            var sz = g.MeasureString(s, Font);
            float tx = Math.Max(0, Math.Min(x - sz.Width / 2, Width - sz.Width));
            g.DrawLine(gridPen, x, r.Bottom, x, r.Bottom + 4);
            g.DrawString(s, Font, txt, tx, r.Bottom + 6);
        }

        var arr = new PointF[n];
        for (int i = 0; i < n; i++) arr[i] = new PointF(X(i, r), Y(pts[i].p, r));
        if (n > 1)
        {
            var poly = new List<PointF>(arr) { new PointF(arr[^1].X, r.Bottom), new PointF(arr[0].X, r.Bottom) };
            using var fill = new LinearGradientBrush(r, Color.FromArgb(70, color), Color.FromArgb(4, color), 90f);
            g.FillPolygon(fill, poly.ToArray());
            using var line = new Pen(color, 2f) { LineJoin = LineJoin.Round };
            g.DrawLines(line, arr);
        }
        if (n <= 40)                                                     // маркеры, когда точек немного
        {
            using var mb = new SolidBrush(Color.White); using var mp = new Pen(color, 1.5f);
            foreach (var p in arr) { g.FillEllipse(mb, p.X - 3, p.Y - 3, 6, 6); g.DrawEllipse(mp, p.X - 3, p.Y - 3, 6, 6); }
        }

        if (hover >= 0 && hover < n)                                     // подсказка
        {
            var p = arr[hover];
            using var dash = new Pen(Color.FromArgb(150, 130, 130, 130)) { DashStyle = DashStyle.Dash };
            g.DrawLine(dash, p.X, r.Top, p.X, r.Bottom);
            using var dot = new SolidBrush(color);
            g.FillEllipse(dot, p.X - 5, p.Y - 5, 10, 10);
            string tip = pts[hover].t.ToString(tipFmt) + "\n" + pts[hover].p.ToString("N2") + " BYN";
            var sz = g.MeasureString(tip, Font);
            float bx = Math.Max(r.Left, Math.Min(p.X + 12, Width - sz.Width - 16));
            float by = Math.Max(r.Top, Math.Min(p.Y - sz.Height - 10, r.Bottom - sz.Height - 8));
            using var bg = new SolidBrush(Color.FromArgb(230, 40, 55, 71));
            g.FillRectangle(bg, bx, by, sz.Width + 8, sz.Height + 6);
            g.DrawString(tip, Font, Brushes.White, bx + 4, by + 3);
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (pts.Count == 0) return;
        var r = Plot; int best = -1; float bd = float.MaxValue;
        for (int i = 0; i < pts.Count; i++) { float d = Math.Abs(X(i, r) - e.X); if (d < bd) { bd = d; best = i; } }
        if (best != hover) { hover = best; Invalidate(); }
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        if (hover != -1) { hover = -1; Invalidate(); }
    }
}
