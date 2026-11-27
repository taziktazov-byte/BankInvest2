#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Сборка пояснительной записки BankInvest по требованиям оформления.

Все параметры взяты из «Требования оформления.docx»:
  * А4, поля 2,5 / 2 / 3,0 / 1,5 см, отступ до верхнего колонтитула 2,5, до нижнего 2;
  * основной текст — Times New Roman 14 pt, интервал «полуторный», по ширине,
    отступ первой строки 1,25 см, запрет висячих строк;
  * «Заголовок 1» — 16 pt, полужирный, ПРОПИСНЫЕ, по центру, отступ 0,
    интервал до 6 / после 9, одинарный, глава — с нового листа;
  * «Заголовок 2» и «Заголовок 3» — 14 pt, полужирный, отступ 1,25, по ширине,
    интервал до 9 / после 6, не разрывать, не отрывать от следующего;
  * подпись рисунка — TNR 14, по центру, одинарный, «Рисунок 2.1 – Название»;
  * надпись таблицы — «Таблица 1.1 – Название» слева с абзацного отступа;
  * номер страницы — снизу по центру, начиная со страницы с введением;
  * листинги — только в приложении; приложения — с нового листа, «ПРИЛОЖЕНИЕ 1»
    в правом верхнем углу.

Стили задаются через XML: python-docx не умеет часть нужных свойств
(запрет висячих строк, «не отрывать от следующего», точные отступы).
"""
import os

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

FONT = "Times New Roman"
TEXT_W = Cm(16.5)               # 21 − 3,0 − 1,5

# латиница в тексте выделяется курсивом, кроме имён собственных
PROPER = {
    "BankInvest", "Windows", "Microsoft", "Excel", "Word", "Visual", "Studio",
    "SQL", "Server", "Node.js", "npm", "Docker", "Linux", "Debian", "Ubuntu",
    "Google", "Chrome", "Firefox", "Mozilla", "SSMS", "Azure", "Yandex",
    "MSSQL", "JSON", "WinForms", "T-SQL", "F9",
}


# ---------------------------------------------------------------- служебное
def _el(tag, **attrs):
    e = OxmlElement(tag)
    for k, v in attrs.items():
        e.set(qn("w:" + k), str(v))
    return e


def _set_run_font(run, size=None, bold=None, italic=None, name=FONT):
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = OxmlElement("w:rFonts")
        rpr.insert(0, rf)
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rf.set(qn(a), name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold
    if italic is not None:
        run.font.italic = italic


def _style_font(style, size, bold=False, name=FONT):
    style.font.name = name
    style.font.size = Pt(size)
    style.font.bold = bold
    rpr = style.element.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = OxmlElement("w:rFonts")
        rpr.insert(0, rf)
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rf.set(qn(a), name)


def _spacing(style, line=None, before=0, after=0, first=None, rule="auto"):
    pf = style.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    if line is not None:
        pf.line_spacing = line
    if first is not None:
        pf.first_line_indent = first


def _flag(style, tag, on=True):
    """Включает/выключает логический флаг в pPr стиля."""
    ppr = style.element.get_or_add_pPr()
    el = ppr.find(qn("w:" + tag))
    if el is None:
        el = OxmlElement("w:" + tag)
        ppr.append(el)
    val = "1" if on else "0"
    el.set(qn("w:val"), val)


# ---------------------------------------------------------------- документ
def new_document():
    doc = Document()
    # --- страница и поля
    s = doc.sections[0]
    s.page_width, s.page_height = Cm(21), Cm(29.7)
    s.top_margin, s.bottom_margin = Cm(2.5), Cm(2)
    s.left_margin, s.right_margin = Cm(3.0), Cm(1.5)
    s.header_distance, s.footer_distance = Cm(2.5), Cm(2)
    s.section_start = WD_SECTION.NEW_PAGE

    # --- «обычный»: TNR 14, полуторный, по ширине, отступ 1,25, висячие строки запрещены
    n = doc.styles["Normal"]
    _style_font(n, 14)
    _spacing(n, line=1.5, before=0, after=0, first=Cm(1.25))
    n.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    _flag(n, "widowControl", True)
    _flag(n, "autoSpaceDE", False)
    _flag(n, "autoSpaceDN", False)

    # --- «Заголовок 1»
    h1 = doc.styles["Heading 1"]
    _style_font(h1, 16, bold=True)
    _spacing(h1, line=1.0, before=6, after=9, first=Cm(0))
    h1.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    h1.paragraph_format.keep_with_next = True
    _flag(h1, "widowControl", True)
    h1.paragraph_format.page_break_before = True

    # --- «Заголовок 2» и «Заголовок 3»
    for name in ("Heading 2", "Heading 3"):
        h = doc.styles[name]
        _style_font(h, 14, bold=True)
        _spacing(h, line=1.5, before=9, after=6, first=Cm(1.25))
        h.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        h.paragraph_format.keep_together = True
        h.paragraph_format.keep_with_next = True
        _flag(h, "widowControl", True)

    # переносы слов в документе выключены («без переноса слов»)
    settings = doc.settings.element
    if settings.find(qn("w:autoHyphenation")) is None:
        settings.append(_el("w:autoHyphenation", **{"val": "0"}))
    return doc


def enable_page_numbers(section):
    """Номер страницы снизу по центру (поле PAGE)."""
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Cm(0)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.0
    run = p.add_run()
    _set_run_font(run, 14)
    fld = _el("w:fldSimple", instr=" PAGE ")
    r = OxmlElement("w:r")
    t = OxmlElement("w:t")
    t.text = "1"
    r.append(t)
    fld.append(r)
    p._p.append(fld)


def blank_footer(section):
    """Колонтитул без номера (титул, задание, реферат, содержание)."""
    section.footer.is_linked_to_previous = False
    for p in section.footer.paragraphs:
        for r in list(p.runs):
            r._element.getparent().remove(r._element)


def new_section(doc):
    s = doc.add_section(WD_SECTION.NEW_PAGE)
    s.page_width, s.page_height = Cm(21), Cm(29.7)
    s.top_margin, s.bottom_margin = Cm(2.5), Cm(2)
    s.left_margin, s.right_margin = Cm(3.0), Cm(1.5)
    s.header_distance, s.footer_distance = Cm(2.5), Cm(2)
    return s


# ---------------------------------------------------------------- латиница курсивом
def _runs(p, text, size=14, bold=False, italic_latin=True, name=FONT):
    """Раскладывает строку на runs, выделяя курсивом латинские буквы."""
    if not italic_latin:
        r = p.add_run(text)
        _set_run_font(r, size, bold)
        return
    buf, i = "", 0
    tokens = []
    while i < len(text):
        ch = text[i]
        if ch.isascii() and ch.isalpha():
            j = i
            while j < len(text) and (text[j].isascii() and (text[j].isalnum() or text[j] in ".-_")):
                j += 1
            tokens.append((buf, False))
            tokens.append((text[i:j], True))
            buf, i = "", j
        else:
            buf += ch
            i += 1
    tokens.append((buf, False))
    for chunk, is_latin in tokens:
        if not chunk:
            continue
        r = p.add_run(chunk)
        italic = None
        if is_latin:
            word = chunk.rstrip(".,;:)")
            import re as _re
            italic = bool(_re.search("[A-Za-z]", word)) and word not in PROPER
        _set_run_font(r, size, bold, italic)


def p(doc, text, indent=True, align="justify", spacing=1.5, size=14, bold=False,
      italic_latin=True, before=0, after=0, keep=False):
    par = doc.add_paragraph()
    pf = par.paragraph_format
    pf.first_line_indent = Cm(1.25) if indent else Cm(0)
    pf.line_spacing = spacing
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.alignment = {"justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
                    "center": WD_ALIGN_PARAGRAPH.CENTER,
                    "left": WD_ALIGN_PARAGRAPH.LEFT,
                    "right": WD_ALIGN_PARAGRAPH.RIGHT}[align]
    if keep:
        pf.keep_with_next = True
    _runs(par, text, size=size, bold=bold, italic_latin=italic_latin)
    return par


def h1(doc, text, page_break=True):
    """Заголовок 1: ПРОПИСНЫЕ, по центру, с нового листа."""
    par = doc.add_heading(level=1)
    par.paragraph_format.page_break_before = page_break
    r = par.add_run(text.upper())
    _set_run_font(r, 16, True)
    if par.runs:
        for run in par.runs[1:]:
            _set_run_font(run, 16, True)
    return par


def h2(doc, text):
    par = doc.add_heading(level=2)
    r = par.add_run(text)
    _set_run_font(r, 14, True)
    return par


def h3(doc, text):
    par = doc.add_heading(level=3)
    r = par.add_run(text)
    _set_run_font(r, 14, True)
    return par


def bullet(doc, text, marker="–"):
    """Перечисление с абзаца (4.5.5): маркер и текст в одном абзаце."""
    par = p(doc, f"{marker} {text}")
    return par


def caption_fig(doc, number, title):
    """«Рисунок 2.1 – Название»: по центру, TNR 14, одинарный, без точки."""
    par = doc.add_paragraph()
    pf = par.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf.line_spacing = 1.0
    pf.space_before = Pt(6)
    pf.space_after = Pt(10)
    pf.keep_with_next = False
    _runs(par, f"Рисунок {number} – {title}", size=14)
    return par


def figure(doc, path, number, title, width_cm=16.0):
    par = doc.add_paragraph()
    pf = par.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf.line_spacing = 1.0
    pf.space_before = Pt(10)
    pf.space_after = Pt(4)
    pf.keep_with_next = True
    run = par.add_run()
    run.add_picture(path, width=Cm(width_cm))
    caption_fig(doc, number, title)
    return par


def caption_table(doc, number, title):
    """«Таблица 1.1 – Название»: слева, с абзацного отступа, без точки."""
    par = doc.add_paragraph()
    pf = par.paragraph_format
    pf.first_line_indent = Cm(1.25)
    pf.left_indent = Cm(0)
    pf.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pf.line_spacing = 1.0
    pf.space_before = Pt(10)
    pf.space_after = Pt(4)
    pf.keep_with_next = True
    _runs(par, f"Таблица {number} – {title}", size=14)
    return par


def _cell_text(cell, text, size=12, bold=False, align="left", spacing=1.0):
    cell.text = ""
    par = cell.paragraphs[0]
    pf = par.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.line_spacing = spacing
    pf.space_before = Pt(2)
    pf.space_after = Pt(2)
    pf.alignment = {"left": WD_ALIGN_PARAGRAPH.LEFT,
                    "center": WD_ALIGN_PARAGRAPH.CENTER,
                    "right": WD_ALIGN_PARAGRAPH.RIGHT,
                    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY}[align]
    for n, line in enumerate(str(text).split("\n")):
        if n:
            par.add_run().add_break()
        _runs(par, line, size=size, bold=bold)


def _borders(table):
    tbl = table._tbl
    tblPr = tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{edge}")
        e.set(qn("w:val"), "single")
        e.set(qn("w:sz"), "6")
        e.set(qn("w:space"), "0")
        e.set(qn("w:color"), "000000")
        borders.append(e)
    tblPr.append(borders)


def table(doc, header, rows, widths_cm, size=12, aligns=None, header_align="center",
          repeat_header=True):
    """Таблица по ширине текста; шапка повторяется на новой странице."""
    n = len(header)
    aligns = aligns or ["left"] * n
    t = doc.add_table(rows=1, cols=n)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    _borders(t)
    # фиксированные ширины
    tblPr = t._tbl.tblPr
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tblPr.append(layout)
    for j, w in enumerate(widths_cm):
        for cell in t.columns[j].cells:
            cell.width = Cm(w)
    for j, h in enumerate(header):
        c = t.rows[0].cells[j]
        c.width = Cm(widths_cm[j])
        _cell_text(c, h, size=size, bold=False, align=header_align)
    if repeat_header:
        trPr = t.rows[0]._tr.get_or_add_trPr()
        trPr.append(OxmlElement("w:tblHeader"))
        trPr.append(OxmlElement("w:cantSplit"))
    for row in rows:
        cells = t.add_row().cells
        trPr = t.rows[-1]._tr.get_or_add_trPr()
        trPr.append(OxmlElement("w:cantSplit"))
        for j, v in enumerate(row):
            cells[j].width = Cm(widths_cm[j])
            _cell_text(cells[j], v, size=size, align=aligns[j])
    # пустой абзац после таблицы, чтобы не слипалась с текстом
    after = doc.add_paragraph()
    after.paragraph_format.first_line_indent = Cm(0)
    after.paragraph_format.space_before = Pt(0)
    after.paragraph_format.space_after = Pt(6)
    after.paragraph_format.line_spacing = 1.0
    return t


def listing(doc, text, size=10):
    """Листинг для приложения: моноширинный, одинарный, без отступа."""
    par = doc.add_paragraph()
    pf = par.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.left_indent = Cm(0)
    pf.line_spacing = 1.0
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.alignment = WD_ALIGN_PARAGRAPH.LEFT
    for n, line in enumerate(text.split("\n")):
        if n:
            par.add_run().add_break()
        r = par.add_run(line if line else " ")
        _set_run_font(r, size, name="Courier New")
    return par


# ---------------------------------------------------------------- формулы (OMML)
def omml(xml):
    """Возвращает элемент OMML из строки разметки Math (m:oMath)."""
    from lxml import etree
    ns = ('xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
          'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"')
    return etree.fromstring(f'<m:oMath {ns}>{xml}</m:oMath>')


def _mr(text, italic=False):
    """Обычный математический run (m:r) с текстом."""
    sty = "" if italic else '<m:rPr><m:sty m:val="p"/></m:rPr>'
    return (f'<m:r>{sty}<w:rPr><w:rFonts w:ascii="Times New Roman" '
            f'w:hAnsi="Times New Roman"/><w:sz w:val="28"/></w:rPr>'
            f'<m:t xml:space="preserve">{text}</m:t></m:r>')


def _frac(num, den):
    return f'<m:f><m:num>{num}</m:num><m:den>{den}</m:den></m:f>'


def _sub(base, sub):
    return f'<m:sSub><m:e>{base}</m:e><m:sub>{sub}</m:sub></m:sSub>'


def _sup(base, sup):
    return f'<m:sSup><m:e>{base}</m:e><m:sup>{sup}</m:sup></m:sSup>'


def _nary(chr_, lo, hi, body):
    return (f'<m:nary><m:naryPr><m:chr m:val="{chr_}"/><m:limLoc m:val="undOvr"/>'
            f'</m:naryPr><m:sub>{lo}</m:sub><m:sup>{hi}</m:sup><m:e>{body}</m:e></m:nary>')


def _paren(inner):
    return f'<m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e>{inner}</m:e></m:d>'


def formula(doc, xml, number):
    """Формула по центру с номером справа: «… (3.1)»."""
    par = doc.add_paragraph()
    pf = par.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pf.line_spacing = 1.5
    pf.space_before = Pt(8)
    pf.space_after = Pt(8)
    pf.tab_stops.add_tab_stop(Cm(8.25), WD_TAB_ALIGNMENT.CENTER)
    pf.tab_stops.add_tab_stop(Cm(16.5), WD_TAB_ALIGNMENT.RIGHT)
    run = par.add_run("\t")
    _set_run_font(run, 14)
    par._p.append(omml(xml))
    r2 = par.add_run(f"\t({number})")
    _set_run_font(r2, 14)
    return par


def where(doc, lines):
    """Пояснение «где» без двоеточия и без абзацного отступа (4.4.2)."""
    first = p(doc, "где " + lines[0], indent=False)
    for line in lines[1:]:
        p(doc, line, indent=False)
    return first


def page_break(doc):
    par = doc.add_paragraph()
    par.paragraph_format.space_after = Pt(0)
    par.add_run().add_break(WD_BREAK.PAGE)
    return par


# ---------------------------------------------------------------- содержание
def contents(doc):
    """Поле TOC по стилям «Заголовок 1–2» (обновляется в Word по F9)."""
    par = doc.add_paragraph()
    pf = par.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.line_spacing = 1.5
    r = par.add_run()
    _set_run_font(r, 14)
    b = OxmlElement("w:fldChar")
    b.set(qn("w:fldCharType"), "begin")
    r._element.append(b)

    r2 = par.add_run()
    _set_run_font(r2, 14)
    it = OxmlElement("w:instrText")
    it.set(qn("xml:space"), "preserve")
    it.text = ' TOC \\o "1-2" \\h \\z \\u '
    r2._element.append(it)

    r3 = par.add_run()
    _set_run_font(r3, 14)
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    r3._element.append(sep)

    r4 = par.add_run("Обновите поле (F9), чтобы построить оглавление.")
    _set_run_font(r4, 14)

    r5 = par.add_run()
    _set_run_font(r5, 14)
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    r5._element.append(end)
    return par


def save(doc, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    doc.save(path)
    return path
