#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборка документа самостоятельной работы.

Запуск:
    python3 build_doc.py

Результат: Самостоятельная_работа_инвестиции_и_ценные_бумаги.docx
"""
import os
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt

from build_part1 import (BODY, OUT, contents, p, page_break, set_style_font,
                         title_page)
from build_part2 import chapter1, introduction
from build_part3 import chapter2
from build_part4 import (appendix_a, appendix_b, chapter3, conclusion, sources)


def setup(doc):
    sec = doc.sections[0]
    sec.page_width = Cm(21.0)
    sec.page_height = Cm(29.7)
    sec.left_margin = Cm(3.0)
    sec.right_margin = Cm(1.5)
    sec.top_margin = Cm(2.0)
    sec.bottom_margin = Cm(2.0)

    set_style_font(doc.styles["Normal"], size=BODY)
    normal = doc.styles["Normal"].paragraph_format
    normal.line_spacing = 1.5
    normal.space_before = Pt(0)
    normal.space_after = Pt(0)
    normal.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    normal.first_line_indent = Cm(1.25)

    for name, size in (("Heading 1", BODY), ("Heading 2", BODY)):
        set_style_font(doc.styles[name], size=size, bold=True)
        f = doc.styles[name].font
        f.color.rgb = __import__("docx").shared.RGBColor(0, 0, 0)


def add_page_numbers(doc):
    """Номер страницы в нижнем колонтитуле по центру."""
    footer = doc.sections[0].footer
    par = footer.paragraphs[0]
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = par.add_run()
    fld = run._r.makeelement(
        "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}fldSimple",
        {"{http://schemas.openxmlformats.org/wordprocessingml/2006/main}instr": "PAGE"})
    run._r.addnext(fld)
    run.font.size = Pt(12)
    run.font.name = "Times New Roman"


def main():
    doc = Document()
    setup(doc)
    add_page_numbers(doc)

    title_page(doc)
    contents(doc)
    introduction(doc)
    chapter1(doc)
    chapter2(doc)
    chapter3(doc)
    conclusion(doc)
    sources(doc)
    appendix_a(doc)
    appendix_b(doc)

    doc.save(OUT)
    size = os.path.getsize(OUT)
    print(f"Готово: {os.path.basename(OUT)} ({size / 1024:.0f} КБ)")
    print(f"Путь: {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
