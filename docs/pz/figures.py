#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Диаграммы пояснительной записки BankInvest.

Часть диаграмм (варианты использования, классы, последовательность, кооперация,
состояния, деятельность, компоненты, размещение) уже построена для предыдущей
работы — они переиспользуются из docs/diploma/make_figures.py с небольшими
поправками под текущий текст. Здесь добавлены новые:

  * инфологическая модель (сущности и связи);
  * даталогическая модель (таблицы с ключами и типами);
  * варианты использования по ролям;
  * схемы алгоритмов покупки, продажи, авторизации, добавления пользователя
    и добавления выпуска ценных бумаг.

Отрисовка — в SVG тем же примитивным набором, что и раньше (Svg из
make_figures.py), затем SVG превращается в PNG конвейером svg2png.py.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "diploma"))

from make_figures import Svg, BLACK, WHITE, GREY          # noqa: E402

GREY2 = "#eceff2"
BLUE_L = "#e8f1f8"
GREEN_L = "#e8f5ef"


# ---------------------------------------------------------------- инфологическая модель
def er_model(path):
    """Инфологическая модель (нотация Чена): сущности, связи, кардинальность."""
    s = Svg(1600, 820)
    s.text(800, 46, "Инфологическая модель предметной области", size=17, bold=True)

    EW, EH = 240, 66

    def ent(cx, cy, name):
        s.rect(cx - EW / 2, cy - EH / 2, EW, EH, fill=WHITE, sw=1.3)
        s.text(cx, cy + 6, name, size=15, bold=True)

    def dia(cx, cy, name, w=132, h=64):
        s.poly([(cx, cy - h / 2), (cx + w / 2, cy), (cx, cy + h / 2), (cx - w / 2, cy)],
               fill=GREY2)
        s.text(cx, cy + 5, name, size=13)

    def card(x, y, text_):
        s.label(x, y, text_, size=13)

    def vlink(x, y1, y2, word, c1, c2):
        """Вертикальная связь: линия — ромб — линия, кардинальность у концов."""
        my = (y1 + y2) / 2
        s.line(x, y1, x, my - 32)
        s.line(x, my + 32, x, y2)
        dia(x, my, word)
        card(x + 20, y1 + 28, c1)
        card(x + 20, y2 - 10, c2)

    # левая половина: клиент, счёт депо, учётная запись, позиция портфеля
    ent(160, 150, "Клиент")
    ent(160, 420, "Учётная запись")
    vlink(160, 183, 387, "владеет", "1", "N")

    ent(620, 150, "Счёт депо")
    ent(620, 420, "Позиция портфеля")
    vlink(620, 183, 387, "содержит", "1", "N")

    # клиент — счёт депо по горизонтали
    dia(390, 150, "имеет", w=112)
    s.line(280, 150, 334, 150)
    s.line(446, 150, 500, 150)
    card(300, 138, "1")
    card(470, 138, "N")

    # правая половина
    ent(1000, 150, "Эмитент")
    ent(1000, 420, "Ценная бумага")
    ent(1000, 690, "История цены")
    vlink(1000, 183, 387, "выпускает", "1", "N")
    vlink(1000, 453, 657, "имеет", "1", "N")

    # позиция портфеля — ценная бумага
    dia(810, 420, "относится", w=136)
    s.line(740, 420, 742, 420)
    s.line(740, 420, 742, 420)
    s.line(620 + EW / 2, 420, 742, 420)
    s.line(878, 420, 880, 420)
    s.line(878, 420, 1000 - EW / 2, 420)
    card(752, 408, "N")
    card(968, 408, "1")

    # ценная бумага — предложение — сделка
    ent(1400, 420, "Предложение")
    dia(1195, 420, "выставляется", w=140)
    s.line(1120, 420, 1125, 420)
    s.line(1120, 420, 1125, 420)
    s.line(1000 + EW / 2, 420, 1125, 420)
    s.line(1265, 420, 1280, 420)
    card(1140, 408, "1")
    card(1250, 408, "N")
    vlink(1400, 453, 657, "исполняется", "1", "N")
    ent(1400, 690, "Сделка")

    s.text(800, 760, "Ромбами показаны связи, цифрами — кардинальность: "
                     "1 — одна сущность, N — множество", size=13, italic=True)
    s.text(800, 788, "Учётные записи, сеансы, журнал действий и инвестиционные проекты "
                     "приведены на даталогической модели", size=13, italic=True)
    open(path, "w", encoding="utf-8").write(s.svg())


# ---------------------------------------------------------------- даталогическая модель
def _dt_table(s, x, y, name, cols, w=330):
    """Таблица базы: шапка, строки «PK/FK имя — тип». Возвращает геометрию."""
    h = 34 + 21 * len(cols) + 8
    s.rect(x, y, w, h, fill=WHITE, sw=1.2)
    s.rect(x, y, w, 34, fill=GREY2, sw=1.2)
    s.text(x + w / 2, y + 23, name, size=15, bold=True)
    for i, (c, t, k) in enumerate(cols):
        yy = y + 34 + 17 + i * 21
        mark = {"PK": "PK ", "FK": "FK "}.get(k, "   ")
        s.text(x + 12, yy, mark + c, size=13, anchor="start", bold=(k == "PK"))
        s.text(x + w - 12, yy, t, size=12, anchor="end")
    return {"x": x, "y": y, "w": w, "h": h, "mid": y + h / 2}


def _elbow(s, pts, dashed=True):
    d = "M " + " L ".join(f"{x:.0f} {y:.0f}" for x, y in pts)
    s.path(d, sw=1.0, dash="6,4" if dashed else None)


def datalogic_clients(path):
    """Даталогическая модель, часть 1: клиентский и портфельный контуры."""
    s = Svg(880, 1100)
    s.text(440, 40, "Даталогическая модель базы данных: клиентский "
                    "и портфельный контуры", size=16, bold=True)
    s.text(24, 74, "Клиентский контур", size=14, bold=True, anchor="start")
    s.text(430, 74, "Портфельный контур", size=14, bold=True, anchor="start")

    clients = _dt_table(s, 24, 88, "Clients", [
        ("Id", "INT IDENTITY", "PK"), ("Name", "NVARCHAR(200)", ""),
        ("UNP", "CHAR(9)", ""), ("Address", "NVARCHAR(300)", ""),
        ("Contacts", "NVARCHAR(200)", ""), ("Status", "NVARCHAR(30)", ""),
        ("Kind", "NVARCHAR(10)", "")])
    depo = _dt_table(s, 24, 320, "DepoAccounts", [
        ("Id", "INT IDENTITY", "PK"), ("ClientId", "INT", "FK"),
        ("Number", "NVARCHAR(30)", ""), ("Opened", "DATE", "")])
    users = _dt_table(s, 24, 480, "Users", [
        ("Id", "INT IDENTITY", "PK"), ("CompanyId", "NVARCHAR(30)", ""),
        ("Login", "NVARCHAR(50)", ""), ("PasswordHash", "CHAR(64)", ""),
        ("Role", "NVARCHAR(20)", ""), ("ClientId", "INT", "FK"),
        ("IsActive", "BIT", "")])
    sess = _dt_table(s, 24, 730, "Sessions", [
        ("Token", "NVARCHAR(64)", "PK"), ("UserId", "INT", "FK"),
        ("Login", "NVARCHAR(50)", ""), ("Role", "NVARCHAR(20)", ""),
        ("ClientId", "INT", ""), ("SeenAt", "DATETIME", "")])
    audit = _dt_table(s, 24, 940, "AuditLog", [
        ("Id", "INT IDENTITY", "PK"), ("At", "DATETIME", ""),
        ("UserLogin", "NVARCHAR(50)", ""), ("Action", "NVARCHAR(100)", ""),
        ("Details", "NVARCHAR(500)", "")])

    hold = _dt_table(s, 430, 88, "Holdings", [
        ("Id", "INT IDENTITY", "PK"), ("DepoAccountId", "INT", "FK"),
        ("SecurityId", "INT", "FK"), ("Quantity", "INT", ""),
        ("TargetPct", "DECIMAL(5,2)", "")])
    cert = _dt_table(s, 430, 300, "DepositCertificates", [
        ("Id", "INT IDENTITY", "PK"), ("ClientId", "INT", "FK"),
        ("Amount", "DECIMAL(18,2)", ""), ("Rate", "DECIMAL(5,2)", ""),
        ("DemandRate", "DECIMAL(5,2)", ""), ("StartDate", "DATE", ""),
        ("EndDate", "DATE", ""), ("Status", "NVARCHAR(20)", "")])
    proj = _dt_table(s, 430, 560, "InvestmentProjects", [
        ("Id", "INT IDENTITY", "PK"), ("Name", "NVARCHAR(200)", ""),
        ("Rate", "DECIMAL(6,2)", ""), ("CashFlows", "NVARCHAR(500)", "")])

    def mid(b):
        return b["mid"]

    # клиент → счёт депо (внутри колонки)
    _elbow(s, [(120, clients["y"] + clients["h"]), (120, depo["y"])])
    # счёт депо → позиция портфеля (коридор между колонками)
    _elbow(s, [(354, mid(depo)), (392, mid(depo)), (392, mid(hold)), (430, mid(hold))])
    # клиент → депозитный сертификат
    _elbow(s, [(354, clients["y"] + 70), (410, clients["y"] + 70),
               (410, mid(cert)), (430, mid(cert))])
    # учётная запись → сеанс
    _elbow(s, [(120, users["y"] + users["h"]), (120, sess["y"])])

    open(path, "w", encoding="utf-8").write(s.svg())


def datalogic_market(path):
    """Даталогическая модель, часть 2: рыночный контур и сделки."""
    s = Svg(880, 830)
    s.text(440, 40, "Даталогическая модель базы данных: рыночный контур и сделки",
           size=16, bold=True)
    s.text(24, 74, "Рыночный контур", size=14, bold=True, anchor="start")
    s.text(430, 74, "Сделки и цены", size=14, bold=True, anchor="start")

    iss = _dt_table(s, 24, 88, "Issuers", [
        ("Id", "INT IDENTITY", "PK"), ("Name", "NVARCHAR(200)", "")])
    sec = _dt_table(s, 24, 220, "Securities", [
        ("Id", "INT IDENTITY", "PK"), ("Symbol", "NVARCHAR(20)", ""),
        ("Name", "NVARCHAR(200)", ""), ("IssuerId", "INT", "FK"),
        ("Kind", "NVARCHAR(50)", ""), ("Segment", "NVARCHAR(50)", ""),
        ("Nominal", "DECIMAL(18,2)", ""), ("Volume", "INT", ""),
        ("Rate", "DECIMAL(5,2)", ""), ("ExpenseRatio", "DECIMAL(5,2)", ""),
        ("Status", "NVARCHAR(30)", ""), ("Price", "DECIMAL(18,2)", ""),
        ("PrevPrice", "DECIMAL(18,2)", "")])
    lst = _dt_table(s, 24, 620, "Listings", [
        ("Id", "INT IDENTITY", "PK"), ("SellerClientId", "INT", "FK"),
        ("SecurityId", "INT", "FK"), ("Quantity", "INT", ""),
        ("Price", "DECIMAL(18,2)", ""), ("Status", "NVARCHAR(20)", ""),
        ("CreatedAt", "DATETIME", "")])

    tx = _dt_table(s, 430, 220, "Transactions", [
        ("Id", "INT IDENTITY", "PK"), ("DepoAccountId", "INT", "FK"),
        ("SecurityId", "INT", "FK"), ("Type", "NVARCHAR(10)", ""),
        ("Quantity", "INT", ""), ("Price", "DECIMAL(18,2)", ""),
        ("Commission", "DECIMAL(18,2)", ""), ("Status", "NVARCHAR(20)", ""),
        ("Date", "DATETIME", "")])
    ph = _dt_table(s, 430, 540, "PriceHistory", [
        ("Id", "BIGINT IDENTITY", "PK"), ("SecurityId", "INT", "FK"),
        ("At", "DATETIME", ""), ("Price", "DECIMAL(18,2)", "")])

    # эмитент → бумага (внутри колонки)
    _elbow(s, [(120, iss["y"] + iss["h"]), (120, sec["y"])])
    # бумага → предложение о продаже
    _elbow(s, [(120, sec["y"] + sec["h"]), (120, lst["y"])])
    # бумага → сделки
    _elbow(s, [(354, sec["y"] + 60), (392, sec["y"] + 60), (392, tx["y"] + 40),
               (430, tx["y"] + 40)])
    # бумага → история цен
    _elbow(s, [(354, sec["y"] + 250), (412, sec["y"] + 250), (412, ph["mid"]),
               (430, ph["mid"])])

    open(path, "w", encoding="utf-8").write(s.svg())


def work_scheme(path):
    """Схема работы системы: путь запроса от одного из клиентов до базы данных.

    Два клиента сверху (настольное приложение и браузер) показывают главное
    свойство системы — оба работают с одним сервером и одной базой.
    """
    s = Svg(1500, 760)
    s.text(750, 44, "Схема работы системы", size=17, bold=True)

    def box(x, y, w, h, title, lines, label=None):
        s.rect(x, y, w, h, fill=WHITE, sw=1.3)
        s.rect(x, y, w, 42, fill=GREY2, sw=1.3)
        s.text(x + w / 2, y + 29, title, size=15, bold=True)
        s.lines(x + w / 2, y + 74, lines, size=13, lh=20)
        if label:
            s.text(x + w / 2, y + h - 14, label, size=12, italic=True)
        return {"x": x, "y": y, "w": w, "h": h, "cx": x + w / 2,
                "top": y, "bottom": y + h}

    left = box(60, 80, 320, 130, "Настольное приложение",
               ["Windows Forms, C#, .NET 8"])
    right = box(620, 80, 320, 130, "Веб-приложение",
                ["браузер, HTML и JavaScript"])
    srv = box(340, 290, 620, 150, "Сервер приложений Node.js",
              ["проверка сеанса и прав по роли, бизнес-логика,",
               "REST API и раздача веб-приложения"])
    db = box(340, 480, 620, 150, "База данных SQL Server",
             ["13 таблиц, хранимые процедуры usp_BuyListing",
              "и usp_UpdatePrices, журналы Transactions и AuditLog"])

    # оба клиента — к серверу
    s.line(220, 210, 220, 250)
    s.line(220, 250, 470, 250)
    s.line(470, 250, 470, 290, arrow=True, start_arrow=True)
    s.line(780, 210, 780, 250)
    s.line(780, 250, 830, 250)
    s.line(830, 250, 830, 290, arrow=True, start_arrow=True)
    s.label(300, 240, "HTTP + JSON", size=12)
    s.label(880, 240, "HTTP + JSON", size=12)

    # сервер — база
    s.line(650, 440, 650, 480, arrow=True)
    s.label(668, 462, "T-SQL, порт 1433", size=12, anchor="start")

    s.text(750, 700, "Стрелки двусторонние: клиент отправляет запрос и получает ответ. "
                     "Изменение данных одним клиентом", size=13, italic=True)
    s.text(750, 726, "сразу видно второму клиенту — оба работают с одним сервером "
                     "и одной базой данных", size=13, italic=True)
    open(path, "w", encoding="utf-8").write(s.svg())


# ---------------------------------------------------------------- варианты использования по ролям
def use_case_roles(path):
    """Варианты использования по ролям: актёр слева, эллипсы справа от него."""
    s = Svg(1480, 740)
    s.text(740, 38, "Варианты использования системы по ролям пользователей",
           size=17, bold=True)

    def actor(x, y):
        s.ellipse(x, y, 15, 18)
        s.line(x, y + 18, x, y + 60)
        s.line(x - 26, y + 32, x + 26, y + 32)
        s.line(x, y + 60, x - 20, y + 92)
        s.line(x, y + 60, x + 20, y + 92)

    def uc(cx, cy, text_, w=300, h=56):
        s.ellipse(cx, cy, w / 2, h / 2, fill=GREEN_L)
        lines = text_.split("\n")
        s.lines(cx, cy - (len(lines) - 1) * 9 + 5, lines, size=13, lh=17)
        return (cx - w / 2, cy)

    panels = [
        ("Клиент", 20, [("Просмотреть свои активы", 1),
                        ("Купить бумаги по\nпредложению", 2),
                        ("Выставить предложение\nо продаже", 2),
                        ("Отозвать предложение", 1),
                        ("Просмотреть историю\nопераций", 2),
                        ("Зарегистрироваться\nв системе", 2),
                        ("Сменить язык\nинтерфейса", 2)]),
        ("Сотрудник", 507, [("Просмотреть реестр\nклиентов", 2),
                            ("Добавить клиента", 1),
                            ("Работать с портфелем\nлюбого клиента", 2),
                            ("Задать целевые доли", 1),
                            ("Просмотреть журнал\nсделок", 2),
                            ("Сформировать отчёт", 1)]),
        ("Администратор", 994, [("Добавить сотрудника", 1),
                                ("Заблокировать\nучётную запись", 2),
                                ("Просмотреть журнал\nдействий", 2),
                                ("Удалить клиента\nсо счетами", 2),
                                ("Все функции\nсотрудника", 2)]),
    ]
    for name, x, items in panels:
        bottom = 132 + (len(items) - 1) * 78 + 28 + 58
        s.rect(x, 62, 466, bottom - 62, fill="#fcfcfc", dash="7,5")
        s.text(x + 233, 90, name, size=15, bold=True)
        # актёр по центру высоты его вариантов
        top, step = 132, 78
        mid = top + (len(items) - 1) * step / 2 + 28
        actor(x + 54, mid)
        for i, (it, nlines) in enumerate(items):
            y = top + i * step
            lx, ly = uc(x + 300, y + 28, it, w=300, h=56)
            s.line(x + 80, mid + 22, lx - 4, ly, sw=1)
    open(path, "w", encoding="utf-8").write(s.svg())


# ---------------------------------------------------------------- схемы алгоритмов
class Flow:
    """Блок-схема: начало, действия, решения, отказы и связи между ними."""

    def __init__(self, w, h, title=""):
        self.s = Svg(w, h)
        self.s.rect(0, 0, w, h, fill=WHITE)
        if title:
            self.s.text(w / 2, 44, title, size=16, bold=True)

    def start(self, cx, cy, text_="Начало"):
        self.s.ellipse(cx, cy, self.s.text_w(text_, 13, True) / 2 + 26, 26, fill=GREY2)
        self.s.text(cx, cy + 5, text_, size=13, bold=True)
        return cy + 26

    def end(self, cx, cy, text_="Конец"):
        lines = text_.split("\n")
        rx = max(self.s.text_w(t, 13, True) for t in lines) / 2 + 22
        ry = 24 if len(lines) == 1 else 32
        self.s.ellipse(cx, cy, rx, ry, fill=GREY2)
        self.s.lines(cx, cy - (len(lines) - 1) * 8 + 4, lines, size=13, bold=True, lh=16)
        return cy - ry

    def action(self, cx, cy, text_, w=330, h=64):
        self.s.rect(cx - w / 2, cy - h / 2, w, h, fill=WHITE, rx=4)
        lines = text_.split("\n")
        self.s.lines(cx, cy - (len(lines) - 1) * 8 + 5, lines, size=12.5, lh=17)
        return {"top": cy - h / 2, "bottom": cy + h / 2, "cy": cy,
                "left": cx - w / 2, "right": cx + w / 2}

    def decision(self, cx, cy, text_, w=300, h=104):
        self.s.poly([(cx, cy - h / 2), (cx + w / 2, cy), (cx, cy + h / 2), (cx - w / 2, cy)],
                    fill="#fffdf5")
        lines = text_.split("\n")
        self.s.lines(cx, cy - (len(lines) - 1) * 8 + 4, lines, size=12, lh=16)
        return {"top": cy - h / 2, "bottom": cy + h / 2, "cy": cy,
                "left": cx - w / 2, "right": cx + w / 2}

    def down(self, x, y1, y2, label="", lx=None, ly=None):
        self.s.line(x, y1, x, y2, arrow=True)
        if label:
            self.s.label(lx if lx is not None else x + 24,
                         ly if ly is not None else (y1 + y2) / 2, label, size=11.5)

    def side(self, x1, y1, x2, y2, label="", lx=None, ly=None):
        self.s.line(x1, y1, x2, y2, arrow=True)
        if label:
            self.s.label(lx if lx is not None else (x1 + x2) / 2,
                         ly if ly is not None else (y1 + y2) / 2, label, size=11.5)

    def save(self, path):
        open(path, "w", encoding="utf-8").write(self.s.svg())


def algorithm_buy(path):
    """Покупка бумаги по предложению: три проверки, транзакция, две записи истории."""
    f = Flow(1180, 1400, "Схема алгоритма покупки ценной бумаги по предложению")
    X = 430
    f.down(X, f.start(X, 96), 148)
    a1 = f.action(X, 180, "Выбрать предложение продавца\nи указать количество")
    f.down(X, a1["bottom"], 240)
    d1 = f.decision(X, 300, "Предложение активно\nи найдено?")
    f.down(X, d1["bottom"], 388, "да", X + 26, 352)
    d2 = f.decision(X, 452, "Покупатель не является\nпродавцом?")
    f.down(X, d2["bottom"], 540, "да", X + 26, 504)
    d3 = f.decision(X, 604, "1 ≤ количество ≤\nдоступного остатка?")
    f.down(X, d3["bottom"], 692, "да", X + 26, 656)
    a2 = f.action(X, 724, "Начать транзакцию:\nBEGIN TRAN, SET XACT_ABORT ON", w=400, h=64)
    f.down(X, a2["bottom"], 786)
    a3 = f.action(X, 820, "Заблокировать строку предложения\nUPDLOCK, HOLDLOCK", w=420, h=64)
    f.down(X, a3["bottom"], 882)
    a4 = f.action(X, 916, "Списать бумаги у продавца\nи зачислить покупателю", w=420, h=64)
    f.down(X, a4["bottom"], 978)
    a5 = f.action(X, 1012, "Уменьшить остаток предложения\nи записать две сделки (комиссия 0,5 %)",
                  w=470, h=66)
    f.down(X, a5["bottom"], 1076)
    a6 = f.action(X, 1110, "COMMIT — зафиксировать изменения", w=380, h=56)
    f.down(X, a6["bottom"], 1170)
    a7 = f.action(X, 1202, "Записать действие в журнал AuditLog", w=400, h=56)
    f.down(X, a7["bottom"], 1258)
    f.end(X, 1292, "Сделка исполнена")

    EX = 940
    err = f.action(EX, 700, "ROLLBACK\nи сообщение об ошибке", w=240, h=80)
    f.side(d1["right"], d1["cy"], EX - 120, err["top"] + 14, "нет", d1["right"] + 44, d1["cy"] - 12)
    f.side(d2["right"], d2["cy"], EX - 120, err["cy"], "нет", d2["right"] + 44, d2["cy"] - 12)
    f.side(d3["right"], d3["cy"], EX - 120, err["bottom"] - 14, "нет", d3["right"] + 44,
           d3["cy"] - 12)
    f.down(EX, err["bottom"], 1236)
    f.end(EX, 1272, "Отказ,\nданные не изменены")
    f.save(path)


def algorithm_sell(path):
    """Выставление предложения о продаже."""
    f = Flow(1120, 900, "Схема алгоритма выставления предложения о продаже")
    X = 400
    f.down(X, f.start(X, 96), 148)
    a1 = f.action(X, 180, "Выбрать бумагу, количество\nи цену за единицу")
    f.down(X, a1["bottom"], 240)
    d1 = f.decision(X, 296, "Свободный остаток\nне меньше количества?")
    f.down(X, d1["bottom"], 388, "да", X + 26, 352)
    d2 = f.decision(X, 448, "Цена в пределах\n30–300 % рыночной?")
    f.down(X, d2["bottom"], 536, "да", X + 26, 500)
    a2 = f.action(X, 572, "Создать запись в Listings\nсо статусом «Активно»", w=400, h=64)
    f.down(X, a2["bottom"], 634)
    a3 = f.action(X, 670, "Записать действие в журнал", w=360, h=56)
    f.down(X, a3["bottom"], 730)
    f.end(X, 764, "Предложение\nопубликовано")

    EX = 880
    err = f.action(EX, 372, "Сообщение: проверьте\nколичество или цену", w=270, h=76)
    f.side(d1["right"], d1["cy"], EX - 135, err["top"] + 14, "нет", d1["right"] + 44, d1["cy"] - 12)
    f.side(d2["right"], d2["cy"], EX - 135, err["bottom"] - 14, "нет", d2["right"] + 44,
           d2["cy"] - 12)
    f.down(EX, err["bottom"], 470)
    f.end(EX, 504, "Предложение\nне создано")
    f.s.text(400, 836, "Выставленные бумаги остаются на счёте депо, но резервируются: "
                       "повторно предложить их нельзя", size=12, italic=True)
    f.save(path)


def algorithm_auth(path):
    """Авторизация: режим входа, поиск пользователя, сверка хеша, сеанс."""
    f = Flow(1180, 1000, "Схема алгоритма авторизации пользователя")
    X = 440
    f.down(X, f.start(X, 88), 136)
    a1 = f.action(X, 168, "Ввести идентификатор\nи пароль", w=290, h=58)
    f.down(X, a1["bottom"], 224)
    d1 = f.decision(X, 288, "Тип входа:\nпредприятие или\nпользователь?", w=300, h=124)
    left, right = X - 250, X + 250
    a2 = f.action(left, 430, "Искать по CompanyId\nи Login клиента", w=250, h=62)
    a3 = f.action(right, 430, "Искать по Login\nсреди ASB и PERSONAL", w=260, h=62)
    f.side(d1["left"], d1["cy"], left, a2["top"], "предприятие", d1["left"] - 58, d1["cy"] - 12)
    f.side(d1["right"], d1["cy"], right, a3["top"], "пользователь",
           d1["right"] + 66, d1["cy"] - 12)
    d2 = f.decision(X, 540, "Пользователь найден\nи активен?", w=300, h=96)
    f.side(left, a2["bottom"], d2["left"] + 34, d2["top"] + 10)
    f.side(right, a3["bottom"], d2["right"] - 34, d2["top"] + 10)
    f.down(X, d2["bottom"], 630, "да", X + 26, 596)
    d3 = f.decision(X, 690, "Хеш SHA-256 пароля\nсовпадает с базой?", w=320, h=104)
    f.down(X, d3["bottom"], 780, "да", X + 26, 744)
    a4 = f.action(X, 812, "Создать сеанс: токен из 48 символов,\nзапись в Sessions", w=440, h=64)
    f.down(X, a4["bottom"], 874)
    a5 = f.action(X, 906, "Вернуть клиенту сведения о роли и клиенте", w=440, h=56)
    f.down(X, a5["bottom"], 950)
    f.end(X, 972, "Вход выполнен")

    EX = 960
    err = f.action(EX, 660, "Отказ во входе\nи запись попытки\nв журнал", w=240, h=88)
    f.side(d2["right"], d2["cy"], EX - 120, err["top"] + 16, "нет", d2["right"] + 44,
           d2["cy"] - 12)
    f.side(d3["right"], d3["cy"], EX - 120, err["cy"], "нет", d3["right"] + 44, d3["cy"] - 12)
    f.down(EX, err["bottom"], 830)
    f.end(EX, 862, "Доступа нет")
    f.save(path)


def algorithm_add_user(path):
    """Добавление сотрудника администратором."""
    f = Flow(1120, 900, "Схема алгоритма добавления нового пользователя")
    X = 300
    f.down(X, f.start(X, 88), 136)
    a1 = f.action(X, 168, "Открыть раздел\n«Администрирование»", w=290, h=58)
    f.down(X, a1["bottom"], 226)
    d1 = f.decision(X, 292, "Роль —\nадминистратор?", w=240, h=100)
    f.down(X, d1["bottom"], 380, "да", X + 26, 344)
    a2 = f.action(X, 420, "Показать кнопки добавления\nи удаления записей", w=340, h=60)
    f.down(X, a2["bottom"], 480)
    b = f.action(X, 516, "Ввести логин, пароль\nи роль", w=290, h=58)
    f.down(X, b["bottom"], 572)
    d2 = f.decision(X, 640, "Логин ≥ 3 символов,\nпароль ≥ 6 символов?", w=320, h=108)
    f.down(X, d2["bottom"], 726, "да", X + 26, 690)
    d3 = f.decision(X, 782, "Такой логин\nуже есть?", w=240, h=92)
    f.down(X, d3["bottom"], 862, "нет", X + 26, 828)
    a4 = f.action(700, 862, "Сохранить хеш пароля\nи запись в Users", w=320, h=58)
    a5 = f.action(700, 936, "Записать действие в журнал", w=300, h=54)
    f.side(X, 862, 700 - 160, a4["top"] + 4)
    f.down(700, a4["bottom"], 908)
    f.down(700, a5["bottom"], 986)
    f.end(700, 1018, "Пользователь создан")

    # отказы
    lx = 560
    err = f.action(lx, 292, "Раздел недоступен,\nответ 403", w=230, h=64)
    f.side(d1["left"], d1["cy"], lx - 115, err["top"] + 30, "нет", d1["left"] - 56, d1["cy"] - 12)
    err2 = f.action(990, 640, "Сообщение\nоб ошибке ввода", w=210, h=64)
    f.side(d2["right"], d2["cy"], 990 - 105, err2["cy"], "нет", d2["right"] + 40, d2["cy"] - 12)
    f.side(d3["right"], d3["cy"], 990 - 105, err2["cy"] + 18, "да", d3["right"] + 40,
           d3["cy"] - 12)
    f.down(990, err2["bottom"], 730)
    f.end(990, 762, "Запись\nне создана")
    f.save(path)


def algorithm_add_security(path):
    """Добавление выпуска ценных бумаг."""
    f = Flow(1100, 860, "Схема алгоритма добавления выпуска ценных бумаг")
    X = 400
    f.down(X, f.start(X, 88), 136)
    a1 = f.action(X, 168, "Открыть реестр выпусков", w=300, h=54)
    f.down(X, a1["bottom"], 224)
    a2 = f.action(X, 258, "Выбрать эмитента из\nсправочника Issuers", w=340, h=58)
    f.down(X, a2["bottom"], 316)
    a3 = f.action(X, 352, "Указать тикер, вид, сегмент,\nноминал, объём и ставку", w=410, h=62)
    f.down(X, a3["bottom"], 414)
    d1 = f.decision(X, 468, "Тикер уникален?", w=280, h=88)
    f.down(X, d1["bottom"], 544, "да", X + 26, 508)
    d2 = f.decision(X, 600, "Номинал и объём\nбольше нуля?", w=300, h=96)
    f.down(X, d2["bottom"], 686, "да", X + 26, 650)
    a4 = f.action(X, 722, "Сохранить выпуск\nсо статусом «Зарегистрирован»", w=420, h=62)
    f.down(X, a4["bottom"], 784)
    f.end(X, 818, "Выпуск создан")

    EX = 900
    err = f.action(EX, 534, "Сообщение о повторном\nтикере или неверных\nданных", w=250, h=88)
    f.side(d1["right"], d1["cy"], EX - 125, err["top"] + 16, "нет", d1["right"] + 44,
           d1["cy"] - 12)
    f.side(d2["right"], d2["cy"], EX - 125, err["bottom"] - 16, "нет", d2["right"] + 44,
           d2["cy"] - 12)
    f.down(EX, err["bottom"], 626)
    f.end(EX, 658, "Выпуск\nне создан")
    f.s.text(400, 700, "Размещение выпуска меняет статус на «Размещён» "
                       "и разрешает сделки с бумагой", size=12, italic=True)
    f.save(path)


def write_scaled(svg_text, path, k):
    """Сохраняет SVG, уменьшив физический размер (viewBox сохраняет геометрию).

    Диаграммы нарисованы в координатах 1500+ px. Если вставлять их в Word
    как есть, шрифт 14 px при ширине 16,5 см превращается в 4 пт и не читается.
    Уменьшая width/height при том же viewBox, мы получаем ту же картинку,
    но с крупным текстом после вставки в документ.
    """
    import re as _re
    m = _re.search(r'width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"', svg_text)
    if not m:
        open(path, "w", encoding="utf-8").write(svg_text)
        return
    w, h = int(m.group(3)), int(m.group(4))
    head = f'width="{w * k:.0f}" height="{h * k:.0f}" viewBox="0 0 {w} {h}"'
    svg_text = svg_text[:m.start()] + head + svg_text[m.end():]
    open(path, "w", encoding="utf-8").write(svg_text)


FIGURES = {
    "fig_er": er_model,
    "fig_datalogic_clients": datalogic_clients,
    "fig_datalogic_market": datalogic_market,
    "fig_uc_roles": use_case_roles,
    "fig_work": work_scheme,
    "fig_alg_buy": algorithm_buy,
    "fig_alg_sell": algorithm_sell,
    "fig_alg_auth": algorithm_auth,
    "fig_alg_adduser": algorithm_add_user,
    "fig_alg_addsec": algorithm_add_security,
}


def main():
    out = os.path.join(HERE, "shots")
    os.makedirs(out, exist_ok=True)
    for name in (sys.argv[1:] or FIGURES):
        p = os.path.join(out, name + ".svg")
        FIGURES[name](p)
        # масштаб: чем меньше k, тем крупнее будет текст после вставки в Word
        k = {"fig_er": 0.42, "fig_datalogic_clients": 0.40,
             "fig_datalogic_market": 0.40, "fig_uc_roles": 0.42}.get(
            name, 0.40 if name.startswith("fig_alg") else 0.46)
        write_scaled(open(p, encoding="utf-8").read(), p, k)
        print("  ✔", name + ".svg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
