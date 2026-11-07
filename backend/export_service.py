from io import BytesIO
from xml.sax.saxutils import escape

from docx import Document
from docx.shared import Inches, Pt

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    HRFlowable
)


def create_pdf(report, title="DeepResearch AI Report"):

    buffer = BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.7 * inch,
        leftMargin=0.7 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontSize=20,
        textColor=colors.HexColor("#2563EB"),
        alignment=TA_CENTER,
        spaceAfter=20
    )

    heading_style = ParagraphStyle(
        "ReportHeading",
        parent=styles["Heading2"],
        fontSize=14,
        textColor=colors.HexColor("#1D4ED8"),
        spaceBefore=14,
        spaceAfter=8
    )

    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["BodyText"],
        fontSize=10,
        leading=15,
        spaceAfter=8,
        wordWrap="CJK"
    )

    content = [
        Paragraph(escape(title), title_style),
        HRFlowable(width="100%", color=colors.lightgrey),
        Spacer(1, 15)
    ]

    for line in report.splitlines():

        line = line.strip()

        if not line:
            content.append(Spacer(1, 6))

        elif line.startswith("#"):
            heading = line.lstrip("#").strip()
            content.append(
                Paragraph(escape(heading), heading_style)
            )

        elif line.startswith(("- ", "* ")):
            text = escape(line[2:])
            content.append(
                Paragraph("• " + text, body_style)
            )

        else:
            content.append(
                Paragraph(escape(line), body_style)
            )

    document.build(content)

    buffer.seek(0)
    return buffer


def create_docx(report, title="DeepResearch AI Report"):

    document = Document()

    document.add_heading(title, 0)

    for line in report.splitlines():

        line = line.strip()

        if not line:
            continue

        elif line.startswith("### "):
            document.add_heading(line[4:], level=3)

        elif line.startswith("## "):
            document.add_heading(line[3:], level=2)

        elif line.startswith("# "):
            document.add_heading(line[2:], level=1)

        elif line.startswith(("- ", "* ")):
            document.add_paragraph(
                line[2:],
                style="List Bullet"
            )

        else:
            document.add_paragraph(line)

    buffer = BytesIO()
    document.save(buffer)

    buffer.seek(0)
    return buffer