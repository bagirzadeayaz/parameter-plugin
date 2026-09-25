#!/usr/bin/env python3
"""Render one saved Kontakt Parameter result as a polished, deterministic PDF."""

from __future__ import annotations

import html
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

RED = colors.HexColor("#E30613")
INK = colors.HexColor("#171A21")
MUTED = colors.HexColor("#667085")
LINE = colors.HexColor("#E5E7EB")
SOFT = colors.HexColor("#F7F8FA")
WHITE = colors.white


def _register_fonts() -> tuple[str, str]:
    regular_candidates = [
        os.environ.get("KONTAKT_PDF_FONT_REGULAR", ""),
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    bold_candidates = [
        os.environ.get("KONTAKT_PDF_FONT_BOLD", ""),
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
    ]
    regular = next((path for path in regular_candidates if path and Path(path).is_file()), None)
    bold = next((path for path in bold_candidates if path and Path(path).is_file()), regular)
    if not regular:
        raise RuntimeError("A Unicode font required for the PDF template was not found.")
    pdfmetrics.registerFont(TTFont("KontaktSans", regular))
    pdfmetrics.registerFont(TTFont("KontaktSansBold", bold))
    return "KontaktSans", "KontaktSansBold"


def _text(value: object) -> str:
    return html.escape(str(value if value not in (None, "") else "—"))


def _source_links(item: dict) -> str:
    links = []
    for source in item.get("sources") or []:
        url = str(source.get("url") or "")
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            continue
        label = source.get("label") or parsed.hostname.removeprefix("www.")
        links.append(f'<link href="{html.escape(url, quote=True)}" color="#B80510">{_text(label)}</link>')
    return '<br/>'.join(links) or ("—" if item.get("value") in (None, "", "—") else "Mənbə yoxdur / Нет источника")


def _category_label(value: str) -> str:
    return {
        "phone": "Telefon / Телефон",
        "tablet": "Planşet / Планшет",
        "notebook": "Noutbuk / Ноутбук",
        "fridge": "Soyuducu / Холодильник",
        "washing_machine": "Paltaryuyan / Стиральная машина",
    }.get(value, value or "Məhsul")


def _date_label(value: object) -> str:
    try:
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp /= 1000
        return datetime.fromtimestamp(timestamp).strftime("%d.%m.%Y")
    except (TypeError, ValueError, OSError):
        return datetime.now().strftime("%d.%m.%Y")


class KontaktPdfTemplate(BaseDocTemplate):
    def __init__(self, filename: str, *, regular_font: str, bold_font: str, **kwargs):
        super().__init__(filename, **kwargs)
        self.regular_font = regular_font
        self.bold_font = bold_font
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="content")
        self.addPageTemplates(PageTemplate(id="kontakt", frames=[frame], onPage=self._page_chrome))

    def _page_chrome(self, canvas, doc):
        width, height = A4
        canvas.saveState()
        canvas.setFillColor(RED)
        canvas.rect(0, height - 5 * mm, width, 5 * mm, stroke=0, fill=1)
        canvas.setFont(self.bold_font, 10)
        canvas.setFillColor(RED)
        canvas.drawString(self.leftMargin, height - 14 * mm, "KONTAKT")
        canvas.setFont(self.regular_font, 8)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(width - self.rightMargin, height - 14 * mm, "Məhsul kartı / Карточка товара")
        canvas.setStrokeColor(LINE)
        canvas.line(self.leftMargin, 14 * mm, width - self.rightMargin, 14 * mm)
        canvas.setFont(self.regular_font, 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(self.leftMargin, 9 * mm, "Kontakt Parameter • AZ / RU")
        canvas.drawRightString(width - self.rightMargin, 9 * mm, f"Səhifə / Страница {doc.page}")
        canvas.restoreState()


def _styles(regular: str, bold: str):
    sample = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("Title", parent=sample["Title"], fontName=bold, fontSize=22, leading=27, textColor=INK, alignment=TA_LEFT, spaceAfter=4 * mm),
        "eyebrow": ParagraphStyle("Eyebrow", parent=sample["Normal"], fontName=bold, fontSize=9, leading=12, textColor=RED, uppercase=True, spaceAfter=2 * mm),
        "section": ParagraphStyle("Section", parent=sample["Heading2"], fontName=bold, fontSize=14, leading=18, textColor=INK, spaceBefore=5 * mm, spaceAfter=3 * mm, keepWithNext=False),
        "body": ParagraphStyle("Body", parent=sample["BodyText"], fontName=regular, fontSize=9, leading=13, textColor=INK),
        "small": ParagraphStyle("Small", parent=sample["BodyText"], fontName=regular, fontSize=7.5, leading=10, textColor=MUTED),
        "card_label": ParagraphStyle("CardLabel", parent=sample["BodyText"], fontName=regular, fontSize=7.5, leading=9, textColor=MUTED, alignment=TA_CENTER),
        "card_value": ParagraphStyle("CardValue", parent=sample["BodyText"], fontName=bold, fontSize=10, leading=13, textColor=INK, alignment=TA_CENTER),
        "table_head": ParagraphStyle("TableHead", parent=sample["BodyText"], fontName=bold, fontSize=8.5, leading=11, textColor=WHITE),
        "table_cell": ParagraphStyle("TableCell", parent=sample["BodyText"], fontName=regular, fontSize=8.2, leading=11, textColor=INK),
        "table_key": ParagraphStyle("TableKey", parent=sample["BodyText"], fontName=bold, fontSize=8.2, leading=11, textColor=INK),
        "source_cell": ParagraphStyle("SourceCell", parent=sample["BodyText"], fontName=regular, fontSize=7.3, leading=10, textColor=MUTED, splitLongWords=True),
    }


def _summary_cards(data: dict, styles: dict, available_width: float):
    found = int(data.get("foundFields") or 0)
    required = int(data.get("requiredFields") or len(data.get("parameters") or []))
    pct = int(round(float(data.get("coveragePercent") or (found / required * 100 if required else 0))))
    cards = [
        ("Kateqoriya / Категория", _category_label(str(data.get("category") or ""))),
        ("Əhatə / Заполнено", f"{found}/{required} • {pct}%"),
        ("Mənbələr / Источники", str(data.get("sourceCount") or 0)),
        ("Tarix / Дата", _date_label(data.get("updatedAt"))),
    ]
    cells = []
    for label, value in cards:
        cells.append([Paragraph(_text(value), styles["card_value"]), Paragraph(_text(label), styles["card_label"])])
    table = Table([cells], colWidths=[available_width / 4] * 4, rowHeights=18 * mm)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
    ]))
    return table


def _product_image(path: str, max_width: float, max_height: float):
    source = Path(path)
    if not source.is_file():
        raise RuntimeError("The verified product image is unavailable for PDF generation.")
    with PILImage.open(source) as image:
        image.load()
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")
        if image.mode == "RGBA":
            background = PILImage.new("RGB", image.size, "white")
            background.paste(image, mask=image.getchannel("A"))
            image = background
        else:
            image = image.convert("RGB")
        converted = source.with_suffix(".pdf-image.jpg")
        image.save(converted, "JPEG", quality=92, optimize=True)
        width, height = image.size
    scale = min(max_width / width, max_height / height, 1)
    return Image(str(converted), width=width * scale, height=height * scale)


def build_pdf(data: dict, output_path: str) -> None:
    regular, bold = _register_fonts()
    styles = _styles(regular, bold)
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    doc = KontaktPdfTemplate(
        str(destination),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=22 * mm,
        bottomMargin=20 * mm,
        regular_font=regular,
        bold_font=bold,
        title=str(data.get("productName") or "Kontakt Parameter"),
        author="Kontakt Parameter",
        subject="Yoxlanmış məhsul parametrləri",
    )

    story = [
        Spacer(1, 4 * mm),
        Paragraph("MƏHSUL PARAMETRLƏRİ / ХАРАКТЕРИСТИКИ", styles["eyebrow"]),
        Paragraph(_text(data.get("productName") or "Məhsul"), styles["title"]),
        Paragraph("AZ / RU • — təsdiqlənməyib / не подтверждено", styles["small"]),
        Spacer(1, 2 * mm),
        _summary_cards(data, styles, doc.width),
        Spacer(1, 6 * mm),
    ]

    hero = _product_image(str(data.get("imagePath") or ""), doc.width * 0.64, 42 * mm)
    hero_box = Table([[hero]], colWidths=[doc.width], rowHeights=[48 * mm])
    hero_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
    ]))
    story.extend([hero_box, Paragraph("Parametrlər / Характеристики", styles["section"])])

    table_rows = [[
        Paragraph("№", styles["table_head"]),
        Paragraph("Parametr / Параметр", styles["table_head"]),
        Paragraph("AZ / RU", styles["table_head"]),
        Paragraph("Mənbə / Источник", styles["table_head"]),
    ]]
    for index, item in enumerate(data.get("parameters") or [], start=1):
        table_rows.append([
            Paragraph(str(index), styles["table_cell"]),
            Paragraph(_text(item.get("name")) + '<br/><font color="#667085">' + _text(item.get("nameRu")) + '</font>', styles["table_key"]),
            Paragraph('<font color="#667085">AZ</font>  ' + _text(item.get("value")) + '<br/><font color="#667085">RU</font>  ' + _text(item.get("valueRu")), styles["table_cell"]),
            Paragraph(_source_links(item), styles["source_cell"]),
        ])
    parameter_table = Table(table_rows, colWidths=[11 * mm, 57 * mm, 63 * mm, doc.width - 131 * mm], repeatRows=1, hAlign="LEFT")
    parameter_style = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.0 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.0 * mm),
        ("LEFTPADDING", (0, 0), (0, -1), 1.5 * mm),
        ("RIGHTPADDING", (0, 0), (0, -1), 1.5 * mm),
    ]
    for row in range(1, len(table_rows)):
        if row % 2 == 0:
            parameter_style.append(("BACKGROUND", (0, row), (-1, row), SOFT))
    parameter_table.setStyle(TableStyle(parameter_style))
    story.append(parameter_table)

    sources = data.get("sources") or []
    if sources:
        source_rows = [[Paragraph("Mənbə / Источник", styles["table_head"]), Paragraph("Əhatə / Заполнено", styles["table_head"])]]
        required = int(data.get("requiredFields") or len(data.get("parameters") or []))
        for source in sources:
            title = source.get("title") or source.get("url") or "Mənbə"
            url = source.get("url") or ""
            label = f'<link href="{html.escape(url, quote=True)}" color="#E30613">{_text(title)}</link>' if url else _text(title)
            count = int(source.get("supportedFieldCount") or 0)
            source_rows.append([Paragraph(label, styles["body"]), Paragraph(f"{count}/{int(source.get('requiredFieldCount') or required)}", styles["body"])])
        source_table = Table(source_rows, colWidths=[doc.width - 29 * mm, 29 * mm], repeatRows=1)
        source_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("GRID", (0, 0), (-1, -1), 0.45, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
            ("TOPPADDING", (0, 0), (-1, -1), 1.4 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.4 * mm),
        ]))
        story.append(KeepTogether([Paragraph("Mənbələr / Источники", styles["section"]), source_table]))

    doc.build(story)


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: generate_product_pdf.py INPUT_JSON OUTPUT_PDF", file=sys.stderr)
        return 2
    input_path, output_path = sys.argv[1:]
    with open(input_path, "r", encoding="utf-8") as stream:
        data = json.load(stream)
    build_pdf(data, output_path)
    print(json.dumps({"path": str(Path(output_path).resolve()), "bytes": Path(output_path).stat().st_size}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
