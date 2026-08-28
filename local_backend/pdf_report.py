from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

PAGE_W = 841.89
PAGE_H = 595.28
MARGIN = 28.0


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return default


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return default


def _pdf_text(value: Any) -> str:
    text = str(value if value is not None else "")
    # Standard PDF Helvetica supports WinAnsi/Latin text. Keep reports robust if
    # an unexpected character is entered by replacing unsupported glyphs.
    text = text.encode("cp1252", errors="replace").decode("cp1252")
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _display_date(value: Any) -> str:
    text = str(value or "").strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(text[:10], fmt).strftime("%d-%m-%Y")
        except ValueError:
            pass
    return text


def _money(value: Any) -> str:
    return f"${_num(value):,.2f}"


def _number(value: Any, digits: int = 0) -> str:
    return f"{_num(value):,.{digits}f}"


class PDFCanvas:
    def __init__(self) -> None:
        self.pages: list[list[str]] = []
        self.current: list[str] = []
        self.page_number = 0
        self.new_page()

    def new_page(self) -> None:
        if self.current:
            self.pages.append(self.current)
        self.current = []
        self.page_number += 1

    def _y(self, y: float) -> float:
        return PAGE_H - y

    def line(self, x1: float, y1: float, x2: float, y2: float, width: float = 0.5, color=(0.82, 0.85, 0.89)) -> None:
        r, g, b = color
        self.current.append(f"q {r:.3f} {g:.3f} {b:.3f} RG {width:.2f} w {x1:.2f} {self._y(y1):.2f} m {x2:.2f} {self._y(y2):.2f} l S Q")

    def rect(self, x: float, y: float, w: float, h: float, fill=None, stroke=None, radius: float = 0) -> None:
        # Rounded rectangles are approximated as normal rectangles to keep the
        # writer dependency-free and highly reliable.
        commands = ["q"]
        if fill is not None:
            r, g, b = fill
            commands.append(f"{r:.3f} {g:.3f} {b:.3f} rg")
        if stroke is not None:
            r, g, b = stroke
            commands.append(f"{r:.3f} {g:.3f} {b:.3f} RG 0.7 w")
        commands.append(f"{x:.2f} {self._y(y + h):.2f} {w:.2f} {h:.2f} re")
        if fill is not None and stroke is not None:
            commands.append("B")
        elif fill is not None:
            commands.append("f")
        else:
            commands.append("S")
        commands.append("Q")
        self.current.append(" ".join(commands))

    def text(self, x: float, y: float, text: Any, size: float = 9, bold: bool = False, color=(0.10, 0.13, 0.18), align: str = "left", max_width: float | None = None) -> None:
        value = str(text if text is not None else "")
        if max_width is not None:
            value = self.ellipsis(value, max_width, size, bold)
        approx = self.text_width(value, size, bold)
        if align == "center":
            x -= approx / 2
        elif align == "right":
            x -= approx
        r, g, b = color
        font = "F2" if bold else "F1"
        self.current.append(f"BT /{font} {size:.2f} Tf {r:.3f} {g:.3f} {b:.3f} rg 1 0 0 1 {x:.2f} {self._y(y):.2f} Tm ({_pdf_text(value)}) Tj ET")

    @staticmethod
    def text_width(text: str, size: float, bold: bool = False) -> float:
        # Helvetica average character width approximation is sufficient for
        # compact business-report labels and avoids external font dependencies.
        factor = 0.54 if bold else 0.50
        return len(str(text)) * size * factor

    def ellipsis(self, text: str, max_width: float, size: float, bold: bool = False) -> str:
        text = str(text)
        if self.text_width(text, size, bold) <= max_width:
            return text
        suffix = "..."
        while text and self.text_width(text + suffix, size, bold) > max_width:
            text = text[:-1]
        return text + suffix

    def wrap(self, text: Any, max_width: float, size: float = 8, bold: bool = False) -> list[str]:
        words = str(text or "").split()
        if not words:
            return [""]
        lines: list[str] = []
        line = words[0]
        for word in words[1:]:
            test = f"{line} {word}"
            if self.text_width(test, size, bold) <= max_width:
                line = test
            else:
                lines.append(line)
                line = word
        lines.append(line)
        return lines

    def save(self, destination: Path) -> None:
        if self.current:
            self.pages.append(self.current)
            self.current = []
        destination.parent.mkdir(parents=True, exist_ok=True)

        objects: list[bytes] = []
        objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
        page_obj_numbers = [5 + i * 2 for i in range(len(self.pages))]
        kids = " ".join(f"{n} 0 R" for n in page_obj_numbers)
        objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(self.pages)} >>".encode("ascii"))
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
        for index, commands in enumerate(self.pages):
            page_num = page_obj_numbers[index]
            content_num = page_num + 1
            page_obj = (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W:.2f} {PAGE_H:.2f}] "
                f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_num} 0 R >>"
            ).encode("ascii")
            stream = ("\n".join(commands) + "\n").encode("cp1252", errors="replace")
            content_obj = f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"endstream"
            objects.extend([page_obj, content_obj])

        output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for number, obj in enumerate(objects, start=1):
            offsets.append(len(output))
            output.extend(f"{number} 0 obj\n".encode("ascii"))
            output.extend(obj)
            output.extend(b"\nendobj\n")
        xref = len(output)
        output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
        output.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
        output.extend(
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii")
        )
        destination.write_bytes(output)


def build_daily_closing_pdf(report: dict[str, Any], destination: Path) -> Path:
    pdf = PDFCanvas()
    navy = (0.06, 0.10, 0.17)
    text = (0.10, 0.13, 0.18)
    muted = (0.39, 0.44, 0.52)
    line = (0.86, 0.89, 0.92)
    subtle = (0.97, 0.98, 0.99)
    green = (0.03, 0.48, 0.31)
    red = (0.85, 0.18, 0.13)

    def page_header(continuation: bool = False) -> float:
        pdf.rect(0, 0, PAGE_W, 5, fill=navy)
        pdf.text(MARGIN, 29, "JOLI POLI", 16, True, navy)
        pdf.text(MARGIN, 46, "DAILY CLOSING REPORT" + (" - CONTINUED" if continuation else ""), 8.5, True, muted)
        pdf.text(PAGE_W - MARGIN, 29, _display_date(report.get("report_date")), 10, True, text, "right")
        pdf.line(MARGIN, 57, PAGE_W - MARGIN, 57, 0.8, line)
        return 72

    def footer() -> None:
        y = PAGE_H - 22
        pdf.line(MARGIN, y - 7, PAGE_W - MARGIN, y - 7, 0.5, line)
        pdf.text(MARGIN, y + 8, f"Generated {datetime.now().strftime('%d-%m-%Y %H:%M')}", 7.5, False, muted)
        pdf.text(PAGE_W - MARGIN, y + 8, f"Page {pdf.page_number}", 7.5, False, muted, "right")

    y = page_header(False)

    # Closing details band
    pdf.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 48, fill=subtle, stroke=line)
    fields = [
        ("OUTLET", report.get("outlet") or "-"),
        ("CLOSED BY", report.get("closed_by") or "-"),
        ("VERIFIED BY", report.get("verified_by") or "-"),
        ("EXCHANGE RATE", f"1 USD = {_number(report.get('exchange_rate'), 0)} KHR"),
        ("PRICE / COIN", f"1 Coin = ${_num(report.get('coin_price')):.4f}"),
    ]
    colw = (PAGE_W - 2 * MARGIN) / len(fields)
    for i, (label, value) in enumerate(fields):
        x = MARGIN + i * colw + 10
        if i:
            pdf.line(MARGIN + i * colw, y + 8, MARGIN + i * colw, y + 40, 0.5, line)
        pdf.text(x, y + 17, label, 6.8, True, muted)
        pdf.text(x, y + 34, value, 9.0, True, text, max_width=colw - 18)
    y += 60

    # Payment inputs
    pdf.text(MARGIN, y, "PAYMENT & COINS", 8.5, True, navy)
    y += 9
    payment = [
        ("Cash Sales (KHR)", f"{_number(report.get('cash_sales_khr'), 0)} KHR"),
        ("ABA QR Sales", _money(report.get("aba_sales"))),
        ("Beginning Coins", _number(report.get("beginning_coins"))),
        ("Coins Added", _number(report.get("coins_added"))),
        ("Final Coins", _number(report.get("final_coins"))),
    ]
    pw = (PAGE_W - 2 * MARGIN - 4 * 8) / 5
    for i, (label, value) in enumerate(payment):
        x = MARGIN + i * (pw + 8)
        pdf.rect(x, y, pw, 36, fill=(1, 1, 1), stroke=line)
        pdf.text(x + 8, y + 13, label.upper(), 6.2, True, muted, max_width=pw - 16)
        pdf.text(x + 8, y + 28, value, 9.2, True, text, max_width=pw - 16)
    y += 49

    # KPI cards: 8 metrics in one row on landscape.
    metrics = [
        ("TOTAL SALES", _money(report.get("total_sales")), None),
        ("COINS USED", _number(report.get("coins_used")), None),
        ("COIN RETURN", _number(report.get("coin_return")), None),
        ("LOSE / OVER", f"{_int(report.get('lose_over')):+d}", None),
        ("PRODUCTS USED", _number(report.get("products_used")), None),
        ("AVG / PRODUCT", _money(report.get("avg_product")), None),
        ("DISCOUNT", _money(report.get("discount_usd")), report.get("discount_percent")),
        ("WIN RATE", "-" if report.get("overall_win_rate") is None else _number(report.get("overall_win_rate"), 2), None),
    ]
    gap = 5
    mw = (PAGE_W - 2 * MARGIN - gap * 7) / 8
    for i, (label, value, extra) in enumerate(metrics):
        x = MARGIN + i * (mw + gap)
        pdf.rect(x, y, mw, 49, fill=(1, 1, 1), stroke=line)
        pdf.rect(x, y, 3, 49, fill=navy)
        pdf.text(x + 9, y + 14, label, 5.9, True, muted, max_width=mw - 16)
        value_color = red if label == "DISCOUNT" and _num(report.get("discount_usd")) > 0 else text
        pdf.text(x + 9, y + 31, value, 10.5, True, value_color, max_width=mw - 16)
        if label == "DISCOUNT" and extra is not None:
            pct_color = red if _num(report.get("discount_usd")) > 0 else green
            pdf.text(x + 9, y + 43, f"{abs(_num(extra)):.2f}%", 6.5, True, pct_color)
    y += 62

    # Table definition
    columns = [
        ("Machine", 48, "left"),
        ("Type", 45, "left"),
        ("Product / Barcode", 172, "left"),
        ("Begin", 48, "center"),
        ("Final", 48, "center"),
        ("Used", 42, "center"),
        ("Begin Meter", 62, "center"),
        ("Final Meter", 62, "center"),
        ("Coins Used", 58, "center"),
        ("Win Rate", 57, "center"),
        ("Status", 70, "center"),
    ]
    table_x = MARGIN
    table_w = sum(width for _, width, _ in columns)

    def draw_table_header(table_y: float) -> float:
        pdf.rect(table_x, table_y, table_w, 25, fill=navy)
        x = table_x
        for label, width, align in columns:
            tx = x + 6 if align == "left" else x + width / 2
            pdf.text(tx, table_y + 16, label, 6.4, True, (1, 1, 1), align if align != "left" else "left", max_width=width - 10)
            x += width
        return table_y + 25

    def new_table_page() -> float:
        footer()
        pdf.new_page()
        yy = page_header(True)
        pdf.text(MARGIN, yy, "MACHINE & PRODUCT DETAIL", 8.5, True, navy)
        yy += 10
        return draw_table_header(yy)

    pdf.text(MARGIN, y, "MACHINE & PRODUCT DETAIL", 8.5, True, navy)
    y += 10
    y = draw_table_header(y)

    machines = list(report.get("machines") or [])
    for machine_index, machine in enumerate(machines):
        products = list(machine.get("products") or []) or [{"barcode": "No barcode", "begin_qty": 0, "final_qty": 0, "qty_used": 0}]
        for product_index, product in enumerate(products):
            row_h = 23
            if y + row_h > PAGE_H - 48:
                y = new_table_page()
            fill = (1, 1, 1) if machine_index % 2 == 0 else (0.985, 0.99, 0.996)
            pdf.rect(table_x, y, table_w, row_h, fill=fill)
            x = table_x
            first = product_index == 0
            values = [
                machine.get("machine_id") if first else "",
                machine.get("machine_type") if first else "",
                product.get("barcode") or f"Product {product_index + 1}",
                _number(product.get("begin_qty")),
                _number(product.get("final_qty")),
                _number(product.get("qty_used")),
                _number(machine.get("begin_meter")) if first and machine.get("begin_meter") not in (None, "") else ("" if not first else "-"),
                _number(machine.get("final_meter")) if first and machine.get("final_meter") not in (None, "") else ("" if not first else "-"),
                _number(machine.get("coins_used")) if first else "",
                ("-" if machine.get("win_rate") is None else _number(machine.get("win_rate"), 2)) if first else "",
                machine.get("status") if first else "",
            ]
            for (label, width, align), value in zip(columns, values):
                pdf.line(x, y, x, y + row_h, 0.35, line)
                tx = x + 6 if align == "left" else x + width / 2
                pdf.text(tx, y + 15, value, 7.1, first and label in {"Machine", "Product / Barcode"}, text, align if align != "left" else "left", max_width=width - 10)
                x += width
            pdf.line(table_x + table_w, y, table_x + table_w, y + row_h, 0.35, line)
            pdf.line(table_x, y + row_h, table_x + table_w, y + row_h, 0.35, line)
            y += row_h
        # Stronger line at machine boundary.
        pdf.line(table_x, y, table_x + table_w, y, 0.8, (0.77, 0.81, 0.86))

    notes = str(report.get("notes") or "").strip()
    if notes:
        y += 10
        lines = pdf.wrap(notes, table_w - 20, 7.5)
        box_h = max(34, 19 + len(lines) * 10)
        if y + box_h > PAGE_H - 48:
            y = new_table_page()
            y += 6
        pdf.rect(table_x, y, table_w, box_h, fill=subtle, stroke=line)
        pdf.text(table_x + 10, y + 13, "NOTES", 6.5, True, muted)
        for i, note_line in enumerate(lines):
            pdf.text(table_x + 10, y + 27 + i * 10, note_line, 7.5, False, text, max_width=table_w - 20)

    footer()
    pdf.save(destination)
    return destination
