#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборка самостоятельной работы «Сетевая программная система управления
инвестициями и ценными бумагами банка» в .docx.

Оформление повторяет образец кафедры:
  Times New Roman 14, интервал 1,5; поля 3 / 1,5 / 2 / 2 см;
  заголовки глав — Heading 1, параграфы — Heading 2;
  подписи рисунков и таблиц — по центру, 12 пт;
  листинги кода — Courier New 10.
"""
import os
import sys

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "Самостоятельная_работа_инвестиции_и_ценные_бумаги.docx")

BODY = 14
SMALL = 12
CODE = 10


# ---------------------------------------------------------------- утилиты оформления
def set_style_font(style, name="Times New Roman", size=BODY, bold=None):
    style.font.name = name
    style.font.size = Pt(size)
    if bold is not None:
        style.font.bold = bold
    style.font.color.rgb = RGBColor(0, 0, 0)
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rfonts.set(qn(attr), name)


def p(doc, text="", *, align=WD_ALIGN_PARAGRAPH.JUSTIFY, bold=False, italic=False,
      size=BODY, first_line=1.25, before=0, after=0, spacing=1.5, name="Times New Roman",
      keep_next=False):
    par = doc.add_paragraph()
    pf = par.paragraph_format
    pf.alignment = align
    pf.line_spacing = spacing
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    if first_line:
        pf.first_line_indent = Cm(first_line)
    pf.keep_with_next = keep_next
    if text:
        run = par.add_run(text)
        run.bold = bold
        run.italic = italic
        run.font.size = Pt(size)
        run.font.name = name
        run._element.rPr.rFonts.set(qn("w:cs"), name)
    return par


def h1(doc, text):
    h = doc.add_heading(text, level=1)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    h.paragraph_format.space_before = Pt(18)
    h.paragraph_format.space_after = Pt(12)
    h.paragraph_format.first_line_indent = Cm(0)
    for r in h.runs:
        r.font.name = "Times New Roman"
        r.font.size = Pt(BODY)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0, 0, 0)
        r._element.rPr.rFonts.set(qn("w:cs"), "Times New Roman")
    return h


def h2(doc, text):
    h = doc.add_heading(text, level=2)
    h.paragraph_format.space_before = Pt(14)
    h.paragraph_format.space_after = Pt(8)
    h.paragraph_format.first_line_indent = Cm(1.25)
    for r in h.runs:
        r.font.name = "Times New Roman"
        r.font.size = Pt(BODY)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0, 0, 0)
        r._element.rPr.rFonts.set(qn("w:cs"), "Times New Roman")
    return h


def bullet(doc, text):
    """Пункт перечня: тире, с отступом, как в образце."""
    par = p(doc, "– " + text, align=WD_ALIGN_PARAGRAPH.JUSTIFY, first_line=1.25)
    par.paragraph_format.left_indent = Cm(0)
    return par


def code_block(doc, lines):
    for line in lines:
        par = doc.add_paragraph()
        pf = par.paragraph_format
        pf.alignment = WD_ALIGN_PARAGRAPH.LEFT
        pf.first_line_indent = Cm(0)
        pf.left_indent = Cm(0.5)
        pf.line_spacing = 1.0
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        run = par.add_run(line if line else " ")
        run.font.name = "Courier New"
        run.font.size = Pt(CODE)
        run._element.rPr.rFonts.set(qn("w:cs"), "Courier New")
    p(doc, "", first_line=0, spacing=1.0)


def caption(doc, text):
    return p(doc, text, align=WD_ALIGN_PARAGRAPH.CENTER, first_line=0,
             size=SMALL, before=6, after=10)


def picture(doc, filename, width_cm=15.5):
    path = os.path.join(HERE, filename)
    par = doc.add_paragraph()
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    par.paragraph_format.first_line_indent = Cm(0)
    par.paragraph_format.space_before = Pt(10)
    par.paragraph_format.space_after = Pt(0)
    par.paragraph_format.keep_with_next = True
    par.add_run().add_picture(path, width=Cm(width_cm))


def shade(cell, color="F2F2F2"):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), color)
    tc_pr.append(shd)


def table(doc, header, rows, widths, *, font=SMALL, header_bold=True):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    hdr = t.rows[0].cells
    for i, text in enumerate(header):
        hdr[i].text = ""
        par = hdr[i].paragraphs[0]
        par.alignment = WD_ALIGN_PARAGRAPH.CENTER
        par.paragraph_format.first_line_indent = Cm(0)
        par.paragraph_format.line_spacing = 1.0
        run = par.add_run(text)
        run.bold = header_bold
        run.font.size = Pt(font)
        run.font.name = "Times New Roman"
        shade(hdr[i])
    for row in rows:
        cells = t.add_row().cells
        for i, text in enumerate(row):
            cells[i].text = ""
            par = cells[i].paragraphs[0]
            par.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            par.paragraph_format.first_line_indent = Cm(0)
            par.paragraph_format.line_spacing = 1.0
            run = par.add_run(str(text))
            run.font.size = Pt(font)
            run.font.name = "Times New Roman"
    for row in t.rows:
        for i, w in enumerate(widths):
            row.cells[i].width = Cm(w)
    # повтор шапки на новой странице
    tr_pr = t.rows[0]._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)
    return t


def toc_line(doc, text, page):
    par = doc.add_paragraph()
    pf = par.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.line_spacing = 1.5
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.tab_stops.add_tab_stop(Cm(16.5), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
    run = par.add_run(f"{text}\t{page}")
    run.font.size = Pt(BODY)
    run.font.name = "Times New Roman"
    return par


def page_break(doc):
    doc.add_page_break()


# ---------------------------------------------------------------- титульный лист
def title_page(doc):
    for line in ("МИНИСТЕРСТВО ОБРАЗОВАНИЯ РЕСПУБЛИКИ БЕЛАРУСЬ",
                 "УЧРЕЖДЕНИЕ ОБРАЗОВАНИЯ",
                 "«ПОЛЕССКИЙ ГОСУДАРСТВЕННЫЙ УНИВЕРСИТЕТ»"):
        p(doc, line, align=WD_ALIGN_PARAGRAPH.CENTER, first_line=0, bold=(line.startswith("«")))
    p(doc, "", first_line=0)
    p(doc, "Факультет ________________________________", align=WD_ALIGN_PARAGRAPH.LEFT, first_line=0)
    p(doc, "Кафедра __________________________________", align=WD_ALIGN_PARAGRAPH.LEFT, first_line=0)
    for _ in range(4):
        p(doc, "", first_line=0)

    # блок «Оценка» справа
    par = p(doc, "Оценка", align=WD_ALIGN_PARAGRAPH.RIGHT, first_line=0)
    par.paragraph_format.tab_stops.add_tab_stop(Cm(8.5))
    p(doc, "самостоятельной работы ____________", align=WD_ALIGN_PARAGRAPH.RIGHT, first_line=0)
    for _ in range(4):
        p(doc, "", first_line=0)

    p(doc, "САМОСТОЯТЕЛЬНАЯ РАБОТА", align=WD_ALIGN_PARAGRAPH.CENTER, first_line=0, bold=True, size=16)
    p(doc, "по дисциплине: «Средства и технологии анализа и разработки",
      align=WD_ALIGN_PARAGRAPH.CENTER, first_line=0)
    p(doc, "информационных систем»", align=WD_ALIGN_PARAGRAPH.CENTER, first_line=0)
    p(doc, "на тему: «Сетевая программная система управления",
      align=WD_ALIGN_PARAGRAPH.CENTER, first_line=0, bold=True)
    p(doc, "инвестициями и ценными бумагами банка»",
      align=WD_ALIGN_PARAGRAPH.CENTER, first_line=0, bold=True)
    for _ in range(3):
        p(doc, "", first_line=0)

    p(doc, "Исполнитель:", align=WD_ALIGN_PARAGRAPH.LEFT, first_line=0)
    p(doc, "студент группы № ________", align=WD_ALIGN_PARAGRAPH.LEFT, first_line=0)
    p(doc, "___________________________", align=WD_ALIGN_PARAGRAPH.LEFT, first_line=0)
    p(doc, "(инициалы, фамилия)", align=WD_ALIGN_PARAGRAPH.LEFT, first_line=0, size=10)
    p(doc, "", first_line=0)
    p(doc, "Научный руководитель:", align=WD_ALIGN_PARAGRAPH.LEFT, first_line=0)
    p(doc, "___________________________", align=WD_ALIGN_PARAGRAPH.LEFT, first_line=0)
    p(doc, "(инициалы, фамилия; ученая степень, звание)",
      align=WD_ALIGN_PARAGRAPH.LEFT, first_line=0, size=10)
    for _ in range(2):
        p(doc, "", first_line=0)
    p(doc, "Пинск, 2026", align=WD_ALIGN_PARAGRAPH.CENTER, first_line=0)
    page_break(doc)


# ---------------------------------------------------------------- оглавление
def _fld_run(par, kind, instr=None):
    """Служебный run поля Word: begin / separate / end / instrText."""
    run = par.add_run()
    if kind == "instr":
        el = OxmlElement("w:instrText")
        el.set(qn("xml:space"), "preserve")
        el.text = instr
    else:
        el = OxmlElement("w:fldChar")
        el.set(qn("w:fldCharType"), kind)
    run._r.append(el)
    return run


def contents(doc):
    p(doc, "ОГЛАВЛЕНИЕ", align=WD_ALIGN_PARAGRAPH.CENTER, first_line=0, bold=True, after=12)
    items = [
        ("ВВЕДЕНИЕ", 3),
        ("ГЛАВА 1 ИССЛЕДОВАНИЕ ПРЕДМЕТНОЙ ОБЛАСТИ", 4),
        ("1.1 Описание предметной области", 4),
        ("1.2 Анализ проблем предметной области и мероприятия по улучшению бизнес-процессов", 6),
        ("ГЛАВА 2 МОДЕЛИРОВАНИЕ ПРОЦЕССОВ РЕШАЕМОЙ ЗАДАЧИ С ИСПОЛЬЗОВАНИЕМ "
         "ОБЪЕКТНО-ОРИЕНТИРОВАННОГО ПОДХОДА", 9),
        ("2.1 Диаграмма вариантов использования", 9),
        ("2.2 Диаграмма последовательности", 12),
        ("2.3 Диаграмма кооперации", 13),
        ("2.4 Диаграмма классов", 15),
        ("2.5 Диаграмма состояний", 18),
        ("2.6 Диаграмма деятельности", 19),
        ("2.7 Диаграмма компонентов", 20),
        ("2.8 Диаграмма размещения", 21),
        ("ГЛАВА 3 ГЕНЕРАЦИЯ ПРОГРАММНОГО КОДА", 23),
        ("ЗАКЛЮЧЕНИЕ", 26),
        ("СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ", 27),
        ("ПРИЛОЖЕНИЯ", 28),
    ]
    # Оглавление — поле Word: при обновлении (F9) номера страниц станут точными,
    # а до этого показывается сохранённый результат ниже.
    first = True
    for text, page in items:
        par = toc_line(doc, text, page)
        if first:
            _fld_run(par, "begin")
            _fld_run(par, "instr", ' TOC \\o "1-2" \\h \\z \\u ')
            _fld_run(par, "separate")
            first = False
        if (text, page) == items[-1]:
            _fld_run(par, "end")
    page_break(doc)
