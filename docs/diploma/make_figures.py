#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Простая отрисовка диаграмм UML для самостоятельной работы BankInvest.
Без внешних библиотек: рисуем в SVG вручную, конвертируем в PNG через cairosvg.
Стиль подобран под Word: белый фон, чёрные линии, Times/Arial.
"""
import os, math

FONT = "Arial, Helvetica, sans-serif"
BLACK = "#000000"
WHITE = "#ffffff"
GREY = "#f2f2f2"


class Svg:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.parts = []

    def add(self, s):
        self.parts.append(s)

    def rect(self, x, y, w, h, fill=WHITE, stroke=BLACK, sw=1.4, rx=0, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
                 f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}" rx="{rx}"{d}/>')

    def line(self, x1, y1, x2, y2, sw=1.4, dash=None, arrow=False, start_arrow=False):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{BLACK}" stroke-width="{sw}"{d}/>')
        if arrow:
            self._arrow(x1, y1, x2, y2, solid=False)
        if start_arrow:
            self._arrow(x2, y2, x1, y1, solid=False)

    def _arrow(self, x1, y1, x2, y2, solid=False):
        ang = math.atan2(y2 - y1, x2 - x1)
        L, Wd = 13, 6
        bx, by = x2 - L * math.cos(ang), y2 - L * math.sin(ang)
        p1 = (bx + Wd * math.sin(ang), by - Wd * math.cos(ang))
        p2 = (bx - Wd * math.sin(ang), by + Wd * math.cos(ang))
        if solid:
            self.add(f'<polygon points="{x2:.1f},{y2:.1f} {p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}" '
                     f'fill="{BLACK}" stroke="{BLACK}" stroke-width="1"/>')
        else:
            self.add(f'<polygon points="{x2:.1f},{y2:.1f} {p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}" '
                     f'fill="{WHITE}" stroke="{BLACK}" stroke-width="1.3"/>')

    def diamond(self, x, y, size=7, filled=True):
        self.add(f'<polygon points="{x},{y} {x+size},{y-size} {x+2*size},{y} {x+size},{y+size}" '
                 f'fill="{BLACK if filled else WHITE}" stroke="{BLACK}" stroke-width="1.2"/>')

    def text(self, x, y, s, size=14, anchor="middle", bold=False, italic=False, family=FONT):
        w = ' font-weight="bold"' if bold else ''
        i = ' font-style="italic"' if italic else ''
        s = (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" '
                 f'text-anchor="{anchor}" fill="{BLACK}"{w}{i}>{s}</text>')

    def label(self, x, y, s, size=12, anchor="middle", pad=5):
        """Текст с белой подложкой: не смешивается с линиями жизни и связями."""
        w = self.text_w(s, size) + 2 * pad
        if anchor == "middle":
            x0 = x - w / 2
        elif anchor == "start":
            x0 = x - pad
        else:
            x0 = x - w + pad
        self.add(f'<rect x="{x0:.1f}" y="{y - size:.1f}" width="{w:.1f}" '
                 f'height="{size + 7}" fill="{WHITE}"/>')
        self.text(x, y, s, size=size, anchor=anchor)

    def lines(self, x, y, arr, size=13, anchor="middle", lh=17, **kw):
        """Многострочный текст: arr — список строк или строк (перенос по \\n)."""
        if isinstance(arr, str):
            arr = arr.split("\n")
        for n, line in enumerate(arr):
            self.text(x, y + n * lh, line, size=size, anchor=anchor, **kw)
        return y + (len(arr) - 1) * lh

    def ellipse(self, cx, cy, rx, ry, fill=WHITE, sw=1.4, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        self.add(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{fill}" '
                 f'stroke="{BLACK}" stroke-width="{sw}"{d}/>')

    def poly(self, pts, fill=WHITE, sw=1.4, dash=None):
        p = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
        d = f' stroke-dasharray="{dash}"' if dash else ''
        self.add(f'<polygon points="{p}" fill="{fill}" stroke="{BLACK}" stroke-width="{sw}"{d}/>')

    def path(self, d, sw=1.4, dash=None, arrow=False):
        dash_attr = f' stroke-dasharray="{dash}"' if dash else ''
        self.add(f'<path d="{d}" fill="none" stroke="{BLACK}" stroke-width="{sw}"{dash_attr}/>')

    def text_w(self, s, size=14, bold=False):
        """Грубая оценка ширины строки (для центрирования в прямоугольниках)."""
        k = 0.58 if not bold else 0.62
        return len(s) * size * k

    def svg(self):
        head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" '
                f'viewBox="0 0 {self.w} {self.h}">'
                f'<rect width="{self.w}" height="{self.h}" fill="{WHITE}"/>')
        return head + '\n'.join(self.parts) + '</svg>'


# ---------------------------------------------------------------- варианты использования
def use_case_diagram(path):
    """Диаграмма вариантов использования.

    Две колонки вариантов внутри границы системы: слева — клиентские,
    справа — сотрудника и администратора. Тогда связи актёров идут веером
    в своей половине и не пересекают эллипсы другой половины.
    """
    W, H = 1250, 1190
    s = Svg(W, H)

    s.rect(340, 40, 620, 1080, fill="#fcfcfc", dash="7,5")
    s.text(650, 72, "Сетевая программная система управления", size=17, bold=True)
    s.text(650, 96, "инвестициями и ценными бумагами банка", size=16, bold=True)

    def actor(x, y, label, sub=""):
        s.ellipse(x, y, 16, 19)
        s.line(x, y + 19, x, y + 66)
        s.line(x - 28, y + 34, x + 28, y + 34)
        s.line(x, y + 66, x - 21, y + 102)
        s.line(x, y + 66, x + 21, y + 102)
        s.text(x, y + 126, label, size=14, bold=True)
        if sub:
            s.text(x, y + 145, sub, size=12, italic=True)

    LX, RX = 470, 810          # центры колонок
    R = 118                    # радиус эллипса

    client_cases = [
        (170, ["Войти в систему"]),
        (290, ["Зарегистрировать", "компанию или физлицо"]),
        (410, ["Просмотреть свои активы,", "доли и доходность"]),
        (530, ["Купить бумаги", "по предложению"]),
        (650, ["Продать бумаги:", "выставить предложение"]),
        (770, ["Отозвать свое", "предложение"]),
        (890, ["Задать целевые доли", "портфеля"]),
    ]
    staff_cases = [
        (170, ["Управлять выпусками", "бумаг и эмитентами"]),
        (290, ["Публиковать цены", "и обновлять рынок"]),
        (410, ["Вести портфели", "клиентов банка"]),
        (530, ["Добавить актив", "на счет депо"]),
        (650, ["Смотреть журнал", "сделок и операций"]),
    ]
    admin_cases = [
        (890, ["Управлять учетными", "записями"]),
        (1010, ["Смотреть журнал", "действий (AuditLog)"]),
    ]

    def draw_case(cx, y, lines):
        h = 74 if len(lines) > 1 else 54
        s.ellipse(cx, y, R, h / 2, fill=WHITE)
        s.lines(cx, y - (len(lines) - 1) * 9, lines, size=13, lh=18)

    for y, lines in client_cases:
        draw_case(LX, y, lines)
    for y, lines in staff_cases:
        draw_case(RX, y, lines)
    for y, lines in admin_cases:
        draw_case(RX, y, lines)

    actor(95, 400, "Клиент", "(инвестор)")
    actor(1155, 400, "Сотрудник банка", "(Employee)")
    actor(1155, 960, "Администратор", "(Admin)")

    # клиент: веер к левым краям эллипсов левой колонки
    for y, _ in client_cases:
        s.line(130, 374, LX - R - 6, y)
    # сотрудник: веер к правым краям правой колонки
    for y, _ in staff_cases:
        s.line(1120, 374, RX + R + 6, y)
    # администратор
    for y, _ in admin_cases:
        s.line(1120, 934, RX + R + 6, y)

    # включение вариантов (пунктир в зазоре между колонками, эллипсы не задевает)
    s.path(f'M {LX+R} 530 L 655 530 L 655 170 L {LX+R+2} 170', dash="5,4")
    s._arrow(0, 0, 0, 0)
    s.add(f'<polygon points="{LX+R},170 {LX+R+13},165 {LX+R+13},175" fill="{WHITE}" '
          f'stroke="{BLACK}" stroke-width="1.2"/>')
    s.path(f'M {LX+R} 650 L 672 650 L 672 770 L {LX+R+2} 770', dash="5,4")
    s.add(f'<polygon points="{LX+R},770 {LX+R+13},765 {LX+R+13},775" fill="{WHITE}" '
          f'stroke="{BLACK}" stroke-width="1.2"/>')
    # сотрудник: «добавить актив» входит в «вести портфели»
    s.path(f'M {RX+R} 530 L 985 530 L 985 410 L {RX+R+2} 410', dash="5,4")
    s.add(f'<polygon points="{RX+R},410 {RX+R+13},405 {RX+R+13},415" fill="{WHITE}" '
          f'stroke="{BLACK}" stroke-width="1.2"/>')

    s.text(650, 1160, "Пунктир — отношение включения (include)", size=12, italic=True)
    open(path, 'w', encoding='utf-8').write(s.svg())


# ---------------------------------------------------------------- диаграмма классов
def class_diagram(path):
    """Диаграмма классов: 4 колонки с зазорами, связи идут по зазорам и не заходят в блоки."""
    s = Svg(1560, 1080)

    CW = 330                      # ширина класса
    COLS = [30, 419, 808, 1197]   # левые края колонок (зазор 59)
    GAP = 59

    def cls(col, y, name, attrs, ops, sub=None):
        x = COLS[col]
        head = 40
        attr_h = 17 * len(attrs)
        op_h = 17 * len(ops)
        h = head + 24 + attr_h + 14 + op_h + 12
        s.rect(x, y, CW, h, fill=WHITE)
        s.line(x, y + head, x + CW, y + head)          # под заголовком
        div2 = y + head + 24 + attr_h + 6
        s.line(x, div2, x + CW, div2)                  # между атрибутами и методами
        s.text(x + CW / 2, y + 26, name, size=15, bold=True)
        yy = y + head + 18
        for a in attrs:
            s.text(x + 10, yy, a, size=12, anchor="start")
            yy += 17
        yy = div2 + 19
        for o in ops:
            s.text(x + 10, yy, o, size=12, anchor="start")
            yy += 17
        return {"col": col, "x": x, "y": y, "w": CW, "h": h}

    #                 col  y    имя                 атрибуты                          методы
    clients = cls(0,  60,  "Clients",           ["Id, Name, UNP", "Kind, Status",
                                                  "Address, Contacts"], ["AddClient()", "DeleteClient()"])
    depo    = cls(0, 300,  "DepoAccounts",      ["Id, ClientId, Number"], ["DepoOf()"])
    users   = cls(0, 470,  "Users",             ["Id, CompanyId, Login", "PasswordHash, Role",
                                                  "ClientId, IsActive"], ["Hash()", "CheckPassword()"])
    iss     = cls(1,  60,  "Issuers",           ["Id, Name, Country"], ["AddIssuer()"])
    sec     = cls(1,  250, "Securities",        ["Id, Symbol, Name", "Kind, Segment, Nominal",
                                                  "Price, PrevPrice, Status"], ["Publish()", "SetPrice()"])
    hold    = cls(1,  530, "Holdings",          ["DepoAccountId, SecurityId", "Quantity",
                                                  "Reserved"], ["Reserved()"])
    lst     = cls(2,  60,  "Listings",          ["Id, SellerClientId", "SecurityId, Quantity",
                                                  "Price, Status"], ["usp_BuyListing()", "Withdraw()"])
    tr      = cls(2,  300, "Transactions",      ["Id, DepoAccountId, Type", "Quantity, Price",
                                                  "Commission, Status, Date"], ["Report()", "TopSecurities()"])
    ph      = cls(2,  545, "PriceHistory",      ["SecurityId, Price", "ChangedAt"], ["usp_UpdatePrices()"])
    aud     = cls(3,  60,  "AuditLog",          ["Id, UserId, Action", "CreatedAt"], ["audit()"])
    proj    = cls(3,  215, "InvestmentProjects",["Id, Name, Rate", "Flows"], ["NPV()", "IRR()", "PI()"])
    cert    = cls(3,  420, "DepositCertificates",["Id, ClientId, Amount", "Rate, OpenedAt"], ["Income()"])
    sess    = cls(3,  600, "Sessions",          ["Token, UserId, Login", "Role, Lang, SeenAt"], ["readToken()", "logout()"])

    def right(c):  return (c["x"] + c["w"], c["y"] + c["h"] / 2)
    def left(c):   return (c["x"], c["y"] + c["h"] / 2)
    def bottom(c): return (c["x"] + c["w"] / 2, c["y"] + c["h"])
    def top(c):    return (c["x"] + c["w"] / 2, c["y"])

    def hlink(a, b, label=""):
        """Горизонтальная связь через зазор между колонками (одна ортогональная ступень)."""
        x1, y1 = right(a); x2, y2 = left(b)
        mx = x1 + GAP / 2
        s.path(f'M {x1} {y1} L {mx} {y1} L {mx} {y2} L {x2} {y2}')
        if label:
            s.text(x2 - 6, y2 - 7, label, size=11, anchor="end")

    def vlink(a, b, label="1..*"):
        """Вертикальная связь внутри колонки."""
        x1, y1 = bottom(a); x2, y2 = top(b)
        s.line(x1, y1, x2, y2)
        if label:
            s.text(x1 + 10, (y1 + y2) / 2 + 4, label, size=11, anchor="start")

    def dashlink(a, b, label=""):
        """Пунктир — зависимость между колонками (по нижнему/верхнему зазору)."""
        x1, y1 = right(a); x2, y2 = left(b)
        mx = x1 + GAP / 2
        s.path(f'M {x1} {y1} L {mx} {y1} L {mx} {y2} L {x2} {y2}', dash="5,4")
        if label:
            s.text(mx, min(y1, y2) - 8, label, size=11)

    vlink(clients, depo, "1..1")
    vlink(depo, users, "")
    vlink(iss, sec, "1..*")
    vlink(lst, tr, "")
    vlink(tr, ph, "")
    vlink(aud, proj, "")
    vlink(proj, cert, "")
    vlink(cert, sess, "")

    hlink(clients, sec)
    hlink(depo, hold, "1..*")
    hlink(users, lst)
    hlink(hold, lst, "1..*")
    hlink(lst, aud)

    dashlink(sec, hold)
    dashlink(users, sess)
    dashlink(ph, aud)

    s.text(780, 1040, "Связи 1..* — «один ко многим»; пунктир — зависимость (вызов, запись в журнал)",
           size=12, italic=True)
    open(path, 'w', encoding='utf-8').write(s.svg())


# ---------------------------------------------------------------- последовательность
def sequence_diagram(path, title_steps):
    """Диаграмма последовательности «Покупка бумаги по предложению»."""
    W = 1580
    s = Svg(W, 880)
    actors = [("Клиент", 120), ("Веб-интерфейс", 400), ("API сервера", 690),
              ("TradeService", 950), ("SQL Server", 1250)]
    xmap = dict(actors)
    for name, x in actors:
        w = max(150, s.text_w(name, 14) + 40)
        s.rect(x - w / 2, 24, w, 48, fill=GREY)
        s.text(x, 55, name, size=14, bold=True)
        s.line(x, 72, x, 860, dash="7,6")

    y = 110
    for step in title_steps:
        kind, a, b, label = step
        xa = xmap[a]
        if kind == "self":
            # петля вправо, подпись под ней с подложкой
            s.path(f'M {xa} {y} L {xa+58} {y} L {xa+58} {y+30} L {xa+4} {y+30}')
            s.add(f'<polygon points="{xa+2},{y+30} {xa+15},{y+25} {xa+15},{y+35}" fill="{BLACK}"/>')
            s.label(xa + 70, y + 34, label, size=12, anchor="start")
            y += 62
            continue
        xb = xmap[b]
        dashed = "7,5" if kind == "return" else None
        s.line(xa, y, xb, y, arrow=True, dash=dashed)
        s.label((xa + xb) / 2, y - 9, label, size=12)
        y += 54
    open(path, 'w', encoding='utf-8').write(s.svg())


# ---------------------------------------------------------------- кооперация
def collaboration_diagram(path):
    """Диаграмма кооперации «Покупка бумаги по предложению».

    Объекты стоят прямоугольной сеткой, связи идут по прямым между краями
    блоков, номера сообщений — с белой подложкой, чтобы не сливались с линиями.
    """
    s = Svg(1500, 1060)

    BW, BH = 300, 84

    def obj(cx, cy, line1, line2):
        s.rect(cx - BW / 2, cy - BH / 2, BW, BH, fill=WHITE)
        s.text(cx, cy - 6, line1, size=14, bold=True)
        s.text(cx, cy + 18, line2, size=12, italic=True)
        return {"cx": cx, "cy": cy, "x": cx - BW / 2, "y": cy - BH / 2}

    a = obj(250, 110, "1: Клиент (браузер)", ": MyPortfolioView")
    b = obj(750, 110, "2: Веб-интерфейс", ": app.js (fetch)")
    c = obj(1250, 110, "3: API сервера", ": /api/trade/buy")
    d = obj(1250, 420, "4: TradeService", ": logic.buy()")
    e = obj(750, 420, "5: Хранилище", ": db.js (mssql)")
    f = obj(250, 420, "6: Процедура", ": usp_BuyListing")
    g = obj(750, 760, "7: Журнал действий", ": AuditLog")
    h = obj(1250, 760, "8: Портфель клиента", ": Holdings / Depos")

    def msg(p1, p2, num, text, side1="right", side2="left", dy1=0, dy2=0):
        """Прямая связь между краями двух блоков + подпись с подложкой."""
        x1 = p1["x"] + BW if side1 == "right" else p1["x"]
        x2 = p2["x"] + BW if side2 == "right" else p2["x"]
        y1, y2 = p1["cy"] + dy1, p2["cy"] + dy2
        s.line(x1, y1, x2, y2)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        s.label(mx, my - 10, num, size=13)
        s.label(mx, my + 10, text, size=11)

    # 1 -> 2: клиент выбирает предложение
    s.line(a["x"] + BW, 110, b["x"], 110)
    s.label(500, 96, "1: buy(listingId, qty)", size=12)
    # 2 -> 3: запрос
    s.line(b["x"] + BW, 110, c["x"], 110)
    s.label(1000, 96, "2: POST /api/trade/buy", size=12)
    # 3 -> 4: проверка сессии и вызов
    s.line(1250, 152, 1250, 378)
    s.label(1262, 250, "3: readToken() → buy()", size=12, anchor="start")
    # 4 -> 5: EXEC
    s.line(d["x"], 420, e["x"] + BW, 420)
    s.label(1000, 406, "4: EXEC usp_BuyListing", size=12)
    # 5 -> 6: транзакция
    s.line(e["x"], 420, f["x"] + BW, 420)
    s.label(500, 406, "4.1: одна транзакция", size=12)
    # 6 -> 8: результат в портфель (по правому краю, через зазор между рядами)
    s.path(f'M {f["x"]+BW/2} {f["y"]+BH} L {f["x"]+BW/2} 620 L {h["x"]+BW/2} 620 L {h["x"]+BW/2} {h["y"]}')
    s.label(1000, 606, "4.2: списание / зачисление", size=12)
    # 5 -> 7: журнал
    s.line(750, 462, 750, 718)
    s.label(762, 590, "5: audit()", size=12, anchor="start")
    # 4 -> 3: ответ
    s.path(f'M {d["x"]+BW} {d["cy"]} L 1420 420 L 1420 200 L {c["x"]+BW} 200 L {c["x"]+BW} 152')
    s.label(1300, 190, "6: ok + новая позиция", size=12, anchor="start")

    s.text(750, 1000, "Номер 4.1 — вложенный вызов внутри сообщения 4; нумерация по уровням вложенности",
           size=12, italic=True)
    open(path, 'w', encoding='utf-8').write(s.svg())


# ---------------------------------------------------------------- состояния
def state_diagram(path):
    """Два жизненных цикла: выпуск бумаги (сверху) и предложение о продаже (снизу)."""
    s = Svg(1400, 760)

    def st(cx, cy, text, w=220, h=66):
        s.rect(cx - w / 2, cy - h / 2, w, h, rx=30, fill=WHITE)
        s.text(cx, cy + 5, text, size=14)
        return {"cx": cx, "cy": cy, "w": w, "h": h}

    # --- выпуск ценной бумаги
    s.text(700, 60, "Жизненный цикл выпуска ценной бумаги", size=15, bold=True)
    s.add(f'<circle cx="70" cy="150" r="9" fill="{BLACK}"/>')
    a = st(240, 150, "Черновик")
    b = st(560, 150, "На регистрации")
    c = st(880, 150, "Зарегистрирован")
    d = st(1200, 150, "Размещен")
    s.line(79, 150, a["cx"] - a["w"] / 2, 150, arrow=True)
    for p1, p2, label in ((a, b, "отправить"), (b, c, "одобрить"), (c, d, "разместить")):
        x1 = p1["cx"] + p1["w"] / 2
        x2 = p2["cx"] - p2["w"] / 2
        s.line(x1, 150, x2, 150, arrow=True)
        s.label((x1 + x2) / 2, 136, label, size=11)
    # возврат на доработку
    s.path(f'M {c["cx"]} {c["cy"]-c["h"]/2} L {c["cx"]} 104 L {b["cx"]+40} 104 L {b["cx"]+40} {b["cy"]-b["h"]/2}', arrow=True)
    # конец
    s.add(f'<circle cx="1320" cy="150" r="12" fill="none" stroke="{BLACK}" stroke-width="1.6"/>')
    s.add(f'<circle cx="1329" cy="159" r="7" fill="{BLACK}"/>')
    s.line(d["cx"] + d["w"] / 2, 150, 1307, 150, arrow=True)

    # --- предложение о продаже
    s.text(700, 300, "Жизненный цикл предложения о продаже", size=15, bold=True)
    s.add(f'<circle cx="70" cy="420" r="9" fill="{BLACK}"/>')
    e = st(250, 420, "Активно")
    f = st(620, 420, "Частично продано", w=240)
    g = st(1000, 420, "Продано")
    h = st(1000, 600, "Отозвано")
    s.line(79, 420, e["cx"] - e["w"] / 2, 420, arrow=True)
    x1 = e["cx"] + e["w"] / 2
    s.line(x1, 420, f["cx"] - f["w"] / 2, 420, arrow=True)
    s.label((x1 + f["cx"] - f["w"] / 2) / 2, 406, "куплено частично", size=11)
    x2 = f["cx"] + f["w"] / 2
    s.line(x2, 420, g["cx"] - g["w"] / 2, 420, arrow=True)
    s.label((x2 + g["cx"] - g["w"] / 2) / 2, 406, "Quantity = 0", size=11)
    # отзыв: из «Активно» и из «Частично продано» в «Отозвано»
    s.path(f'M {e["cx"]} {e["cy"]+e["h"]/2} L {e["cx"]} 540 L {h["cx"]} 540 L {h["cx"]} {h["cy"]-h["h"]/2}')
    s.label(620, 532, "продавец отозвал остаток", size=11)
    s.path(f'M {f["cx"]} {f["cy"]+f["h"]/2} L {f["cx"]} 505 L {h["cx"]-160} 505 L {h["cx"]-160} {h["cy"]-h["h"]/2}', arrow=True)
    s.label(860, 498, "отозвано до продажи остатка", size=11)
    # конец для «Продано»
    s.add(f'<circle cx="1200" cy="420" r="12" fill="none" stroke="{BLACK}" stroke-width="1.6"/>')
    s.add(f'<circle cx="1209" cy="429" r="7" fill="{BLACK}"/>')
    s.line(g["cx"] + g["w"] / 2, 420, 1187, 420, arrow=True)

    s.text(700, 715, "Переходы проверяются на сервере: смена статуса пишется в AuditLog",
           size=12, italic=True)
    open(path, 'w', encoding='utf-8').write(s.svg())


# ---------------------------------------------------------------- деятельность
def activity_diagram(path):
    """Диаграмма деятельности «Покупка бумаг по предложению» с дорожками."""
    s = Svg(1240, 1010)

    lanes = [("Клиент", 30, 300), ("Веб-интерфейс", 350, 330), ("Сервер / SQL Server", 700, 470)]
    for name, x, w in lanes:
        s.rect(x, 30, w, 940, fill=WHITE, dash="6,4")
        s.rect(x, 30, w, 44, fill=GREY)
        s.text(x + w / 2, 58, name, size=15, bold=True)

    def step(x, y, w, lines, h=54):
        s.rect(x, y, w, h, rx=8, fill=WHITE)
        s.lines(x + w / 2, y + 21, lines, size=12, lh=16)
        return {"cx": x + w / 2, "x": x, "y": y, "w": w, "h": h}

    def down(a, b, label=""):
        """Соединить низ a с верхом b вертикально (одна колонка)."""
        s.line(a["cx"], a["y"] + a["h"], b["cx"], b["y"], arrow=True)
        if label:
            s.text(a["cx"] + 10, (a["y"] + a["h"] + b["y"]) / 2 + 4, label, size=12, anchor="start")

    def across(a, b, label=""):
        """Соединить правый край a с левым краем b по горизонтали."""
        y = a["y"] + a["h"] / 2
        s.line(a["x"] + a["w"], y, b["x"], b["y"] + b["h"] / 2, arrow=True)
        if label:
            s.text((a["x"] + a["w"] + b["x"]) / 2, y - 8, label, size=12)

    # 1. старт
    s.add(f'<circle cx="180" cy="112" r="10" fill="{BLACK}"/>')
    a1 = step(70, 150, 220, ["Выбрать бумагу", "и количество"])
    s.line(180, 122, 180, 148, arrow=True)

    # 2. веб: показать предложения
    a2 = step(390, 150, 250, ["Показать предложения", "продавцов"])
    across(a1, a2)

    # 3. решение
    s.line(515, 204, 515, 240, arrow=True)
    s.poly([(515, 245), (655, 310), (515, 375), (375, 310)], fill=WHITE)
    s.lines(515, 296, ["Хватает бумаг", "на счете депо?"], size=12, lh=16)

    # 4. нет -> сообщение (в дорожке сервера) -> конец
    a3 = step(740, 285, 400, ["Сообщить «Недостаточно бумаг»", "и не менять данные"])
    s.line(651, 310, 736, 310, arrow=True)
    s.text(700, 296, "нет", size=12, italic=True)

    end_x, end_y = 180, 900
    # путь «нет»: из блока сообщения вниз и влево, к тому же терминатору
    s.path(f'M 740 312 L 700 312 L 700 560 L 180 560 L 180 800', arrow=False)
    s.add(f'<polygon points="180,810 175,797 185,797" fill="{BLACK}"/>')

    # 5. да -> EXEC
    s.line(515, 375, 515, 410, arrow=True)
    s.text(500, 396, "да", size=12, italic=True, anchor="end")
    a4 = step(740, 425, 400, ["EXEC usp_BuyListing @ListingId,", "@BuyerId, @Qty — одна транзакция"])
    s.path(f'M 515 410 L 515 452 L 736 452', arrow=True)

    # 6. блок «внутри процедуры»
    s.rect(740, 496, 400, 214, fill=GREY, dash="4,3")
    s.text(940, 518, "Что делает процедура", size=13, bold=True)
    inner = ["UPDLOCK, HOLDLOCK на Listings;",
             "проверки: не свой оффер, @Qty <= Quantity;",
             "списание с депо продавца;",
             "зачисление на депо покупателя;",
             "уменьшение Quantity, статус «Продано»;",
             "две записи в Transactions, комиссия 0,5 %;",
             "COMMIT, при любой ошибке — ROLLBACK."]
    for i, t in enumerate(inner):
        s.text(760, 546 + i * 22, "• " + t, size=12, anchor="start")
    s.line(940, 479, 940, 488, arrow=True)

    # 7. журнал + ответ
    a5 = step(740, 730, 400, ["Записать действие в AuditLog", "и вернуть результат клиенту"])
    s.line(940, 710, 940, 730, arrow=True)

    # 8. клиент видит результат
    a6 = step(70, 730, 220, ["Увидеть обновленный", "портфель и доли"])
    s.line(738, 757, 292, 757, arrow=True)

    # 9. конец
    s.add(f'<circle cx="{end_x}" cy="{end_y}" r="13" fill="none" stroke="{BLACK}" stroke-width="1.6"/>')
    s.add(f'<circle cx="{end_x + 8}" cy="{end_y + 8}" r="8" fill="{BLACK}"/>')
    s.line(end_x, a6["y"] + a6["h"], end_x, end_y - 14, arrow=True)

    open(path, 'w', encoding='utf-8').write(s.svg())


# ---------------------------------------------------------------- компоненты
def component_diagram(path):
    """Диаграмма компонентов: клиенты -> API -> логика -> данные -> SQL Server."""
    s = Svg(1400, 1010)

    def comp(x, y, w, h, name, sub):
        s.rect(x, y, w, h, fill=WHITE)
        s.rect(x + 16, y + 14, 24, 16, fill=WHITE)
        s.rect(x + 26, y + 7, 16, 30, fill=WHITE)
        s.text(x + w / 2, y + h / 2 - 2, name, size=14, bold=True)
        s.text(x + w / 2, y + h / 2 + 20, sub, size=11, italic=True)
        return {"x": x, "y": y, "w": w, "h": h, "cx": x + w / 2, "cy": y + h / 2}

    # 1-й ряд: клиенты
    web = comp(70, 60, 330, 96, "Веб-клиент", "server/web: app.js, index.html")
    dsk = comp(1000, 60, 330, 96, "Десктоп WPF", "BankInvest.exe (.NET 8)")

    # 2-й ряд: шлюз API
    api = comp(470, 250, 460, 100, "Сервер приложения", "server.js: маршруты /api/*, статика web/")

    # 3-й ряд: логика и доступ к данным
    log = comp(120, 430, 420, 96, "Бизнес-логика", "logic.js: buy / sell / portfolio / report")
    acc = comp(860, 430, 420, 96, "Слой доступа к данным", "db.js: query / exec / tx (mssql)")

    # 4-й ряд: база данных
    db = comp(470, 620, 460, 100, "База данных SQL Server", "BankInvest: 13 таблиц, 2 процедуры")

    # 5-й ряд: вспомогательные компоненты
    aud = comp(120, 810, 420, 96, "Журнал действий", "AuditLog: кто, что и когда сделал")
    fil = comp(860, 810, 420, 96, "Скрипты развертывания", "schema.sql, seed.sql, db-init.js")

    # интерфейсы — на линиях, подписи в стороне от блоков
    def port(x, y, label, anchor="middle", dx=16, above=False):
        s.add(f'<circle cx="{x}" cy="{y}" r="9" fill="{WHITE}" stroke="{BLACK}" stroke-width="1.4"/>')
        if not label:
            return
        if anchor == "start":
            s.label(x + dx, y + (14 if above else 4), label, size=11, anchor="start")
        else:
            s.label(x, y - 16, label, size=11)

    # клиент -> API
    s.path(f'M {web["cx"]} {web["y"]+web["h"]} L {web["cx"]} 180 L {api["cx"]-90} 180 L {api["cx"]-90} {api["y"]}', arrow=True)
    port(web["cx"] + 11, 150, "HTTP / JSON запросы", anchor="start", dx=18, above=True)
    s.path(f'M {dsk["cx"]} {dsk["y"]+dsk["h"]} L {dsk["cx"]} 180 L {api["cx"]+90} 180 L {api["cx"]+90} {api["y"]}', arrow=True)
    port(dsk["cx"] - 11, 150, "тот же REST API", anchor="start", dx=-300, above=True)

    # API -> логика
    s.path(f'M {api["cx"]-110} {api["y"]+api["h"]} L {api["cx"]-110} 395 L {log["cx"]} 395 L {log["cx"]} {log["y"]}', arrow=True)
    port(api["cx"] - 122, 385, "вызов функции", anchor="start")
    # API -> доступ к данным
    s.path(f'M {api["cx"]+110} {api["y"]+api["h"]} L {api["cx"]+110} 395 L {acc["cx"]} 395 L {acc["cx"]} {acc["y"]}', arrow=True)
    port(acc["cx"] - 100, 385, "", anchor="start")

    # логика <-> доступ (зависимость)
    s.line(log["x"] + log["w"], 478, acc["x"], 478, arrow=True, dash="6,4")
    s.label(700, 464, "сервисы вызывают db.js", size=11)

    # доступ -> БД
    s.path(f'M {acc["cx"]-120} {acc["y"]+acc["h"]} L {acc["cx"]-120} 580 L {db["cx"]} 580 L {db["cx"]} {db["y"]}', arrow=True)
    port(db["cx"] + 12, 585, "TDS / TCP 1433", anchor="start")

    # БД -> журнал и скрипты
    s.path(f'M {db["cx"]-110} {db["y"]+db["h"]} L {db["cx"]-110} 760 L {aud["cx"]} 760 L {aud["cx"]} {aud["y"]}', arrow=True)
    s.path(f'M {db["cx"]+110} {db["y"]+db["h"]} L {db["cx"]+110} 760 L {fil["cx"]} 760 L {fil["cx"]} {fil["y"]}', arrow=True)

    s.text(700, 975, "Оба клиента работают только через API: прямого доступа к базе у них нет",
           size=12, italic=True)
    open(path, 'w', encoding='utf-8').write(s.svg())


# ---------------------------------------------------------------- размещение
def deployment_diagram(path):
    s = Svg(1200, 720)

    def node(x, y, w, h, name, sub=""):
        s.rect(x, y, w, h, fill=WHITE)
        # «3D» верх
        s.poly([(x, y), (x + 16, y - 16), (x + w + 16, y - 16), (x + w, y)], fill=GREY)
        s.poly([(x + w, y), (x + w + 16, y - 16), (x + w + 16, y + h - 16), (x + w, y + h)], fill=GREY)
        s.text(x + w / 2, y + 28, name, size=15, bold=True)
        if sub:
            s.lines(x + w / 2, y + 52, sub.split("\n"), size=12)

    node(60, 120, 300, 150, "Рабочие места сотрудников",
         "браузер (веб-версия)\nWPF-приложение (десктоп)\nWindows 10/11 + .NET 8")
    node(450, 120, 260, 150, "Коммутатор ЛВС", "локальная сеть банка\nпорт 8787 (HTTP API)")
    node(800, 120, 300, 170, "Сервер приложений",
         "Node.js 22\nserver.js (/api/*)\nстатические файлы web/")
    node(800, 400, 300, 170, "Сервер базы данных",
         "SQL Server 2022/2025\nБД BankInvest\nTCP 1433")
    node(120, 450, 280, 130, "Резервные копии", ".bak / db-restore\nкаталог Backup")

    s.line(360, 195, 446, 195, arrow=True)
    s.label(403, 182, "HTTP", size=11)
    s.line(710, 195, 796, 195, arrow=True)
    s.label(753, 182, "HTTP", size=11)
    s.line(950, 290, 950, 397, arrow=True)
    s.label(962, 350, "TDS / TCP 1433", size=12, anchor="start")
    s.line(398, 515, 797, 470, arrow=True)
    s.label(600, 480, "RESTORE / BACKUP", size=11)
    s.text(600, 680, "Сервер и база могут быть на одном компьютере или в контейнерах Docker", size=12, italic=True)
    open(path, 'w', encoding='utf-8').write(s.svg())


if __name__ == '__main__':
    out = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(out, exist_ok=True)
    use_case_diagram(os.path.join(out, 'fig_2_1_use_case.svg'))
    sequence_diagram(os.path.join(out, 'fig_2_2_sequence.svg'), [
        ("call", "Клиент", "Веб-интерфейс", "выбрать предложение"),
        ("call", "Веб-интерфейс", "API сервера", "POST /api/trade/buy"),
        ("call", "API сервера", "API сервера", "readToken()"),
        ("return", "API сервера", "API сервера", "сессия найдена"),
        ("call", "API сервера", "TradeService", "buy(listingId, qty)"),
        ("call", "TradeService", "SQL Server", "EXEC usp_BuyListing"),
        ("self", "SQL Server", None, "проверки и транзакция"),
        ("return", "SQL Server", "TradeService", "комиссия, 2 транзакции"),
        ("call", "TradeService", "SQL Server", "INSERT AuditLog"),
        ("return", "TradeService", "API сервера", "ok + новая позиция"),
        ("return", "API сервера", "Веб-интерфейс", "200 {ok:true}"),
        ("return", "Веб-интерфейс", "Клиент", "обновленный портфель"),
    ])
    collaboration_diagram(os.path.join(out, 'fig_2_4_collaboration.svg'))
    class_diagram(os.path.join(out, 'fig_2_5_classes.svg'))
    state_diagram(os.path.join(out, 'fig_2_6_states.svg'))
    activity_diagram(os.path.join(out, 'fig_2_7_activity.svg'))
    component_diagram(os.path.join(out, 'fig_2_8_components.svg'))
    deployment_diagram(os.path.join(out, 'fig_2_9_deployment.svg'))
    print("SVG готовы:", sorted(f for f in os.listdir(out) if f.endswith('.svg')))
