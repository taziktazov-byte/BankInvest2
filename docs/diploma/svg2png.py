#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Конвертация SVG (из make_figures.py) в PNG для вставки в Word.

Почему так: в окружении нет cairo, а ImageMagick не принимает SVG без rsvg.
Путь: svglib (SVG → reportlab drawing) → PDF → pymupdf (PDF → PNG, 300 dpi).
Кириллица работает за счёт регистрации TTF-шрифта DejaVu Sans под именем Arial.
"""
import os
import sys

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
FONTS = {
    "Arial": "DejaVuSans.ttf",
    "Arial-Bold": "DejaVuSans-Bold.ttf",
    "Helvetica": "DejaVuSans.ttf",
}


def register_fonts():
    for name, file in FONTS.items():
        path = os.path.join(FONT_DIR, file)
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(name, path))
            except Exception as e:                      # noqa: BLE001
                print(f"  ! шрифт {name}: {e}")


def convert(svg_path, png_path, dpi=170):
    from svglib.svglib import svg2rlg
    from reportlab.graphics import renderPDF
    import pymupdf

    drawing = svg2rlg(svg_path)
    if drawing is None:
        raise RuntimeError(f"svglib не разобрал {svg_path}")
    # все текстовые узлы переводим на зарегистрированный шрифт
    _force_font(drawing)

    tmp_pdf = png_path.replace(".png", ".__tmp.pdf")
    renderPDF.drawToFile(drawing, tmp_pdf)
    doc = pymupdf.open(tmp_pdf)
    pix = doc[0].get_pixmap(dpi=dpi)
    pix.save(png_path)
    doc.close()
    os.remove(tmp_pdf)
    return pix.width, pix.height


def _force_font(node):
    """Рекурсивно заменяет fontName у всех строк на Arial/Arial-Bold."""
    for attr in ("fontName",):
        val = getattr(node, attr, None)
        if isinstance(val, str) and val:
            low = val.lower()
            bold = "bold" in low or "black" in low or "heavy" in low
            setattr(node, attr, "Arial-Bold" if bold else "Arial")
    for child in getattr(node, "contents", []) or []:
        _force_font(child)
    # группы/тексты reportlab держат вложенные объекты в ._content
    for child in getattr(node, "_content", []) or []:
        _force_font(child)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    register_fonts()
    svgs = sorted(f for f in os.listdir(here) if f.endswith(".svg"))
    if not svgs:
        print("SVG не найдены — сначала запустите make_figures.py")
        return 1
    for name in svgs:
        svg = os.path.join(here, name)
        png = os.path.join(here, name.replace(".svg", ".png"))
        try:
            w, h = convert(svg, png)
            print(f"  ✔ {name} → {os.path.basename(png)}  ({w}×{h})")
        except Exception as e:                          # noqa: BLE001
            print(f"  ✖ {name}: {e}")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
