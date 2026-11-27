#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Сборка пояснительной записки BankInvest в один файл .docx.

Запуск из каталога docs/pz:

    python3 build_pz.py [выходной_файл]

По умолчанию результат пишется в ../../ПЗ_Инвестиции_и_ценные_бумаги.docx
(корень репозитория).
"""
import os
import sys

import docbuild as D
import part1
import part2
import part3
import part5
import part6

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = os.path.join(HERE, "..", "..", "ПЗ_Инвестиции_и_ценные_бумаги.docx")


def _contents_title(doc):
    """«СОДЕРЖАНИЕ» — как заголовок 1, но не попадает в само оглавление."""
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Cm, Pt
    par = doc.add_paragraph()
    pf = par.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf.line_spacing = 1.0
    pf.space_before = Pt(6)
    pf.space_after = Pt(9)
    pf.page_break_before = True
    r = par.add_run("СОДЕРЖАНИЕ")
    D._set_run_font(r, 16, True)
    return par


def build(path):
    doc = D.new_document()

    # титульный лист, задание, реферат — без нумерации страниц
    D.blank_footer(doc.sections[0])
    part1.title_page(doc)
    part1.task_page(doc)
    part1.referat(doc)
    _contents_title(doc)
    D.contents(doc)

    # с введения начинается нумерация страниц
    s = D.new_section(doc)
    D.enable_page_numbers(s)

    part1.introduction(doc, page_break=False)
    part1.chapter1(doc)
    part2.chapter2(doc)
    part3.chapter3(doc)
    part5.conclusion(doc)
    part5.sources(doc)
    part6.appendices(doc)

    D.save(doc, os.path.abspath(path))
    return os.path.abspath(path)


if __name__ == "__main__":
    out = build(sys.argv[1] if len(sys.argv) > 1 else DEFAULT)
    print("готово:", out)
