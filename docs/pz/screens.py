#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Снимки экранов веб-приложения BankInvest для пояснительной записки.

Зачем свой рендерер. Скриншоты нужны настоящие — с того же интерфейса, что
отдаёт server/web. Запустить браузер в среде подготовки документа нельзя
(в песочнице Chromium не выводит кадр), поэтому экраны собираются здесь:
* данные — ровно из db/seed.sql (клиенты, бумаги, портфели, предложения, сделки);
* тексты — из server/src/i18n.json (те же строки, что видит пользователь);
* вёрстка и цвета — из server/web/styles.css (те же #283747, #38bd96 и т. д.).

Каждый экран — SVG, который затем превращается в PNG тем же конвейером,
что и диаграммы (svglib → PDF → pymupdf), см. svg2png.py.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
I18N = json.load(open(os.path.join(ROOT, "server", "src", "i18n.json"), encoding="utf-8"))

# ---------------------------------------------------------------- палитра styles.css
GREEN = "#38bd96"
GREEN_D = "#2aa281"
DARK = "#283747"
DARK2 = "#33475c"
BG = "#f0f4f8"
TOP = "#f4f8fb"
LINE = "#e3eaf1"
TEXT = "#1f2a37"
MUTED = "#7a8794"
UP = "#22a05a"
DOWN = "#cd3c37"
RED = "#d64541"
BLUE = "#4682b4"
ORANGE = "#ff8c00"
PURPLE = "#9370db"
WHITE = "#ffffff"
FONT = "Arial, Helvetica, sans-serif"
PAD = 12                  # горизонтальный отступ в ячейках таблиц, как в styles.css
MONO_FONT = "Arial, Helvetica, sans-serif"
PAD = 12                  # горизонтальный отступ в ячейках таблиц, как в styles.css

W, H = 1500, 950          # размер окна браузера, как в боевом режиме


def _reg_fonts():
    """Регистрирует DejaVu под именем Arial — тот же приём, что в svg2png.py."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    for name, file in (("Arial", "DejaVuSans.ttf"), ("Arial-Bold", "DejaVuSans-Bold.ttf")):
        try:
            pdfmetrics.registerFont(TTFont(name, os.path.join("/usr/share/fonts/truetype/dejavu", file)))
        except Exception:                                    # noqa: BLE001
            pass


_reg_fonts()


def tw(s, size=14, bold=False):
    """Ширина строки в пикселях — по метрикам шрифта, а не на глаз."""
    from reportlab.pdfbase import pdfmetrics
    try:
        return pdfmetrics.stringWidth(str(s), "Arial-Bold" if bold else "Arial", size)
    except Exception:                                        # noqa: BLE001
        return len(str(s)) * size * 0.58


def fit_size(s, size, max_w, bold=False, min_size=8.5):
    """Уменьшает кегль, пока строка не влезет в max_w."""
    while size > min_size and tw(s, size, bold) > max_w:
        size -= 0.5
    return size


def ellipsis(s, size, max_w, bold=False):
    """Обрезает строку с многоточием по фактической ширине."""
    if tw(s, size, bold) <= max_w:
        return s
    out = str(s)
    while out and tw(out + "…", size, bold) > max_w:
        out = out[:-1]
    return out.rstrip() + "…"


def T(key, lang=0):
    v = I18N.get(key)
    if v is None:
        return key
    return v[lang] if isinstance(v, list) else v


def nf(v, d=2):
    """Число в русской записи: 1 234,56"""
    s = f"{abs(float(v)):,.{d}f}".replace(",", "\u00a0").replace(".", ",")
    return ("-" if float(v) < 0 else "") + s


def money(v, d=2):
    return nf(v, d) + "\u00a0BYN"


def pct(v):
    return ("+" if float(v) > 0 else "") + nf(v) + "%"


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


class Ui:
    """Минимальный SVG-холст с примитивами интерфейса."""

    def __init__(self, w=W, h=H):
        self.w, self.h = w, h
        self.p = []

    # ---------- примитивы ----------
    def add(self, s):
        self.p.append(s)

    def rect(self, x, y, w, h, fill=WHITE, stroke="none", sw=1, rx=0, op=1):
        o = f' fill-opacity="{op}"' if op != 1 else ""
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke != "none" else ""
        if rx > h / 2:                    # svglib иначе рисует эллипс
            rx = h / 2
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" '
                 f'fill="{fill}"{st}{o}/>')

    def line(self, x1, y1, x2, y2, stroke=LINE, sw=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def text(self, x, y, s, size=14, anchor="start", bold=False, italic=False,
             fill=TEXT, family=FONT, opacity=1):
        # в DejaVu нет части пиктограмм — заменяем на визуально близкие
        s = str(s).translate(str.maketrans({"⤓": "⇩", "＋": "✚", "👥": "▤",
                                            "📈": "◆", "💼": "▪", "📊": "≡"}))
        b = ' font-weight="700"' if bold else (' font-weight="600"' if bold == "600" else "")
        i = ' font-style="italic"' if italic else ""
        o = f' fill-opacity="{opacity}"' if opacity != 1 else ""
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" '
                 f'text-anchor="{anchor}" fill="{fill}"{b}{i}{o}>{esc(s)}</text>')

    def circle(self, cx, cy, r, fill=WHITE, stroke="none", sw=1, op=1):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke != "none" else ""
        o = f' fill-opacity="{op}"' if op != 1 else ""
        self.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}"{st}{o}/>')

    def poly(self, pts, fill=WHITE, stroke="none", sw=1):
        p = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke != "none" else ""
        self.add(f'<polygon points="{p}" fill="{fill}"{st}/>')

    def path(self, d, fill="none", stroke=TEXT, sw=1, dash=None):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '
                 f'stroke-linejoin="round"{da}/>')

    def clip_rect(self, x, y, w, h, id_):
        self.add(f'<clipPath id="{id_}"><rect x="{x}" y="{y}" width="{w}" height="{h}"/></clipPath>')

    # ---------- элементы интерфейса ----------
    def button(self, x, y, label, w=None, kind="plain", h=34, size=14, icon=""):
        txt = (icon + " " if icon else "") + label
        w = w or (tw(txt, size) + 28)
        fill, stroke, color, bold = WHITE, "#cfd8e3", TEXT, False
        if kind == "primary":
            fill, stroke, color, bold = GREEN, GREEN, WHITE, True
        elif kind == "danger":
            fill, stroke, color, bold = RED, RED, WHITE, True
        self.rect(x, y, w, h, fill=fill, stroke=stroke, rx=4)
        self.text(x + w / 2, y + h / 2 + size * 0.36, txt, size=size, anchor="middle",
                  fill=color, bold=bold)
        return w

    def field(self, x, y, label, value, w, h=36, hint="", req=False, focus=False):
        self.text(x, y, label, size=12.5, fill="#41505f", bold=True)
        if req:
            self.text(x + tw(label, 12.5, True) + 4, y, "*", size=12.5, fill=RED, bold=True)
        self.rect(x, y + 7, w, h, fill=WHITE, stroke="#cfd8e3", rx=4)
        self.text(x + 10, y + 7 + h / 2 + 5, value, size=14, fill=TEXT)
        if hint:
            self.text(x, y + 7 + h + 16, hint, size=12, fill=MUTED)
        return y + 7 + h + (18 if hint else 0)

    def pill(self, x, y, label, ok=True, h=22):
        w = len(label) * 6.9 + 18
        self.rect(x, y, w, h, fill="#e5f6ee" if ok else "#eef3f8", rx=999)
        self.text(x + w / 2, y + h / 2 + 4.4, label, size=12, anchor="middle",
                  fill="#1c7d4f" if ok else "#41505f")
        return w

    def table(self, x, y, cols, rows, widths, row_h=34, head_h=38, size=13.5,
              aligns=None, cell=None, header_fill="#f7fafc", clip_from=None,
              head_size=12.5, head_fit=True):
        """cols — подписи графов, rows — список списков ячеек.

        cell(i, j, value, cx, cy) может отрисовать ячейку сама (возвращает True).
        """
        aligns = aligns or ["start"] * len(cols)
        total_w = sum(widths)
        # подпись графы, не влезающая в ширину, переносим на две строки
        split = []
        max_lines = 1
        for j, c in enumerate(cols):
            words = str(c).split()
            if head_fit and tw(c, head_size, True) > widths[j] - 2 * PAD and len(words) > 1:
                best, best_w = None, 1e9
                for k in range(1, len(words)):
                    a, b = " ".join(words[:k]), " ".join(words[k:])
                    wmax = max(tw(a, head_size, True), tw(b, head_size, True))
                    if wmax < best_w:
                        best, best_w = (a, b), wmax
                split.append(best)
                max_lines = max(max_lines, 2)
            else:
                split.append(None)
        if max_lines == 2:
            head_h = max(head_h, head_size * 2 + 22)
        self.rect(x, y, total_w, head_h, fill=header_fill)
        self.line(x, y + head_h, x + total_w, y + head_h, stroke=LINE)
        cx = x
        for j, c in enumerate(cols):
            tx = cx + PAD
            anchor = "start"
            if aligns[j] == "num":
                tx, anchor = cx + widths[j] - PAD, "end"
            if split[j]:
                a, b = split[j]
                self.text(tx, y + head_h / 2 - 3, a, size=head_size, anchor=anchor,
                          fill="#3c4a58", bold=True)
                self.text(tx, y + head_h / 2 + head_size + 1, b, size=head_size,
                          anchor=anchor, fill="#3c4a58", bold=True)
            else:
                self.text(tx, y + head_h / 2 + 4.6, c, size=head_size, anchor=anchor,
                          fill="#3c4a58", bold=True)
            cx += widths[j]
        yy = y + head_h
        for i, r in enumerate(rows):
            self.line(x, yy, x + total_w, yy, stroke="#f0f4f8")
            cx = x
            for j, v in enumerate(r):
                tx = cx + PAD
                anchor = "start"
                if aligns[j] == "num":
                    tx, anchor = cx + widths[j] - PAD, "end"
                drawn = cell(i, j, v, cx, yy, widths[j]) if cell else False
                if not drawn:
                    self.text(tx, yy + row_h / 2 + 4.4, v, size=size,
                              anchor=anchor, fill=TEXT)
                cx += widths[j]
            yy += row_h
        self.line(x, yy, x + total_w, yy, stroke=LINE)
        return yy

    # ---------- каркас приложения ----------
    def langbar(self, x, y, dark=True, size=13, max_w=None):
        """Языковая строка: при нехватке места кегль уменьшается."""
        names = ["Русский", "English", "Беларуская"]
        label = T("lang.label")
        need = tw(label, size) + 10 + sum(tw(n, size) + 12 for n in names)
        if max_w and need > max_w:
            size = fit_size("Язык: " + " ".join(names), size, max_w - 40, min_size=9)
        self.text(x, y, label, size=size, fill=WHITE if dark else "#45525f", opacity=0.85)
        cx = x + tw(label, size) + 10
        for i, name in enumerate(names):
            active = i == 0
            self.text(cx, y, name, size=size, bold=active,
                      fill=WHITE if dark else "#45525f")
            if active:
                self.line(cx, y + 4, cx + tw(name, size, True), y + 4,
                          stroke=WHITE if dark else "#45525f", sw=1.2)
            cx += tw(name, size, True) + 12

    def shell(self, menu, active, title, crumbs, user, role, admin=False):
        """Боковое меню + верхняя панель. Возвращает y начала области действий."""
        self.rect(0, 0, self.w, self.h, fill=BG)
        # --- меню
        self.rect(0, 0, 230, self.h, fill=DARK)
        self.text(18, 40, "БЕЛАРУСБАНК", size=14, bold=True, fill=WHITE)
        y = 62
        for label, ico in menu:
            on = label == active
            if on:
                self.rect(8, y, 214, 42, fill=GREEN, rx=3)
            self.text(24, y + 27, ico, size=14, fill="#10241c" if on else WHITE, opacity=0.9)
            self.text(50, y + 27, ellipsis(label, 14, 158, on), size=14,
                      fill="#10241c" if on else WHITE, bold=on)
            y += 44
        y += 6
        self.text(24, y + 22, "⎋", size=14, fill="#e98a86", opacity=0.9)
        self.text(50, y + 22, T("m.Logout"), size=14, fill="#e98a86")
        self.langbar(14, self.h - 46, dark=True, size=12, max_w=210)
        self.text(14, self.h - 18, f"{user} · {role}", size=11,
                  fill=WHITE, opacity=0.45)
        # --- верхняя панель
        self.rect(230, 0, self.w - 230, 88, fill=TOP)
        self.line(230, 88, self.w, 88, stroke=LINE)
        self.text(250, 26, crumbs, size=12, fill=MUTED)
        self.text(250, 62, title, size=fit_size(title, 22, self.w - 600, True),
                  bold=True, fill="#6e8caa")
        # индикатор живого соединения + учётная запись
        chip = f"{user} · {role}"
        cw = tw(chip, 12.5) + 58
        cx = self.w - 20 - cw
        self.rect(cx, 44, cw, 32, fill=WHITE, stroke=LINE, rx=999)
        self.circle(cx + 18, 60, 4, fill=GREEN)
        self.circle(cx + 18, 60, 7, fill=GREEN, op=0.2)
        self.text(cx + 32, 65, chip, size=12.5, fill="#4b5a68")
        self.text(cx + cw - 22, 65, "⟳", size=14, fill=MUTED)
        return 88

    def actions_bar(self, y, buttons):
        """buttons: список (label, kind, icon). Возвращает высоту панели (0 если нет кнопок)."""
        if not buttons:
            return 0
        self.rect(230, y, self.w - 230, 54, fill=WHITE)
        self.line(230, y + 54, self.w, y + 54, stroke=LINE)
        x = 250
        for label, kind, icon in buttons:
            x += self.button(x, y + 10, label, kind=kind, icon=icon) + 8
        return 54


# ---------------------------------------------------------------- данные экранов
CLIENTS = [
    ("ООО «Альфа»", "100200300", "г. Минск, ул. Мясникова 1", "+375 17 000-00-00", "Активен", "Предприятие"),
    ("ООО «Вектор Плюс»", "100234567", "г. Минск, ул. Тимирязева 65Б", "+375 17 234-56-78", "Активен", "Предприятие"),
    ("ООО «БелТехСервис»", "190456789", "г. Минск, пр. Независимости 58", "+375 29 111-22-33", "Активен", "Предприятие"),
    ("ЗАО «Полесье-Агро»", "291234567", "г. Брест, ул. Советская 14", "+375 33 222-33-44", "Активен", "Предприятие"),
    ("ОАО «МинскСтройИнвест»", "100987654", "г. Минск, ул. Ленина 3", "+375 17 333-44-55", "Активен", "Предприятие"),
    ("ИП Козлов А. В.", "590123456", "г. Гродно, ул. Горького 21", "+375 29 444-55-66", "Активен", "Предприятие"),
    ("ООО «ГомельЛогистик»", "490765432", "г. Гомель, ул. Рогачёвская 9", "+375 44 555-66-77", "Активен", "Предприятие"),
    ("ЧУП «Витебск-Текстиль»", "390654321", "г. Витебск, пр. Фрунзе 40", "+375 29 666-77-88", "Активен", "Предприятие"),
    ("ООО «СмартФинанс»", "191345678", "г. Минск, ул. Притыцкого 62", "+375 25 777-88-99", "Активен", "Предприятие"),
    ("Иванов Сергей Петрович", "900000001", "г. Минск, ул. Берута 11-45", "+375 29 100-10-10", "Активен", "Физлицо"),
    ("Петрова Анна Игоревна", "900000002", "г. Могилёв, ул. Первомайская 5-12", "+375 33 200-20-20", "Активен", "Физлицо"),
    ("Сидоров Максим Олегович", "900000003", "г. Брест, ул. Московская 77-3", "+375 44 300-30-30", "Активен", "Физлицо"),
]

SEC = {}


def _load_securities():
    raw = [
        ("BYN-GB1", "Облигации Минфина", "Министерство финансов РБ", "Облигация", "Gov Bonds", 100, 100000, 12.5, 0.20, "Размещён", 101.20, 100.40),
        ("AGPB-B2", "Облигации Белагропромбанка", "ОАО «Белагропромбанк»", "Облигация", "Corp Bonds", 50, 50000, 14.0, 0.35, "Размещён", 49.60, 50.30),
        ("AGPB-S", "Акции Белагропромбанка", "ОАО «Белагропромбанк»", "Акция", "Equity", 10, 200000, 0, 0.50, "Размещён", 12.40, 11.60),
        ("BYN-GB2", "Облигации Минфина II", "Министерство финансов РБ", "Облигация", "Gov Bonds", 100, 80000, 13.0, 0.20, "Зарегистрирован", 100.00, 100.00),
        ("BNH-B1", "Облигации Белнефтехим-Инвест", "ОАО «Белнефтехим-Инвест»", "Облигация", "Corp Bonds", 100, 60000, 13.50, 0.30, "Размещён", 102.30, 100.80),
        ("MSI-B2", "Облигации МинскСтройИнвест", "ОАО «МинскСтройИнвест»", "Облигация", "Corp Bonds", 50, 40000, 14.20, 0.35, "Размещён", 49.20, 50.60),
        ("PAG-S", "Акции Полесье-Агро", "ЗАО «Полесье-Агро»", "Акция", "Equity", 10, 300000, 0, 0.50, "Размещён", 14.85, 13.90),
        ("BEF-S", "Акции БелЭнерго-Финанс", "ОАО «БелЭнерго-Финанс»", "Акция", "Equity", 10, 250000, 0, 0.50, "Размещён", 11.20, 12.35),
        ("TPI-S", "Акции ТехноПарк Инвест", "ООО «ТехноПарк Инвест»", "Акция", "Equity", 20, 120000, 0, 0.55, "Размещён", 31.70, 29.40),
        ("BYN-GB3", "Облигации Минфина III", "Министерство финансов РБ", "Облигация", "Gov Bonds", 100, 90000, 12.80, 0.20, "Размещён", 100.60, 100.10),
        ("BYN-GB4", "Облигации Минфина IV", "Министерство финансов РБ", "Облигация", "Gov Bonds", 100, 70000, 13.10, 0.20, "Размещён", 98.90, 99.70),
        ("ASB-B1", "Облигации Беларусбанка", "ОАО «АСБ Беларусбанк»", "Облигация", "Corp Bonds", 100, 80000, 13.90, 0.25, "Размещён", 103.10, 102.20),
        ("ASB-S", "Акции Беларусбанка", "ОАО «АСБ Беларусбанк»", "Акция", "Equity", 25, 400000, 0, 0.45, "Размещён", 41.30, 39.10),
        ("BPS-B1", "Облигации БПС-Банка", "ОАО «БПС-Банк»", "Облигация", "Corp Bonds", 50, 50000, 14.00, 0.30, "Размещён", 51.10, 51.90),
        ("MTB-S", "Акции МТ-Банка", "ОАО «МТ-Банк»", "Акция", "Equity", 15, 180000, 0, 0.50, "Размещён", 17.60, 17.95),
        ("GEI-B1", "Облигации ЗелёнаяЭнергия-Инвест", "ОАО «ЗелёнаяЭнергия-Инвест»", "Облигация", "Corp Bonds", 100, 30000, 12.00, 0.30, "Размещён", 100.00, 100.00),
        ("BEF-B1", "Облигации БелЭнерго-Финанс", "ОАО «БелЭнерго-Финанс»", "Облигация", "Corp Bonds", 100, 45000, 13.00, 0.30, "На регистрации", 100.00, 100.00),
    ]
    names = ["Symbol", "Name", "Issuer", "Kind", "Segment", "Nominal", "Volume", "Rate",
             "ExpenseRatio", "Status", "Price", "PrevPrice"]
    for i, r in enumerate(raw):
        d = dict(zip(names, r))
        d["Id"] = i + 1
        SEC[r[0]] = d


_load_securities()


def sec(symbol):
    return SEC[symbol]


HOLDINGS = {
    "190456789": [("BYN-GB1", 600, 40), ("BNH-B1", 300, 30), ("PAG-S", 1200, 20), ("ASB-B1", 100, 10)],
    "291234567": [("AGPB-S", 2000, 35), ("BYN-GB3", 400, 40), ("MSI-B2", 500, 15), ("BEF-S", 700, 10)],
}
LISTINGS = [
    ("190456789", "PAG-S", 400, 1.02), ("190456789", "BNH-B1", 100, 0.99), ("190456789", "BYN-GB1", 200, 1.01),
    ("291234567", "AGPB-S", 800, 1.03), ("291234567", "BEF-S", 300, 0.98), ("291234567", "MSI-B2", 200, 1.00),
    ("100987654", "ASB-S", 150, 1.02), ("100987654", "MTB-S", 250, 0.99),
    ("590123456", "GEI-B1", 80, 1.00), ("590123456", "PAG-S", 150, 1.04),
    ("490765432", "BYN-GB3", 300, 0.995), ("490765432", "BPS-B1", 200, 1.01),
    ("900000001", "MTB-S", 40, 1.02), ("900000003", "PAG-S", 50, 1.01),
]
TRANSACTIONS = [
    ("2026-11-23 09:52", "ООО «БелТехСервис»", "PAG-S", "Покупка", 1200, 14.85, 89.10, "Исполнена"),
    ("2026-11-23 09:31", "ЗАО «Полесье-Агро»", "AGPB-S", "Покупка", 2000, 12.40, 124.00, "Исполнена"),
    ("2026-11-22 16:44", "ООО «БелТехСервис»", "BNH-B1", "Покупка", 300, 102.30, 153.45, "Исполнена"),
    ("2026-11-22 10:21", "ОАО «МинскСтройИнвест»", "ASB-S", "Покупка", 400, 41.30, 82.60, "Исполнена"),
    ("2026-11-21 15:05", "ЗАО «Полесье-Агро»", "BEF-S", "Продажа", 200, 11.20, 11.20, "Исполнена"),
    ("2026-11-20 12:37", "ООО «ГомельЛогистик»", "BYN-GB3", "Покупка", 700, 100.60, 352.10, "Исполнена"),
    ("2026-11-19 09:12", "ИП Козлов А. В.", "ASB-B1", "Покупка", 200, 103.10, 103.10, "Исполнена"),
]
PROJECTS = [
    ("Модернизация филиала", 10, "-1000;300;400;500;300", 121.42, 14.34, 1.12, 3.00),
    ("Модернизация склада", 12, "-150000;45000;60000;70000;50000", 18024.66, 15.72, 1.12, 3.02),
    ("Солнечная электростанция", 10, "-300000;80000;90000;95000;100000;60000", 5840.31, 11.36, 1.02, 4.40),
    ("Открытие нового отделения в Гродно", 12, "-2500;600;800;1000;1200;900", 306.80, 14.85, 1.12, 3.11),
    ("Внедрение системы цифровых платежей", 15, "-1800;400;700;900;1100", 199.83, 17.09, 1.11, 3.07),
    ("Модернизация банкоматной сети", 10, "-1200;250;350;450;500;500", 306.92, 12.82, 1.26, 3.60),
    ("Мобильное приложение для малого бизнеса", 14, "-900;100;300;500;700", 190.11, 16.77, 1.21, 3.00),
    ("Покупка офисного здания", 9, "-5000;700;700;700;700;700;5200", 164.38, 10.48, 1.03, 6.03),
    ("Расширение колл-центра", 16, "-1500;200;250;300;300", -254.85, 12.12, 0.83, None),
]
USERS = [
    ("ASB", "admin", "Администратор", True),
    ("ASB", "employee", "Сотрудник", True),
    ("ASB", "ivanova", "Сотрудник", True),
    ("100200300", "100200300", "Клиент", True),
    ("190456789", "190456789", "Клиент", True),
    ("291234567", "291234567", "Клиент", True),
    ("PERSONAL", "ivanov", "Клиент", True),
]
AUDIT = [
    ("2026-11-23 09:58:11", "admin", "Вход в систему", ""),
    ("2026-11-23 09:52:40", "190456789", "Покупка ценных бумаг", "PAG-S, 400 шт."),
    ("2026-11-23 09:31:05", "employee", "Выставлено предложение", "MTB-S, 250 шт."),
    ("2026-11-23 09:12:47", "admin", "Создан сотрудник", "kozlov"),
    ("2026-11-22 18:04:22", "291234567", "Вход в систему", ""),
    ("2026-11-22 17:40:03", "employee", "Изменены целевые доли", "ООО «БелТехСервис»"),
]

MENU_STAFF = [(T("m.Home"), "◉"), (T("m.Clients"), "▤"), (T("m.Projects"), "◆"),
              (T("m.Portfolio"), "▪"), (T("m.Transactions"), "⇄"), (T("m.Reports"), "≡")]
MENU_CLIENT = [(T("m.Home"), "◉"), (T("m.MyPortfolio"), "▪"),
               (T("m.History"), "⇄"), (T("m.Profile"), "👤")]


def portfolio(unp):
    """Портфель клиента — те же расчёты, что в server/src/logic.js."""
    rows = []
    seg_short = {"Gov Bonds": "Гос. облигации", "Corp Bonds": "Корп. облигации", "Equity": "Акции"}
    for symq, qty, tgt in HOLDINGS[unp]:
        s = sec(symq)
        for_sale = sum(q for u, sy, q, _f in LISTINGS if u == unp and sy == symq)
        rows.append({"Symbol": symq, "Name": s["Name"], "Segment": seg_short.get(s["Segment"], s["Segment"]),
                     "Qty": qty, "ForSale": for_sale, "Price": s["Price"],
                     "ExpenseRatio": s["ExpenseRatio"], "TargetPct": tgt})
    total = sum(r["Qty"] * r["Price"] for r in rows)
    tv = 0
    for r in rows:
        r["CurrentValue"] = r["Qty"] * r["Price"]
        r["CurrentPct"] = round(r["CurrentValue"] / total * 100, 2) if total else 0
        r["TargetValue"] = round(total * r["TargetPct"] / 100, 2)
        r["Amount"] = round(r["TargetValue"] - r["CurrentValue"], 2)
        tv += r["TargetValue"]
    return rows, round(total, 2), round(tv, 2)


# ================================================================ экраны
def screen_login():
    """Окно входа (renderLogin): карточка на зелёном фоне."""
    u = Ui()
    u.rect(0, 0, W, H, fill="#2e5e3e")
    cw, cx = 460, (W - 460) / 2
    cy = 96
    ch = 600
    u.rect(cx, cy, cw, ch, fill=WHITE, rx=6)
    # эмблема
    u.rect(cx + cw / 2 - 45, cy + 24, 90, 65, fill="#008000", rx=2)
    u.text(cx + cw / 2, cy + 24 + 41, "ASB", size=24, anchor="middle", bold=True, fill=WHITE)
    u.text(cx + cw / 2, cy + 110, T("login.secure"), size=12, anchor="middle",
           italic=True, fill="#45525f")
    # серая полоса с заголовком
    u.rect(cx, cy + 126, cw, 82, fill="#f5f5f5")
    u.text(cx + cw / 2, cy + 160, T("login.title"), size=20, anchor="middle")
    u.text(cx + cw / 2, cy + 184, T("login.sub"), size=12, anchor="middle", fill="#5b6672")
    # закладки
    tx, ty, tw = cx + 22, cy + 224, cw - 44
    u.line(tx, ty + 38, tx + tw, ty + 38, stroke="#dde4ec")
    for i, key in enumerate(["tab.company", "tab.user"]):
        bw = tw / 2 - 2
        bx = tx + i * (bw + 3)
        on = i == 0
        u.rect(bx, ty, bw, 40, fill=WHITE if on else "#f2f5f8", stroke="#dde4ec", rx=0)
        u.text(bx + bw / 2, ty + 25, T(key), size=13.5, anchor="middle",
               bold=on, fill=TEXT if on else "#43505e")
    # поля
    fx, fw = cx + 22, cw - 44
    u.field(fx, cy + 296, T("tab.company"), T("hint.company"), fw, focus=True)
    u.field(fx, cy + 296 + 74, T("lbl.pass"), "••••••••", fw)
    # кнопки
    bwd = 190
    u.button(cx + (cw - bwd) / 2, cy + 466, T("btn.login"), w=bwd, kind="primary", h=38)
    u.rect(cx + (cw - bwd) / 2, cy + 466, bwd, 38, fill="none", stroke="#006a00", rx=4)
    # «Регистрация» — контурная кнопка, как .btn.outline в styles.css
    rx = cx + (cw - bwd) / 2
    u.rect(rx, cy + 512, bwd, 38, fill=WHITE, stroke="#008000", rx=4)
    u.text(rx + bwd / 2, cy + 512 + 24, T("btn.register"), size=14, anchor="middle",
           fill="#008000")
    # переключатель языка и демо-доступы
    u.langbar(cx + 90, cy + ch + 34, dark=True, size=13)
    u.text(W / 2, cy + ch + 62,
           "Демо-доступы: admin / admin123 · employee / emp123 · 100200300 / client123",
           size=12, anchor="middle", fill=WHITE, opacity=0.72)
    return u


def screen_register():
    """Окно регистрации (renderRegister)."""
    u = Ui()
    u.rect(0, 0, W, H, fill="#2e5e3e")
    cw, cx, cy, ch = 560, (W - 560) / 2, 40, 860
    u.rect(cx, cy, cw, ch, fill=WHITE, rx=6)
    u.rect(cx + cw / 2 - 45, cy + 20, 90, 60, fill="#008000", rx=2)
    u.text(cx + cw / 2, cy + 20 + 38, "ASB", size=22, anchor="middle", bold=True, fill=WHITE)
    u.text(cx + cw / 2, cy + 100, T("reg.title"), size=20, anchor="middle")
    u.text(cx, cy + 126, T("reg.type"), size=12.5, bold=True, fill="#41505f")
    # радиокнопки
    u.circle(cx + 6, cy + 148, 6, fill=GREEN, stroke=GREEN)
    u.circle(cx + 6, cy + 148, 2.4, fill=WHITE)
    u.text(cx + 20, cy + 153, T("reg.company"), size=14)
    u.circle(cx + 200, cy + 148, 6, fill=WHITE, stroke="#cfd8e3")
    u.text(cx + 214, cy + 153, T("reg.personal"), size=14)
    fw = cw - 44
    y = cy + 180
    y = u.field(cx + 22, y, T("reg.cname"), "ООО «СмартФинанс»", fw)
    y = u.field(cx + 22, y + 20, T("reg.unp"), "191345678", fw)
    u.field(cx + 22, y + 20, T("reg.login"), "smartfinance", fw)
    u.field(cx + 22 + fw / 2 + 7, y + 20, T("reg.pass"), "••••••••", fw / 2 - 7)
    y2 = y + 94
    y2 = u.field(cx + 22, y2, T("reg.address"), "г. Минск, ул. Притыцкого 62", fw)
    y2 = u.field(cx + 22, y2 + 20, T("reg.contacts"), "+375 25 777-88-99", fw)
    u.field(cx + 22, y2 + 20, T("reg.pass2"), "••••••••", fw / 2 - 7)
    u.button(cx + 22, cy + ch - 60, T("reg.submit"), w=220, kind="primary")
    u.add(f'<rect x="{cx + 22}" y="{cy + ch - 60}" width="220" height="34" rx="4" fill="none" stroke="{GREEN_D}"/>')
    u.button(cx + 252, cy + ch - 60, T("reg.back"), w=120)
    return u


def _dense_number(width, size=13.5, need=6):
    """Подбирает размер шрифта, чтобы число из need знаков влезло в графу."""
    fits = (width - 22) / (need * 0.56)
    return min(size, max(10.5, fits))


def screen_home():
    """Главная страница сотрудника: KPI, две таблицы цен и график за сутки."""
    u = Ui()
    y = u.shell(MENU_STAFF + [(T("m.Help"), "?")], T("m.Home"),
                T("m.Home"), "БЕЛАРУСБАНК  >  Главная",
                "employee", "Сотрудник")
    cy = y + 18
    u.text(250, cy + 22, "Добро пожаловать, employee  ·  Роль: Сотрудник", size=20, bold="600")
    u.text(250, cy + 50, T("home.hint"), size=14, fill=MUTED)
    kpis = [("12", T("k.clients"), BLUE), ("1 146 925,00 BYN", T("k.aum"), GREEN),
            ("14", T("k.offers"), ORANGE), ("1 187,55 BYN", T("k.income"), PURPLE)]
    kx, kw, ky = 250, 296, cy + 72
    for i, (val, cap, accent) in enumerate(kpis):
        x = kx + i * (kw + 14)
        u.rect(x, ky, kw, 84, fill=WHITE, rx=4)
        u.rect(x, ky, 5, 84, fill=accent)
        u.text(x + 18, ky + 36, val, size=21, bold=True)
        u.text(x + 18, ky + 62, cap, size=13, fill=MUTED)
    # три таблицы: растут, падают, крупнейшие выпуски
    cols = [
        (T("home.up"), UP, "▲", [("BYN-GB1", "Облигации Минфина", 101.20, 0.80),
                                 ("BNH-B1", "Облигации Белнефтехим", 102.30, 1.49),
                                 ("TPI-S", "Акции ТехноПарк", 31.70, 7.82),
                                 ("ASB-B1", "Облигации Беларусбанка", 103.10, 0.88),
                                 ("BYN-GB3", "Облигации Минфина III", 100.60, 0.50)], True),
        (T("home.down"), DOWN, "▼", [("BEF-S", "Акции БелЭнерго-Финанс", 11.20, -9.31),
                                     ("MSI-B2", "Облигации МинскСтрой", 49.20, -2.77),
                                     ("AGPB-B2", "Облигации Белагропром", 49.60, -1.39),
                                     ("BPS-B1", "Облигации БПС-Банка", 51.10, -1.54),
                                     ("BYN-GB4", "Облигации Минфина IV", 98.90, -0.80)], True),
        ("Крупнейшие выпуски", "#6e8caa", "", [("ASB-S", "Акции Беларусбанка", 41.30, 400000),
                                              ("PAG-S", "Акции Полесье-Агро", 14.85, 300000),
                                              ("BEF-S", "Акции БелЭнерго", 11.20, 250000),
                                              ("AGPB-S", "Акции Белагропромбанка", 12.40, 200000),
                                              ("MTB-S", "Акции МТ-Банка", 17.60, 180000)], False),
    ]
    ty = ky + 106
    colw, row_h, head_h = 292, 46, 44
    for ci, (title, color, arrow, rows, is_trend) in enumerate(cols):
        x = kx + ci * (colw + 16)
        u.text(x, ty, title, size=15, bold=True, fill=color)
        u.rect(x, ty + 12, colw, head_h + row_h * len(rows) + 8, fill=WHITE, rx=4)
        heads = ["Бумага", "Цена", "24 ч, %" if is_trend else "Объём", ""]
        widths = [150, 72, 70, 0]

        def cell(i, j, v, cx, cy2, w, rows=rows, color=color, arrow=arrow, is_trend=is_trend):
            r = rows[i]
            if j == 0:
                u.text(cx + PAD, cy2 + 19, r[0], size=12.5, bold=True)
                u.text(cx + PAD, cy2 + 34, ellipsis(r[1], 10.5, w - 2 * PAD), size=10.5, fill=MUTED)
                return True
            if j == 1:
                u.text(cx + w - PAD, cy2 + 19, nf(r[2]), size=12.5, anchor="end")
                return True
            if j == 2:
                if is_trend:
                    u.text(cx + w - PAD, cy2 + 19, f"{arrow} {pct(r[3])}", size=12.5,
                           anchor="end", fill=color)
                else:
                    u.text(cx + w - PAD, cy2 + 19, nf(r[3], 0), size=12.5, anchor="end")
                return True
            return True          # четвёртая графа нужна только как запас по ширине

        u.table(x, ty + 12, heads, [[r[0], "", r[2], r[3]] for r in rows], widths,
                row_h=row_h, head_h=head_h, size=12.5, head_size=11.5,
                aligns=["start", "start", "num", "num"], cell=cell, head_fit=False)

    # график рынка за сутки
    gy = ty + 12 + head_h + row_h * 5 + 20
    gh = H - 24 - gy
    u.rect(250, gy, W - 270, gh, fill=WHITE, rx=4)
    u.text(266, gy + 24, "Индекс портфеля клиентов банка за сутки", size=14, bold=True)
    u.text(W - 286, gy + 24, "обновляется раз в час", size=12, anchor="end", fill=MUTED)
    px, py, pw, ph = 316, gy + 38, W - 336 - 24, gh - 60
    vals = [100.0, 100.4, 100.1, 100.9, 101.3, 101.0, 101.6, 102.2, 101.9,
            102.4, 102.1, 102.8, 103.1, 102.7, 103.4, 103.9, 103.6, 104.2,
            104.0, 104.5, 104.9, 104.6, 105.1, 105.4]
    lo, hi = min(vals) - 0.4, max(vals) + 0.4
    for i in range(4):
        yy = py + ph * i / 3
        u.line(px, yy, px + pw, yy, stroke="#e8edf2")
        u.text(px - 8, yy + 4, nf(hi - (hi - lo) * i / 3), size=11, anchor="end", fill=MUTED)
    pts = [(px + i / (len(vals) - 1) * pw, py + ph - (v - lo) / (hi - lo) * ph)
           for i, v in enumerate(vals)]
    u.poly([(px, py + ph)] + pts + [(px + pw, py + ph)], fill="#dcf3ea")
    u.path("M " + " L ".join(f"{a:.1f} {b:.1f}" for a, b in pts), stroke=UP, sw=2)
    for i, lab in enumerate(["00:00", "06:00", "12:00", "18:00", "23:00"]):
        xx = px + i / 4 * pw
        u.line(xx, py + ph, xx, py + ph + 4, stroke="#e8edf2")
        u.text(xx, py + ph + 18, lab, size=11, anchor="middle", fill=MUTED)
    return u


def screen_clients():
    """Раздел «Клиенты»: реестр предприятий и физических лиц."""
    u = Ui()
    y = u.shell(MENU_STAFF + [(T("m.Help"), "?")], T("m.Clients"), T("m.Clients"),
                "БЕЛАРУСБАНК  >  Клиенты", "employee", "Сотрудник")
    y += u.actions_bar(y, [(T("b.AddClient"), "primary", "✚"), (T("b.Export"), "plain", "⇩")])
    rows = [[c[0], c[1], c[2], c[3], c[4], c[5]] for c in CLIENTS]
    u.rect(250, y + 18, 1058, 40 * len(rows) + 40, fill=WHITE, rx=4)

    def cell(i, j, v, cx, cy, w):
        if j == 4:
            u.pill(cx + 12, cy + 6, v, ok=True)
            return True
        if j == 0:
            u.text(cx + 12, cy + 21, v, size=13.5)
            return True
        return False

    u.table(250, y + 18, ["Наименование", "УНП", "Адрес", "Контакты", "Статус", "Тип клиента"],
            rows, [268, 104, 288, 176, 104, 118], row_h=40, size=13.5, cell=cell)
    return u


def screen_portfolio():
    """Инвестиционный портфель клиента (ООО «БелТехСервис»)."""
    u = Ui()
    y = u.shell(MENU_STAFF + [(T("m.Help"), "?")], T("m.Portfolio"), T("t.Portfolio"),
                "БЕЛАРУСБАНК  >  Инвестиционный портфель клиента", "employee", "Сотрудник")
    # панель действий: список клиентов + кнопки
    u.rect(230, y, W - 230, 54, fill=WHITE)
    u.line(230, y + 54, W, y + 54, stroke=LINE)
    u.rect(250, y + 10, 230, 34, fill=WHITE, stroke="#cfd8e3", rx=4)
    u.text(260, y + 32, "ООО «БелТехСервис»", size=14)
    u.text(466, y + 32, "▾", size=12, fill=MUTED)
    x = 490
    for label, kind, icon in [("✚ Добавить актив", "plain", ""), (T("b.Buy"), "primary", ""),
                              (T("b.Sell"), "danger", ""), ("Мои предложения", "plain", ""),
                              ("⤓ Экспорт", "plain", "")]:
        x += u.button(x, y + 10, label, kind=kind, icon=icon) + 8
    y += 54
    rows, total, tv = portfolio("190456789")
    box_w = W - 270
    u.rect(250, y + 18, box_w, 44 + 44 * len(rows) + 46, fill=WHITE, rx=4)
    cols = ["Тикер", "Наименование", "Сегмент", "Кол-во", "На продаже", "Цена",
            "Расходы %", "Текущая стоимость", "Текущая доля %", "Целевая доля %",
            "Целевая стоимость", "Сумма к действию"]
    widths = [82, 178, 114, 58, 80, 66, 80, 120, 104, 96, 116, 130]
    data = []
    for r in rows:
        data.append([r["Symbol"], r["Name"], r["Segment"], nf(r["Qty"], 0),
                     nf(r["ForSale"], 0), nf(r["Price"]), nf(r["ExpenseRatio"]),
                     nf(r["CurrentValue"]), nf(r["CurrentPct"]) + "%",
                     nf(r["TargetPct"], 2), nf(r["TargetValue"]), nf(abs(r["Amount"]))])

    def cell(i, j, v, cx, cy, w):
        if j == 0:
            u.text(cx + PAD, cy + 22, v, size=13, bold=True, fill=GREEN_D)
            return True
        if j == 1:
            u.text(cx + PAD, cy + 22, ellipsis(v, 12.5, w - 2 * PAD), size=12.5)
            return True
        if j == 3:
            u.text(cx + PAD, cy + 22, v, size=13)
            return True
        if j == 9:
            u.rect(cx + PAD, cy + 6, w - 2 * PAD - 6, 26, fill=WHITE, stroke="#cfd8e3", rx=3)
            u.text(cx + w - PAD - 6, cy + 23, v, size=12.5, anchor="end")
            return True
        if j == 11:
            amount = rows[i]["Amount"]
            u.text(cx + w - PAD, cy + 22, ("↑ " if amount > 0 else "↓ ") + v, size=12.5,
                   anchor="end", fill=UP if amount > 0 else DOWN)
            return True
        if j in (7, 8, 10):
            u.text(cx + w - PAD, cy + 22, v, size=12.5, anchor="end")
            return True
        if j in (4, 5, 6):
            u.text(cx + w - PAD, cy + 22, v, size=12.5, anchor="end")
            return True
        return False

    end = u.table(250, y + 18, cols, data, widths, row_h=44, size=12.5, head_h=44,
                  aligns=["start", "start", "start", "num", "num", "num", "num", "num",
                          "num", "num", "num", "num"], cell=cell)
    # итоговая строка
    u.line(250, end, 250 + box_w, end, stroke=LINE)
    x = 262
    for label, val, color in [("Текущая стоимость:", nf(total) + " BYN", TEXT),
                              ("Целевая стоимость:", nf(tv) + " BYN", TEXT),
                              ("Целевая доля, %:", "100,00", TEXT),
                              ("Сумма к действию:", nf(tv - total), UP)]:
        u.text(x, end + 28, label, size=13.5, bold=True)
        x += tw(label, 13.5, True) + 6
        u.text(x, end + 28, val, size=13.5, bold=True, fill=color)
        x += tw(val, 13.5, True) + 26
    return u


def _modal_frame(u, title, w, h, body_draw):
    """Общая рамка модального окна: затемнение, шапка, низ."""
    u.rect(0, 0, W, H, fill="#121e2a", op=0.45)
    x, y = (W - w) / 2, (H - h) / 2
    u.rect(x, y, w, h, fill=WHITE, rx=6)
    u.text(x + 20, y + 31, title, size=16, bold=True)
    u.text(x + w - 34, y + 31, "✕", size=15, fill=MUTED)
    u.line(x, y + 52, x + w, y + 52, stroke=LINE)
    return x, y, body_draw


def screen_buy():
    """Модальное окно покупки бумаг у другого клиента (openBuy)."""
    u = Ui()
    u.shell(MENU_STAFF + [(T("m.Help"), "?")], T("m.Portfolio"), T("t.Portfolio"),
            "БЕЛАРУСБАНК  >  Инвестиционный портфель клиента", "employee", "Сотрудник")
    bw, bh = 900, 560
    x, y = (W - bw) / 2, (H - bh) / 2

    def body():
        u.text(x + 20, y + 86, T("col.Security"), size=12.5, bold=True, fill="#41505f")
        u.rect(x + 20, y + 94, bw - 40, 36, fill=WHITE, stroke=GREEN, rx=4)
        u.text(x + 30, y + 117, "PAG-S — Акции Полесье-Агро", size=14)
        u.text(x + bw - 32, y + 117, "▾", size=12, fill=MUTED)
        u.text(x + 20, y + 158, T("buy.pick"), size=13.5, bold=True)
        rows = [("ЗАО «Полесье-Агро»", "PAG-S", nf(400, 0), nf(15.15), nf(2.02)),
                ("ОАО «МинскСтройИнвест»", "ASB-S", nf(150, 0), nf(42.13), nf(2.01)),
                ("ИП Козлов А. В.", "PAG-S", nf(150, 0), nf(15.44), nf(3.97))]
        u.rect(x + 20, y + 168, bw - 40, 40 + 40 * len(rows), fill=WHITE, stroke=LINE, rx=4)

        def cell(i, j, v, cx, cy, w):
            if j == 1:
                u.text(cx + 12, cy + 22, v, size=13.5, bold=True)
                return True
            if j == 4:
                u.text(cx + w - PAD, cy + 22, "+" + v + "%", size=13.5, anchor="end", fill=DOWN)
                return True
            if i == 0 and j == 0:
                u.rect(cx, cy, bw - 40, 40, fill="#e9f6f1")
                u.text(cx + 12, cy + 22, v, size=13.5)
                return True
            return False

        u.table(x + 20, y + 168, [T("col.Seller"), T("col.Symbol"), T("col.Available"),
                                  T("col.Price"), T("col.VsMarket")],
                rows, [250, 150, 170, 140, 150], row_h=40, size=13.5,
                aligns=["start", "start", "num", "num", "num"], cell=cell)
        # количество и расчёт
        u.text(x + 20, y + 352, T("p.Qty"), size=12.5, bold=True, fill="#41505f")
        u.rect(x + 20, y + 360, 150, 36, fill=WHITE, stroke="#cfd8e3", rx=4)
        u.text(x + 30, y + 383, "400", size=14)
        u.text(x + 20, y + 414, T("buy.avail").replace("{0}", "400"), size=12, fill=MUTED)
        # блок итогов
        sx, sw = x + 380, bw - 400
        u.rect(sx, y + 352, sw, 132, fill=TOP, rx=4)
        lines = [(T("o.price"), money(15.15)), (T("o.amount"), money(6060.00)),
                 (T("o.comm"), money(30.30)), (T("o.pay"), money(6090.30))]
        for i, (k, v) in enumerate(lines):
            ly = y + 378 + i * 30
            total = i == 3
            u.text(sx + 14, ly, k, size=13.5 if not total else 15, bold=total, fill="#4d5b69" if not total else TEXT)
            u.text(sx + sw - 14, ly, v, size=13.5 if not total else 15, anchor="end",
                   bold=total, fill=GREEN_D if total else TEXT)

    _modal_frame(u, T("buy.title"), bw, bh, body)
    body()
    u.line(x, y + bh - 62, x + bw, y + bh - 62, stroke=LINE)
    u.rect(x, y + bh - 61, bw, 61, fill="#fbfdfe")
    u.button(x + bw - 330, y + bh - 48, T("cancel"), w=140)
    u.button(x + bw - 178, y + bh - 48, T("b.Buy"), w=158, kind="primary")
    return u


def screen_sell():
    """Модальное окно выставления предложения о продаже (openSell)."""
    u = Ui()
    u.shell(MENU_STAFF + [(T("m.Help"), "?")], T("m.Portfolio"), T("t.Portfolio"),
            "БЕЛАРУСБАНК  >  Инвестиционный портфель клиента", "employee", "Сотрудник")
    bw, bh = 620, 560
    x, y = (W - bw) / 2, (H - bh) / 2
    _modal_frame(u, T("sell.title"), bw, bh, None)
    u.text(x + 20, y + 86, T("col.Security"), size=12.5, bold=True, fill="#41505f")
    u.rect(x + 20, y + 94, bw - 40, 36, fill=WHITE, stroke=GREEN, rx=4)
    u.text(x + 30, y + 117, "BNH-B1 — Облигации Белнефтехим-Инвест (300)", size=14)
    u.text(x + bw - 32, y + 117, "▾", size=12, fill=MUTED)
    fw = (bw - 54) / 2
    u.text(x + 20, y + 158, T("p.Qty"), size=12.5, bold=True, fill="#41505f")
    u.rect(x + 20, y + 166, fw, 36, fill=WHITE, stroke="#cfd8e3", rx=4)
    u.text(x + 30, y + 189, "250", size=14)
    u.text(x + 34 + fw, y + 158, T("sell.price"), size=12.5, bold=True, fill="#41505f")
    u.rect(x + 34 + fw, y + 166, fw, 36, fill=WHITE, stroke="#cfd8e3", rx=4)
    u.text(x + 44 + fw, y + 189, "103,50", size=14)
    u.text(x + 20, y + 226, T("sell.free").replace("{0}", "300"), size=12, fill=MUTED)
    u.text(x + 20, y + 250,
           f"{T('sell.market').replace('{0}', '102,30')} (1,2%)", size=12, fill=MUTED)
    # расчёт
    sx, sw = x + 20, bw - 40
    u.rect(sx, y + 268, sw, 110, fill=TOP, rx=4)
    for i, (k, v) in enumerate([(T("o.amount"), money(25875.00)), (T("o.comm"), money(129.38)),
                                (T("o.receive"), money(25745.62))]):
        ly = y + 294 + i * 30
        total = i == 2
        u.text(sx + 14, ly, k, size=13.5 if not total else 15, bold=total, fill="#4d5b69")
        u.text(sx + sw - 14, ly, v, size=13.5 if not total else 15, anchor="end",
               bold=total, fill=RED if total else TEXT)
    u.line(x, y + bh - 62, x + bw, y + bh - 62, stroke=LINE)
    u.rect(x, y + bh - 61, bw, 61, fill="#fbfdfe")
    u.button(x + bw - 300, y + bh - 48, T("cancel"), w=130)
    u.button(x + bw - 160, y + bh - 48, T("sell.submit"), w=140, kind="danger")
    return u


def screen_stock():
    """Страница бумаги: цена, график за месяц и предложения продавцов."""
    u = Ui()
    y = u.shell(MENU_STAFF + [(T("m.Help"), "?")], "", "BNH-B1",
                "БЕЛАРУСБАНК  >  Главная  >  BNH-B1", "employee", "Сотрудник")
    y += u.actions_bar(y, [("← " + T("m.Home"), "plain", ""), (T("b.Buy"), "primary", ""),
                           (T("b.Sell"), "danger", "")])
    s = sec("BNH-B1")
    u.rect(250, y + 16, W - 270, 132, fill=WHITE, rx=4)
    u.text(270, y + 48, "BNH-B1", size=24, bold=True)
    u.text(270 + tw("BNH-B1", 24, True) + 18, y + 48, s["Name"], size=20,
           bold="600", fill="#46607a")
    u.text(270, y + 76, f"Эмитент: {s['Issuer']}  ·  {s['Kind']} / {s['Segment']}  ·  "
                        f"Номинал: {nf(s['Nominal'])}  ·  Ставка: {nf(s['Rate'])}  ·  "
                        f"Объём выпуска: {nf(s['Volume'], 0)}", size=12.5, fill=MUTED)
    price_txt = money(s["Price"])
    u.text(270, y + 118, price_txt, size=30, bold=True)
    u.text(270 + tw(price_txt, 30, True) + 18, y + 116, "▲ 1,49% (24h)", size=16,
           bold=True, fill=UP)
    # переключатель периода
    gy = y + 160
    for i, key in enumerate(["s.hours", "s.days", "s.weeks", "s.months", "s.years"]):
        bx = 250 + i * 104
        on = i == 3
        u.rect(bx, gy, 96, 34, fill=GREEN if on else WHITE,
               stroke=GREEN if on else "#c9d3de", rx=4)
        u.text(bx + 48, gy + 22, T(key), size=14, anchor="middle",
               fill=WHITE if on else "#33414f", bold=on)
    # график
    cx, cy, cw2, ch2 = 250, gy + 46, W - 270, 352
    u.rect(cx, cy, cw2, ch2, fill=WHITE, rx=4)
    px, py, pw, ph = cx + 66, cy + 16, cw2 - 84, ch2 - 106
    prices = [96.4, 97.1, 96.8, 98.2, 99.4, 98.7, 100.1, 99.6, 101.0, 100.4,
              101.9, 101.2, 102.6, 102.0, 103.4, 102.8, 101.9, 102.4, 103.0, 102.2,
              101.6, 102.9, 103.6, 102.7, 101.8, 102.1, 103.2, 102.5, 101.9, 102.3]
    lo, hi = min(prices) - 1.2, max(prices) + 1.2
    u.rect(px, py, pw, ph, fill="#fbfdfe")
    for i in range(5):
        yy = py + ph * i / 4
        u.line(px, yy, px + pw, yy, stroke="#e8edf2")
        u.text(px - 8, yy + 4, nf(hi - (hi - lo) * i / 4), size=11, anchor="end", fill=MUTED)
    pts = [(px + i / (len(prices) - 1) * pw, py + ph - (p - lo) / (hi - lo) * ph)
           for i, p in enumerate(prices)]
    u.poly([(px, py + ph)] + pts + [(px + pw, py + ph)], fill="#dcf3ea")
    d = "M " + " L ".join(f"{a:.1f} {b:.1f}" for a, b in pts)
    u.path(d, stroke=UP, sw=2)
    for i in range(6):
        xx = px + i / 5 * pw
        u.text(xx, py + ph + 20, ["01.06", "01.07", "01.08", "01.09", "01.10", "01.11"][i],
               size=11, anchor="middle", fill=MUTED)
    u.text(cx + 20, cy + ch2 - 18, f"Минимум: {nf(min(prices))}", size=12.5, bold=True)
    u.text(cx + 170, cy + ch2 - 18, f"Максимум: {nf(max(prices))}", size=12.5, bold=True)
    u.text(cx + 340, cy + ch2 - 18, "За период: +6,12%", size=12.5, bold=True, fill=UP)
    # предложения
    ty = cy + ch2 + 16
    u.rect(250, ty, 1210, 40 + 40 * 3 + 12, fill=WHITE, rx=4)
    u.text(266, ty + 26, "Предложения продавцов", size=14, bold=True)
    u.text(560, ty + 26, "Цена обновляется автоматически раз в час", size=12, fill=MUTED)
    rows = [("ООО «БелТехСервис»", nf(100, 0), nf(101.28), nf(-1.00)),
            ("ЧУП «Витебск-Текстиль»", nf(150, 0), nf(103.83), nf(1.50)),
            ("ЗАО «Полесье-Агро»", nf(200, 0), nf(103.10), nf(0.78))]

    def cell(i, j, v, cx2, cy2, w):
        if j == 4:
            u.button(cx2 + w - 90, cy2 + 6, T("b.Buy"), w=76, h=28)
            return True
        if j == 3:
            neg = v.startswith("-")
            u.text(cx2 + w - PAD, cy2 + 25, "" if neg else "+" + v + "%" if True else v,
                   size=13.5, anchor="end", fill=DOWN if neg else UP)
            if neg:
                u.text(cx2 + w - PAD, cy2 + 25, v + "%", size=13.5, anchor="end", fill=DOWN)
            return True
        return False

    u.line(250, ty + 40, W - 20, ty + 40, stroke=LINE)
    u.table(250, ty + 40, [T("col.Seller"), T("col.Available"), T("col.Price"),
                           T("col.VsMarket"), ""], rows, [330, 220, 220, 220, 220],
            row_h=40, size=13.5, aligns=["start", "num", "num", "num", "start"], cell=cell)
    return u


def screen_transactions():
    """Журнал сделок клиентов."""
    u = Ui()
    y = u.shell(MENU_STAFF + [(T("m.Help"), "?")], T("m.Transactions"), T("m.Transactions"),
                "БЕЛАРУСБАНК  >  Транзакции", "employee", "Сотрудник")
    u.rect(230, y, W - 230, 54, fill=WHITE)
    u.line(230, y + 54, W, y + 54, stroke=LINE)
    u.rect(250, y + 10, 230, 34, fill=WHITE, stroke="#cfd8e3", rx=4)
    u.text(260, y + 32, T("b.all"), size=14)
    u.text(466, y + 32, "▾", size=12, fill=MUTED)
    u.button(1290, y + 10, T("b.Export"), icon="⇩")
    y += 54
    rows = [list(t) for t in TRANSACTIONS]
    u.rect(250, y + 18, 910, 40 + 40 * len(rows), fill=WHITE, rx=4)

    def cell(i, j, v, cx, cy, w):
        if j == 6:
            u.pill(cx + 12, cy + 9, str(v), ok=True)
            return True
        if j == 2:
            u.text(cx + 12, cy + 21, str(v), size=13.5, bold=True)
            return True
        return False

    u.table(250, y + 18, ["Дата", "Клиент", "Бумага", "Тип", "Кол-во", "Цена",
                          "Комиссия", "Статус"], rows,
            [136, 214, 92, 96, 78, 88, 98, 108], row_h=40, size=13.5,
            aligns=["start", "start", "start", "start", "num", "num", "num", "start"], cell=cell)
    return u


def screen_projects():
    """Инвестиционные проекты: NPV, IRR, PI, срок окупаемости."""
    u = Ui()
    y = u.shell(MENU_STAFF + [(T("m.Help"), "?")], T("m.Projects"), T("t.Projects"),
                "БЕЛАРУСБАНК  >  Инвестиционные проекты", "employee", "Сотрудник")
    y += u.actions_bar(y, [(T("b.AddProject"), "primary", "✚"), (T("b.Export"), "plain", "⇩")])
    rows = [[p[0], nf(p[1]), p[2], nf(p[3]), nf(p[4]), nf(p[5]),
             (nf(p[6]) + " г.") if p[6] is not None else T("p.never")] for p in PROJECTS]
    u.rect(250, y + 18, 1180, 40 + 38 * len(rows), fill=WHITE, rx=4)

    def cell(i, j, v, cx, cy, w):
        if j == 0:
            u.text(cx + 12, cy + 21, str(v), size=13.5, bold=True)
            return True
        if j == 2:
            u.text(cx + 12, cy + 21, str(v), size=12.5, fill=MUTED, family=MONO_FONT)
            return True
        if j == 3:
            u.text(cx + w - 12, cy + 21, str(v), size=13.5, anchor="end",
                   fill=UP if PROJECTS[i][3] > 0 else DOWN)
            return True
        if j == 6 and PROJECTS[i][6] is None:
            u.text(cx + w - 12, cy + 21, str(v), size=13.5, anchor="end", fill=DOWN)
            return True
        return False

    u.table(250, y + 18, ["Проект", "Ставка %", "Потоки", "NPV", "IRR %", "PI",
                          "Окупаемость (лет)"],
            rows, [360, 100, 320, 130, 100, 84, 148], row_h=38, size=13.5,
            aligns=["start", "num", "start", "num", "num", "num", "num"], cell=cell)
    return u


def screen_project_dialog():
    """Окно добавления инвестиционного проекта."""
    u = Ui()
    y = u.shell(MENU_STAFF + [(T("m.Help"), "?")], T("m.Projects"), T("t.Projects"),
                "БЕЛАРУСБАНК  >  Инвестиционные проекты", "employee", "Сотрудник")
    bw, bh = 620, 420
    x, y2 = (W - bw) / 2, (H - bh) / 2
    _modal_frame(u, T("p.NewProject"), bw, bh, None)
    fw = bw - 40
    u.field(x + 20, y2 + 82, "Проект", "Цифровая платформа кредитования", fw, req=True)
    u.field(x + 20, y2 + 152, T("p.Rate"), "14", (fw - 14) / 2)
    u.field(x + 34 + (fw - 14) / 2, y2 + 152, "Потоки через ';'",
            "-2200;500;800;900;600", (fw - 14) / 2, req=True)
    u.text(x + 20, y2 + 236, "-2200;500;800;900;600", size=12, fill=MUTED)
    u.line(x, y2 + bh - 62, x + bw, y2 + bh - 62, stroke=LINE)
    u.rect(x, y2 + bh - 61, bw, 61, fill="#fbfdfe")
    u.button(x + bw - 300, y2 + bh - 48, T("cancel"), w=130)
    u.button(x + bw - 160, y2 + bh - 48, T("b.AddProject"), w=140, kind="primary")
    return u


def screen_reports():
    """Отчёты и аналитика за 30 дней."""
    u = Ui()
    y = u.shell(MENU_STAFF + [(T("m.Help"), "?")], T("m.Reports"), T("t.Reports"),
                "БЕЛАРУСБАНК  >  Отчёты / Аналитика", "employee", "Сотрудник")
    y += u.actions_bar(y, [(T("b.Export"), "primary", "⇩")])
    u.rect(250, y + 18, 1200, 184, fill=WHITE, rx=4)
    u.text(266, y + 44, T("t.Reports"), size=14, bold=True)
    u.line(250, y + 56, 1450, y + 56, stroke=LINE)
    rows = [["Исполнено операций", "34"],
            ["Доход банка (комиссии)", "1 187,55 BYN"],
            ["Востребовано: BYN-GB1, BEF-S, PAG-S", "8"]]
    end = u.table(250, y + 56, [T("col.Metric"), T("col.Value")], rows, [1050, 150],
                  row_h=40, aligns=["start", "num"])
    ly = end + 18
    u.rect(250, ly, 1200, 40 + 40 * 5 + 8, fill=WHITE, rx=4)
    u.text(266, ly + 26, T("m.Projects"), size=14, bold=True)
    u.line(250, ly + 40, 1450, ly + 40, stroke=LINE)
    prows = [[p[0], nf(p[3]), nf(p[4]) + "%", nf(p[5]),
              nf(p[6]) if p[6] is not None else T("p.never")] for p in PROJECTS[:5]]

    def cell(i, j, v, cx, cy, w):
        if j == 1:
            u.text(cx + w - PAD, cy + 21, str(v), size=13.5, anchor="end",
                   fill=UP if PROJECTS[i][3] > 0 else DOWN)
            return True
        return False

    u.table(250, ly + 40, ["Проект", "NPV", "IRR %", "PI", "Окупаемость (лет)"], prows,
            [600, 180, 140, 120, 160], row_h=40, size=13.5, head_h=44,
            aligns=["start", "num", "num", "num", "num"], cell=cell)
    return u


def screen_admin():
    """Администрирование: учётные записи и журнал действий."""
    u = Ui()
    menu = MENU_STAFF + [(T("m.Admin"), "◆"), (T("m.Help"), "?")]
    y = u.shell(menu, T("m.Admin"), T("t.Admin"),
                "БЕЛАРУСБАНК  >  Администрирование", "admin", "Администратор")
    y += u.actions_bar(y, [(T("b.AddEmployee"), "primary", "✚"), (T("b.Delete"), "plain", "✖")])
    u.rect(250, y + 16, 840, 40 + 38 * len(USERS) + 8, fill=WHITE, rx=4)
    u.text(266, y + 42, T("t.Admin"), size=14, bold=True)
    u.line(250, y + 56, W - 20, y + 56, stroke=LINE)
    rows = [[u1[0], u1[1], u1[2], "✓" if u1[3] else "—"] for u1 in USERS]

    def cell(i, j, v, cx, cy, w):
        if j == 1:
            u.text(cx + 12, cy + 21, str(v), size=13.5, bold=True)
            return True
        if j == 2:
            u.pill(cx + 12, cy + 8, str(v), ok=(v == "Администратор"))
            return True
        return False

    end = u.table(250, y + 56, [T("col.Company"), T("col.Login"), T("col.Role"), T("col.Active")],
                  rows, [260, 220, 220, 140], row_h=38, size=13.5, cell=cell, head_h=44, head_fit=False)
    # журнал
    ly = end + 18
    u.rect(250, ly, 970, 40 + 38 * len(AUDIT) + 8, fill=WHITE, rx=4)
    u.text(266, ly + 26, T("t.Log"), size=14, bold=True)
    u.line(250, ly + 40, W - 20, ly + 40, stroke=LINE)
    arows = [list(a) for a in AUDIT]
    u.table(250, ly + 40, [T("col.Time"), T("col.User"), T("col.Action"), T("col.Details")],
            arows, [230, 180, 300, 260], row_h=38, size=13.5, head_h=44, head_fit=False)
    return u


def screen_client_home():
    """Главная страница клиента: только свои показатели."""
    u = Ui()
    y = u.shell(MENU_CLIENT + [(T("m.Help"), "?")], T("m.Home"), T("m.Home"),
                "БЕЛАРУСБАНК  >  Главная", "190456789", "Клиент")
    cy = y + 18
    u.text(250, cy + 22, "Добро пожаловать, 190456789  ·  Роль: Клиент", size=20, bold="600")
    u.text(250, cy + 50, T("home.hint"), size=14, fill=MUTED)
    kpis = [("162 495,00 BYN", T("k.pv"), GREEN), ("4", T("k.secs"), BLUE),
            ("5", T("k.myops"), PURPLE), ("3", T("k.myoffers"), ORANGE)]
    kx, kw, ky = 250, 296, cy + 72
    for i, (val, cap, accent) in enumerate(kpis):
        x = kx + i * (kw + 14)
        u.rect(x, ky, kw, 84, fill=WHITE, rx=4)
        u.rect(x, ky, 5, 84, fill=accent)
        u.text(x + 18, ky + 36, val, size=21, bold=True)
        u.text(x + 18, ky + 62, cap, size=13, fill=MUTED)
    up = [("BYN-GB1", "Облигации Минфина", 101.20, 0.80), ("BNH-B1", "Облигации Белнефтехим-Инвест", 102.30, 1.49),
          ("TPI-S", "Акции ТехноПарк Инвест", 31.70, 7.82), ("ASB-B1", "Облигации Беларусбанка", 103.10, 0.88)]
    down = [("BEF-S", "Акции БелЭнерго-Финанс", 11.20, -9.31), ("MSI-B2", "Облигации МинскСтройИнвест", 49.20, -2.77),
            ("AGPB-B2", "Облигации Белагропромбанка", 49.60, -1.39), ("BYN-GB4", "Облигации Минфина IV", 98.90, -0.80)]
    ty = ky + 106
    for col, (title, rows, color, arrow) in enumerate([
            (T("home.up"), up, UP, "▲"), (T("home.down"), down, DOWN, "▼")]):
        x = kx + col * 622
        box_w = 596
        u.text(x, ty, title, size=15, bold=True, fill=color)
        u.rect(x, ty + 12, box_w, 214, fill=WHITE, rx=4)

        def cell(i, j, v, cx, cy2, w, color=color, arrow=arrow):
            if j == 3:
                u.text(cx + w - 12, cy2 + 21, f"{arrow} {pct(v)}", size=13.5,
                       anchor="end", fill=color)
                return True
            if j == 0:
                u.text(cx + 12, cy2 + 21, v, size=13.5, bold=True)
                return True
            return False

        u.table(x, ty + 12, ["Тикер", "Наименование", "Цена", "Изм. за 24 ч, %"], rows,
                [96, 296, 96, 108], row_h=46, size=13, head_size=12,
                aligns=["start", "start", "num", "num"], cell=cell)
    return u


def screen_client_portfolio():
    """«Мои активы» глазами клиента: без выбора клиента, но со сделками."""
    u = Ui()
    y = u.shell(MENU_CLIENT + [(T("m.Help"), "?")], T("m.MyPortfolio"), T("m.MyPortfolio"),
                "БЕЛАРУСБАНК  >  Мои активы", "190456789", "Клиент")
    u.rect(230, y, W - 230, 54, fill=WHITE)
    u.line(230, y + 54, W, y + 54, stroke=LINE)
    x = 250
    for label, kind in [(T("b.Buy"), "primary"), (T("b.Sell"), "danger"),
                        ("Мои предложения", "plain"), ("⤓ Экспорт", "plain")]:
        x += u.button(x, y + 10, label, kind=kind) + 8
    u.button(W - 130, y + 10, T("b.Save"), kind="primary", w=110)
    y += 54
    rows, total, tv = portfolio("190456789")
    box_w = W - 270
    u.rect(250, y + 18, box_w, 44 + 44 * len(rows) + 46, fill=WHITE, rx=4)
    cols = ["Тикер", "Наименование", "Сегмент", "Кол-во", "На продаже", "Цена",
            "Расходы %", "Текущая стоимость", "Текущая доля %", "Целевая доля %",
            "Целевая стоимость", "Сумма к действию"]
    widths = [82, 178, 114, 58, 80, 66, 80, 120, 104, 96, 116, 130]
    data = [[r["Symbol"], r["Name"], r["Segment"], nf(r["Qty"], 0), nf(r["ForSale"], 0),
             nf(r["Price"]), nf(r["ExpenseRatio"]), nf(r["CurrentValue"]),
             nf(r["CurrentPct"]) + "%", nf(r["TargetPct"], 2), nf(r["TargetValue"]),
             nf(abs(r["Amount"]))] for r in rows]

    def cell(i, j, v, cx, cy, w):
        if j == 0:
            u.text(cx + PAD, cy + 22, v, size=13, bold=True, fill=GREEN_D)
            return True
        if j == 1:
            u.text(cx + PAD, cy + 22, ellipsis(v, 12.5, w - 2 * PAD), size=12.5)
            return True
        if j == 9:
            u.rect(cx + PAD, cy + 6, w - 2 * PAD - 6, 26, fill=WHITE, stroke="#cfd8e3", rx=3)
            u.text(cx + w - PAD - 6, cy + 23, v, size=12.5, anchor="end")
            return True
        if j == 11:
            amount = rows[i]["Amount"]
            u.text(cx + w - PAD, cy + 22, ("↑ " if amount > 0 else "↓ ") + v, size=12.5,
                   anchor="end", fill=UP if amount > 0 else DOWN)
            return True
        if j in (7, 8, 10):
            u.text(cx + w - PAD, cy + 22, v, size=12.5, anchor="end")
            return True
        if j in (4, 5, 6):
            u.text(cx + w - PAD, cy + 22, v, size=12.5, anchor="end")
            return True
        return False

    end = u.table(250, y + 18, cols, data, widths, row_h=44, size=12.5, head_h=44,
                  aligns=["start", "start", "start", "num", "num", "num", "num", "num",
                          "num", "num", "num", "num"], cell=cell)
    u.line(250, end, 250 + box_w, end, stroke=LINE)
    u.text(262, end + 28, f"Текущая стоимость: {nf(total)} BYN", size=13.5, bold=True)
    u.text(560, end + 28, f"·  Целевая стоимость: {nf(tv)} BYN", size=13.5, bold=True)
    return u


def screen_offers():
    """«Мои предложения о продаже» — с возможностью отзыва."""
    u = Ui()
    y = u.shell(MENU_CLIENT + [(T("m.Help"), "?")], T("m.MyPortfolio"), T("m.MyPortfolio"),
                "БЕЛАРУСБАНК  >  Мои активы", "190456789", "Клиент")
    bw, bh = 900, 420
    x, y2 = (W - bw) / 2, (H - bh) / 2
    _modal_frame(u, T("offers.title"), bw, bh, None)
    rows = [("PAG-S", "Акции Полесье-Агро", 400, 15.15, "2026-11-21 09:41"),
            ("BNH-B1", "Облигации Белнефтехим-Инвест", 100, 101.28, "2026-11-20 14:05"),
            ("BYN-GB1", "Облигации Минфина", 200, 102.21, "2026-11-19 11:23")]

    def cell(i, j, v, cx, cy, w):
        if j == 0:
            u.text(cx + 12, cy + 22, str(v), size=13.5, bold=True)
            return True
        return False

    u.rect(x + 20, y2 + 70, bw - 40, 40 + 40 * len(rows), fill=WHITE, stroke=LINE, rx=4)
    u.rect(x + 21, y2 + 110, bw - 42, 40, fill="#e9f6f1")
    u.table(x + 20, y2 + 70, [T("col.Symbol"), T("col.Name"), T("col.Qty"), T("col.Price"),
                              T("col.CreatedAt")], rows, [130, 330, 110, 120, 170],
            row_h=40, size=13.5, aligns=["start", "start", "num", "num", "start"], cell=cell)
    u.line(x, y2 + bh - 62, x + bw, y2 + bh - 62, stroke=LINE)
    u.rect(x, y2 + bh - 61, bw, 61, fill="#fbfdfe")
    u.button(x + bw - 300, y2 + bh - 48, T("b.Close"), w=130)
    u.button(x + bw - 160, y2 + bh - 48, T("b.Withdraw"), w=140, kind="danger")
    return u


def screen_desktop():
    """Десктопное окно BankInvest (WinForms): тот же портфель через API."""
    u = Ui()
    # заголовок окна Windows 11
    u.rect(0, 0, W, H, fill="#f0f0f0")
    u.rect(0, 0, W, 36, fill="#fbfbfb")
    u.line(0, 35, W, 35, stroke="#e1e1e1")
    u.text(16, 24, "BankInvest — Инвестиции и ценные бумаги", size=13, fill="#1f1f1f")
    for i, sym in enumerate(["–", "□", "✕"]):
        u.text(W - 130 + i * 44, 24, sym, size=14, anchor="middle", fill="#444444")
    # меню
    u.rect(0, 36, W, 34, fill="#f7f7f7")
    u.line(0, 69, W, 69, stroke="#e6e6e6")
    x = 18
    for label in ["Файл", "Правка", "Вид", "Отчёты", "Сервер", "Справка"]:
        u.text(x, 59, label, size=13.5)
        x += tw(label, 13.5) + 34
    # панель разделов
    u.rect(0, 70, 210, H - 70, fill=WHITE)
    u.line(210, 70, 210, H, stroke="#e6e6e6")
    u.rect(16, 92, 178, 62, fill="#0a7d5a", rx=4)
    u.text(105, 118, "ASB", size=20, anchor="middle", bold=True, fill=WHITE)
    u.text(105, 140, "БЕЛАРУСБАНК", size=11, anchor="middle", fill=WHITE)
    nav = ["Главная", "Клиенты", "Портфели", "Транзакции", "Инвест. проекты",
           "Отчёты", "Сервер", "Справка"]
    y = 176
    for label in nav:
        on = label == "Портфели"
        if on:
            u.rect(8, y - 22, 194, 34, fill="#e8f5ef", rx=3)
            u.rect(8, y - 22, 4, 34, fill="#0a7d5a")
        u.text(22, y, label, size=13.5, bold=on, fill="#12212b" if on else "#2b3946")
        y += 40
    # рабочая область
    cx = 240
    u.text(cx, 108, "Инвестиционный портфель клиента", size=22, bold="600", fill="#1d5c48")
    u.rect(cx, 128, 1120, 96, fill=WHITE, stroke="#dfe6e9", rx=4)
    u.text(cx + 16, 154, "Клиент:", size=13, bold=True)
    u.rect(cx + 80, 138, 250, 30, fill=WHITE, stroke="#c9d3dc", rx=3)
    u.text(cx + 90, 158, "ООО «БелТехСервис»", size=13)
    u.text(cx + 326, 158, "▾", size=11, fill=MUTED)
    bx = cx + 360
    for label, kind in [("Купить", "primary"), ("Продать", "danger"), ("Сохранить", "plain")]:
        bx += u.button(bx, 138, label, kind=kind, h=30, size=13) + 8
    u.text(cx + 16, 194, "Сумма портфеля: 119 540,00 BYN", size=13, bold=True)
    u.text(cx + 250, 194, "Целевая стоимость: 119 540,00 BYN", size=13, bold=True)
    u.text(cx + 520, 194, "Синхронизировано с сервером", size=13, fill=UP, bold=True)
    # таблица портфеля (те же данные и расчёты, что в веб-версии)
    rows, total, tv = portfolio("190456789")
    cols = ["Тикер", "Наименование", "Кол-во", "Цена", "Стоимость",
            "Доля %", "Целевая %", "К действию"]
    widths = [92, 300, 84, 88, 132, 92, 108, 124]
    u.rect(cx, 236, sum(widths), 40 + 40 * len(rows), fill=WHITE, stroke="#dfe6e9", rx=3)
    data = [[r["Symbol"], r["Name"], nf(r["Qty"], 0), nf(r["Price"]),
             nf(r["CurrentValue"]), nf(r["CurrentPct"]), nf(r["TargetPct"]), nf(abs(r["Amount"]))]
            for r in rows]

    def cell(i, j, v, cx2, cy2, w):
        if j == 0:
            u.text(cx2 + PAD, cy2 + 21, v, size=12.5, bold=True, fill="#0a7d5a")
            return True
        if j == 7:
            amount = rows[i]["Amount"]
            u.text(cx2 + w - PAD, cy2 + 21, ("+" if amount > 0 else "−") + v, size=12.5,
                   anchor="end", fill=UP if amount > 0 else DOWN)
            return True
        return False

    u.table(cx, 236, cols, data, widths, row_h=40, size=12.5,
            aligns=["start", "start", "num", "num", "num", "num", "num", "num"], cell=cell)
    # строка состояния
    u.rect(0, H - 30, W, 30, fill="#f3f3f3")
    u.line(0, H - 30, W, H - 30, stroke="#e1e1e1")
    u.text(16, H - 10, "Подключено: http://localhost:8787/api   ·   База: BankInvest (SQL Server)",
           size=12, fill="#4b5a68")
    u.text(W - 250, H - 10, "Пользователь: employee", size=12, fill="#4b5a68")
    return u


def screen_help():
    """Встроенная справка: те же тексты, что в десктопной версии."""
    u = Ui()
    y = u.shell(MENU_STAFF + [(T("m.Help"), "?")], T("m.Help"), T("m.Help"),
                "БЕЛАРУСБАНК  >  Справка", "employee", "Сотрудник")
    topics = [T("m.Home"), T("h.stockTitle"), T("m.Clients"), T("m.Projects"),
              T("m.Portfolio"), T("m.Transactions"), T("m.Reports"), T("h.generalTitle")]
    u.rect(250, y + 18, 300, 44 * len(topics), fill=WHITE, rx=4)
    for i, t in enumerate(topics):
        ly = y + 18 + i * 44
        if i == 4:
            u.rect(250, ly, 300, 44, fill="#eef7f3")
            u.rect(250, ly, 4, 44, fill=GREEN)
        u.text(268, ly + 28, f"{i + 1}. {t}", size=14, bold=(i == 4))
        u.line(250, ly + 44, 550, ly + 44, stroke="#f0f4f8")
    # текст раздела
    px, pw = 570, W - 590
    u.rect(px, y + 18, pw, 520, fill=WHITE, rx=4)
    u.text(px + 28, y + 62, T("m.Portfolio"), size=24, bold="600", fill="#46647e")
    body = T("h.Portfolio").split("\n")
    ly = y + 100
    for par in body:
        if not par.strip():
            ly += 10
            continue
        words, line = par.split(), ""
        for wd in words:
            if len(line + " " + wd) > 86:
                u.text(px + 28, ly, line, size=15, fill="#2c3946")
                ly += 25
                line = wd
            else:
                line = (line + " " + wd).strip()
        if line:
            u.text(px + 28, ly, line, size=15, fill="#2c3946")
            ly += 25
        ly += 12
    u.line(px + 28, y + 490, px + pw - 28, y + 490, stroke=LINE)
    u.button(px + 28, y + 506, "◀ Назад", w=110)
    u.text(px + pw / 2, y + 528, "Страница 5 из 8", size=12, anchor="middle", fill=MUTED)
    u.button(px + pw - 148, y + 506, "Далее ▶", w=120, kind="primary")
    return u


SCREENS = {
    "login": screen_login,
    "register": screen_register,
    "home": screen_home,
    "clients": screen_clients,
    "portfolio": screen_portfolio,
    "buy": screen_buy,
    "sell": screen_sell,
    "stock": screen_stock,
    "transactions": screen_transactions,
    "projects": screen_projects,
    "project_dialog": screen_project_dialog,
    "reports": screen_reports,
    "admin": screen_admin,
    "client_home": screen_client_home,
    "client_portfolio": screen_client_portfolio,
    "offers": screen_offers,
    "desktop": screen_desktop,
    "help": screen_help,
}


def render(name, out_dir):
    """Сохраняет SVG одного экрана и возвращает путь."""
    u = SCREENS[name]()
    path = os.path.join(out_dir, f"screen_{name}.svg")
    head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{u.w}" height="{u.h}" '
            f'viewBox="0 0 {u.w} {u.h}"><rect width="{u.w}" height="{u.h}" fill="{WHITE}"/>')
    open(path, "w", encoding="utf-8").write(head + "\n".join(u.p) + "</svg>")
    return path


def main():
    out = os.path.join(HERE, "shots")
    os.makedirs(out, exist_ok=True)
    for name in SCREENS:
        print("  ✔", os.path.basename(render(name, out)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
