#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Приложения: листинги основных модулей системы."""
import os

from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt

import docbuild as D

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def _src(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def _frac(text, start, end, limit=120):
    """Фрагмент файла от строки, содержащей start, до строки, содержащей end."""
    lines = text.split("\n")
    i = next(k for k, l in enumerate(lines) if start in l)
    j = next(k for k, l in enumerate(lines) if k > i and end in l)
    part = lines[i:j + 1]
    return "\n".join(part[:limit])


def _appendix_title(doc, number, title):
    """«ПРИЛОЖЕНИЕ 1» справа вверху и содержательный заголовок по центру."""
    D.h1(doc, f"ПРИЛОЖЕНИЕ {number}", page_break=True)
    par = doc.add_paragraph()
    pf = par.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf.line_spacing = 1.0
    pf.space_before = Pt(0)
    pf.space_after = Pt(12)
    D._runs(par, title, size=14)
    return par


def appendices(doc):
    schema = _src("db", "schema.sql")
    logic = _src("server", "src", "logic.js")

    # ------------------------------------------------------------------ 1
    _appendix_title(doc, 1, "Основные таблицы базы данных BankInvest")
    D.p(doc, "Ниже приведены фрагменты скрипта db\\schema.sql, создающего структуру "
             "базы данных. Скрипт выполняется в среде SQL Server Management Studio "
             "целиком и может запускаться повторно: существующие таблицы не "
             "пересоздаются.")
    start = schema.index("/* ---------------- 1. Клиенты, пользователи, счета депо")
    end = schema.index("/* ---------------- 2. Эмитенты и ценные бумаги")
    D.listing(doc, schema[start:end].rstrip().replace("GO\n", "GO\n"), size=9)

    D.p(doc, "Таблицы портфеля и журнала операций:", indent=False)
    start = schema.index("/* ---------------- 3. Портфель и сделки")
    end = schema.index("/* ---------------- 4. Инвестиционные проекты и журнал")
    D.listing(doc, schema[start:end].rstrip(), size=9)

    D.p(doc, "Таблицы рыночного контура — история цен и предложения о продаже:", indent=False)
    start = schema.index("IF OBJECT_ID('PriceHistory', 'U') IS NULL")
    end = schema.index("/* ---------------- 6. Сессии")
    D.listing(doc, schema[start:end].rstrip(), size=9)

    # ------------------------------------------------------------------ 2
    _appendix_title(doc, 2, "Основные модули серверной части")
    D.p(doc, "Серверная часть реализована на платформе Node.js и состоит из трёх "
             "модулей: db.js — подключение к SQL Server и вспомогательные функции "
             "запросов, logic.js — бизнес-логика (портфель, сделки, отчёты, проекты), "
             "server.js — маршрутизация запросов и раздача веб-приложения.")
    D.p(doc, "Регистрация маршрутов программного интерфейса и проверка прав доступа "
             "(server.js):", indent=False)
    server = _src("server", "src", "server.js")
    a = server.index("function token(req, url)")
    b = server.index("// --- public")
    D.listing(doc, server[a:b].rstrip(), size=9)

    D.p(doc, "Расчёт структуры портфеля и метрик инвестиционного проекта (logic.js):",
         indent=False)
    a = logic.index("function recalc(")
    b = logic.index("\n}\n", a) + 2
    D.listing(doc, logic[a:b].rstrip(), size=9)

    a = logic.index("function projectMetrics(")
    b = logic.index("\n}\n", a) + 2
    D.listing(doc, logic[a:b].rstrip(), size=9)

    D.p(doc, "Авторизация и создание сеанса (logic.js):", indent=False)
    a = logic.index("async function login(")
    b = logic.index("\n}\n", a) + 2
    D.listing(doc, logic[a:b].rstrip(), size=9)

    D.p(doc, "Исполнение покупки на стороне сервера — вызов хранимой процедуры и "
             "преобразование кода ошибки базы данных в сообщение интерфейса (logic.js):",
         indent=False)
    a = logic.index("async function buy(")
    b = logic.index("\n}\n", a) + 2
    D.listing(doc, logic[a:b].rstrip(), size=9)
