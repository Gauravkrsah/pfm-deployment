#!/usr/bin/env python3
"""Build a 16:9 PowerPoint deck for the PFM defense presentation.

The script intentionally uses only the Python standard library so it can run in
the project environment without installing presentation packages.
"""

from __future__ import annotations

import os
import struct
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "presentation"
OUT = OUT_DIR / "PFM_Mid_Final_Defense_Presentation.pptx"
DIAGRAMS = ROOT / "docs" / "diagrams" / "newdigrams"
COVER = OUT_DIR / "assets" / "midfinal_cover.png"

SLIDE_W = 13.333333
SLIDE_H = 7.5
EMU = 914400
PPT_W = int(SLIDE_W * EMU)
PPT_H = int(SLIDE_H * EMU)

COLORS = {
    "ink": "172033",
    "muted": "5A657A",
    "blue": "2563EB",
    "teal": "0F766E",
    "green": "16A34A",
    "red": "DC2626",
    "amber": "D97706",
    "slate": "E8EEF7",
    "white": "FFFFFF",
    "line": "D8E0EC",
}


@dataclass
class TextBox:
    x: float
    y: float
    w: float
    h: float
    text: str | list[str]
    size: int = 22
    bold: bool = False
    color: str = COLORS["ink"]
    fill: str | None = None
    line: str | None = None
    bullet: bool = False
    align: str = "l"
    margin: float = 0.12


@dataclass
class ImageBox:
    path: Path
    x: float
    y: float
    w: float
    h: float
    crop_fit: bool = False


@dataclass
class Slide:
    title: str
    kicker: str = ""
    boxes: list[TextBox] = field(default_factory=list)
    images: list[ImageBox] = field(default_factory=list)
    footer: str = "Source: MidFinal.pdf and docs/diagrams/newdigrams/"
    accent: str = COLORS["blue"]


def inches(v: float) -> int:
    return int(v * EMU)


def png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as f:
        sig = f.read(24)
    if sig[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Unsupported image type: {path}")
    return struct.unpack(">II", sig[16:24])


def fit_box(path: Path, x: float, y: float, w: float, h: float) -> tuple[float, float, float, float]:
    iw, ih = png_size(path)
    scale = min(w / iw, h / ih)
    nw = iw * scale
    nh = ih * scale
    return x + (w - nw) / 2, y + (h - nh) / 2, nw, nh


def tx(paragraphs: str | Iterable[str], *, size: int, color: str, bold: bool, bullet: bool, align: str) -> str:
    if isinstance(paragraphs, str):
        paragraphs = [paragraphs]
    parts = []
    for p in paragraphs:
        p = escape(str(p))
        bullet_xml = ""
        if bullet:
            bullet_xml = '<a:buChar char="&#8226;"/>'
        align_xml = {"c": ' algn="ctr"', "r": ' algn="r"'}.get(align, "")
        bold_xml = ' b="1"' if bold else ""
        parts.append(
            f'<a:p><a:pPr{align_xml}>{bullet_xml}</a:pPr>'
            f'<a:r><a:rPr lang="en-US" sz="{size * 100}"{bold_xml}>'
            f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
            f'<a:latin typeface="Aptos"/></a:rPr><a:t>{p}</a:t></a:r></a:p>'
        )
    return "".join(parts)


def shape_xml(idx: int, box: TextBox) -> str:
    fill = ""
    if box.fill:
        fill = f'<a:solidFill><a:srgbClr val="{box.fill}"/></a:solidFill>'
    else:
        fill = '<a:noFill/>'
    line = '<a:ln><a:noFill/></a:ln>'
    if box.line:
        line = f'<a:ln w="9525"><a:solidFill><a:srgbClr val="{box.line}"/></a:solidFill></a:ln>'
    return f"""
      <p:sp>
        <p:nvSpPr><p:cNvPr id="{idx}" name="Text {idx}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="{inches(box.x)}" y="{inches(box.y)}"/><a:ext cx="{inches(box.w)}" cy="{inches(box.h)}"/></a:xfrm>{fill}{line}</p:spPr>
        <p:txBody><a:bodyPr wrap="square" lIns="{inches(box.margin)}" tIns="{inches(box.margin/1.5)}" rIns="{inches(box.margin)}" bIns="{inches(box.margin/1.5)}"/><a:lstStyle/>
          {tx(box.text, size=box.size, color=box.color, bold=box.bold, bullet=box.bullet, align=box.align)}
        </p:txBody>
      </p:sp>"""


def picture_xml(idx: int, rid: int, img: ImageBox) -> str:
    if img.crop_fit:
        x, y, w, h = img.x, img.y, img.w, img.h
    else:
        x, y, w, h = fit_box(img.path, img.x, img.y, img.w, img.h)
    return f"""
      <p:pic>
        <p:nvPicPr><p:cNvPr id="{idx}" name="{escape(img.path.name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
        <p:spPr><a:xfrm><a:off x="{inches(x)}" y="{inches(y)}"/><a:ext cx="{inches(w)}" cy="{inches(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      </p:pic>"""


def title(slide: Slide) -> list[TextBox]:
    boxes = []
    if slide.kicker:
        boxes.append(TextBox(0.55, 0.22, 5.0, 0.32, slide.kicker.upper(), size=9, bold=True, color=slide.accent))
    boxes.append(TextBox(0.55, 0.55, 8.7, 0.55, slide.title, size=24, bold=True, color=COLORS["ink"]))
    boxes.append(TextBox(0.55, 1.17, 12.2, 0.02, "", fill=slide.accent, line=slide.accent))
    return boxes


def card(x: float, y: float, w: float, h: float, heading: str, items: list[str], color: str = COLORS["blue"]) -> list[TextBox]:
    return [
        TextBox(x, y, w, h, "", fill="F8FAFC", line=COLORS["line"]),
        TextBox(x + 0.18, y + 0.12, w - 0.36, 0.3, heading, size=15, bold=True, color=color),
        TextBox(x + 0.2, y + 0.55, w - 0.42, h - 0.7, items, size=13, bullet=True, color=COLORS["ink"]),
    ]


def deck_slides() -> list[Slide]:
    """Clean deck using diagram images only from docs/diagrams/newdigrams."""
    d = DIAGRAMS
    return [
        Slide(
            "PFM -- Personal Finance Manager",
            "Mid / Final Defense Presentation",
            boxes=[
                TextBox(0.85, 1.8, 9.2, 0.8, "PFM -- Personal Finance Manager", size=30, bold=True),
                TextBox(0.88, 2.85, 7.6, 0.9, ["Submitted by: Nirmal Sapkota, Gaurav Kumar Sah", "Supervisor: Bishon Lamichhane"], size=17, color=COLORS["muted"]),
                TextBox(0.88, 5.9, 8.8, 0.35, "Tribhuvan University | Kathford International College | May 2026", size=11, color=COLORS["muted"]),
            ],
            footer="Reference: MidFinal.pdf, title page and abstract",
            accent=COLORS["teal"],
        ),
        Slide(
            "Presentation Outline",
            "Table of contents",
            boxes=[
                TextBox(0.9, 1.55, 5.6, 4.85, [
                    "Introduction",
                    "Problem Statement",
                    "Project Objectives",
                    "Scope and Limitations",
                    "Background Study",
                    "Literature Review",
                    "Methodology and Timeline",
                ], size=20, bullet=True),
                TextBox(6.9, 1.55, 5.6, 4.85, [
                    "System Diagrams",
                    "Algorithm Details",
                    "Implementation Tools",
                    "Implementation Modules",
                    "Testing",
                    "Modules Completed and Remaining",
                    "Conclusion and References",
                ], size=20, bullet=True),
            ],
            accent=COLORS["blue"],
        ),
        Slide(
            "Introduction",
            "Project overview",
            boxes=simple_bullets([
                "What is Personal Finance Manager?",
                "Why expense tracking is important",
                "Problem with traditional manual finance apps",
            ], size=25),
            footer="Reference: MidFinal.pdf, Section 1.1 Introduction",
            accent=COLORS["blue"],
        ),
        Slide(
            "Problem Statement",
            "Identified problem",
            boxes=simple_bullets([
                "Manual data entry is repetitive",
                "Users abandon tracking over time",
                "Existing apps lack smart categorization",
                "Need for intelligent budget analysis",
            ], size=24),
            footer="Reference: MidFinal.pdf, Section 1.2 Problem Statement",
            accent=COLORS["red"],
        ),
        Slide(
            "Project Objectives",
            "Main objectives",
            boxes=[
                TextBox(
                    1.05,
                    1.75,
                    10.75,
                    2.2,
                    "To develop a smart Personal Finance Manager that automates expense tracking and budget analysis using natural language processing.",
                    size=24,
                    color=COLORS["ink"],
                )
            ],
            footer="Reference: MidFinal.pdf, Section 1.3 Project Objectives",
            accent=COLORS["green"],
        ),
        Slide(
            "Scope and Limitations",
            "Project boundary",
            boxes=[
                TextBox(0.95, 1.55, 5.55, 0.45, "Scope", size=22, bold=True, color=COLORS["green"]),
                TextBox(0.95, 2.1, 5.55, 3.75, [
                    "Expense tracking",
                    "NLP-based categorization",
                    "Budget optimization",
                    "Dashboard analytics",
                    "RAG-based financial assistant",
                ], size=18, bullet=True),
                TextBox(7.0, 1.55, 5.25, 0.45, "Limitations", size=22, bold=True, color=COLORS["amber"]),
                TextBox(7.0, 2.1, 5.25, 3.75, [
                    "No bank integration",
                    "No receipt scanning",
                    "No tax calculation",
                    "No multi-currency support",
                ], size=18, bullet=True),
            ],
            footer="Reference: MidFinal.pdf, Section 1.4 Scope and Limitation",
            accent=COLORS["amber"],
        ),
        Slide(
            "Background Study",
            "Study summary",
            boxes=simple_bullets([
                "Existing finance apps depend on manual input",
                "PFM uses NLP, RAG, and optimization",
                "Full-stack web application using React, FastAPI, and Supabase",
            ], size=24),
            footer="Reference: MidFinal.pdf, Section 2.1 Background Study",
            accent=COLORS["teal"],
        ),
        Slide(
            "Literature Review",
            "Related work",
            boxes=simple_bullets([
                "Splitwise",
                "YNAB",
                "Wallet by BudgetBakers",
                "Automated text categorization",
                "Retrieval-Augmented Generation",
            ], size=24),
            footer="Reference: MidFinal.pdf, Section 2.3 Literature Review",
            accent=COLORS["blue"],
        ),
        Slide(
            "Agile Methodology",
            "Methodology",
            boxes=simple_bullets([
                "Planning",
                "Design",
                "Development",
                "Testing",
                "Deployment",
                "Review and Maintenance",
            ], size=23),
            footer="Reference: MidFinal.pdf, Section 3.1.1 Analysis Model",
            accent=COLORS["green"],
        ),
        diagram_slide(
            "Use Case Diagram",
            "Figure 3.2: Use Case Diagram of PFM",
            d / "1_Use_Case_Diagram.png",
            ["User registration", "Login", "Manage profile", "Record transaction", "Manage transactions", "View analytics", "Finance question", "NVIDIA NIM API interaction"],
            "Diagram source: docs/diagrams/newdigrams/1_Use_Case_Diagram.png; Reference: MidFinal.pdf, Figure 3.2",
            accent=COLORS["blue"],
        ),
        Slide(
            "Project Timeline",
            "Gantt chart summary",
            boxes=simple_bullets([
                "Project planning timeline",
                "Designing phase",
                "Development phase",
                "Testing phase",
                "Deployment phase",
                "Review and maintenance phase",
            ], size=22),
            footer="Reference: MidFinal.pdf, Figure 3.3 Gantt Chart Diagram",
            accent=COLORS["amber"],
        ),
        diagram_slide(
            "Class Diagram",
            "Figure 3.4: Class Diagram of PFM",
            d / "2_Class_Diagram.png",
            ["User class", "Group class", "Expense class", "NLP Service", "Expense Parser", "RAG Service", "Expense Analyzer", "Relationships between system components"],
            "Diagram source: docs/diagrams/newdigrams/2_Class_Diagram.png; Reference: MidFinal.pdf, Figure 3.4",
            accent=COLORS["blue"],
        ),
        diagram_slide(
            "Object Diagram",
            "Figure 3.5: Object Diagram of PFM",
            d / "3_Object_Diagram.png",
            ["Runtime example of system objects", "Current user object", "Group object", "Expense object", "NLP service object", "RAG engine object", "Expense parser and analyzer objects"],
            "Diagram source: docs/diagrams/newdigrams/3_Object_Diagram.png; Reference: MidFinal.pdf, Figure 3.5",
            accent=COLORS["teal"],
        ),
        diagram_slide(
            "State Diagram",
            "Figure 3.6: State Diagram of PFM",
            d / "4_State_Diagram.png",
            ["User authentication state", "Dashboard state", "Transaction input state", "Parsing state", "Confirmation state", "Saving transaction state", "Response and refresh state"],
            "Diagram source: docs/diagrams/newdigrams/4_State_Diagram.png; Reference: MidFinal.pdf, Figure 3.6",
            accent=COLORS["green"],
        ),
        diagram_slide(
            "Sequence Diagram",
            "Figure 3.7: Sequence Diagram of PFM",
            d / "5_Sequence_Diagram.png",
            ["User enters transaction text", "Chat.js sends request", "App.js validates input", "Expense API communicates with NLP Service", "Expense Parser or NVIDIA NIM processes input", "Supabase stores transaction", "Response is shown to user"],
            "Diagram source: docs/diagrams/newdigrams/5_Sequence_Diagram.png; Reference: MidFinal.pdf, Figure 3.7",
            accent=COLORS["amber"],
        ),
        diagram_slide(
            "Activity Diagram",
            "Figure 3.8: Activity Diagram of PFM",
            d / "6_Activity_Diagram.png",
            ["Application start", "Authentication check", "Dashboard display", "Record transaction flow", "Review/AI flow", "Ask AI question flow", "Save transaction", "Logout"],
            "Diagram source: docs/diagrams/newdigrams/6_Activity_Diagram.png; Reference: MidFinal.pdf, Figure 3.8",
            accent=COLORS["teal"],
        ),
        diagram_slide(
            "Component Diagram",
            "Figure 3.9: Component Diagram of PFM",
            d / "12_Component_Diagram.png",
            ["Client application", "FastAPI backend", "Supabase platform", "PostgreSQL database", "NVIDIA NIM API", "NLP Service", "RAG Service", "Expense Analyzer"],
            "Diagram source: docs/diagrams/newdigrams/12_Component_Diagram.png; Reference: MidFinal.pdf, Figure 3.9",
            accent=COLORS["blue"],
        ),
        Slide(
            "Algorithm Details",
            "NLP Expense Parsing Algorithm",
            boxes=simple_bullets([
                "Convert input text to lowercase",
                "Extract amount using regex",
                "Match keywords with expense categories",
                "Select category with highest score",
                "Return amount and category",
            ], size=23),
            footer="Reference: MidFinal.pdf, Section 3.3 Algorithm Details",
            accent=COLORS["green"],
        ),
        Slide(
            "Implementation Tools",
            "Tools and technologies",
            boxes=simple_bullets([
                "Frontend: React.js, Tailwind CSS, Recharts",
                "Backend: FastAPI",
                "Database: Supabase PostgreSQL",
                "AI/API: NIM API",
                "CASE Tools: VS Code, Draw.io, Lucidchart, Figma",
            ], size=21),
            footer="Reference: MidFinal.pdf, Section 4.1.1 Tools Used",
            accent=COLORS["teal"],
        ),
        Slide(
            "Implementation Details of Modules",
            "Main modules",
            boxes=simple_bullets([
                "Registration Module",
                "Login Module",
                "Expense Management Module",
                "NLP Expense Parsing Module",
                "Budget Optimization Module",
                "Dashboard and Analytics Module",
                "Conversational Financial Assistant Module",
            ], size=21),
            footer="Reference: MidFinal.pdf, Section 4.1.2 Implementation Details of Modules",
            accent=COLORS["blue"],
        ),
        Slide(
            "Testing",
            "Unit test cases",
            boxes=simple_bullets([
                "User registration",
                "User login",
                "Add expense",
                "NLP expense parsing",
                "Budget optimization",
                "Dashboard analytics",
                "Conversational query",
                "Delete expense",
                "Logout",
            ], size=20),
            footer="Reference: MidFinal.pdf, Section 4.2.1 Test Cases for Unit Testing",
            accent=COLORS["green"],
        ),
        Slide(
            "Modules Completed",
            "Completed work",
            boxes=simple_bullets([
                "User Authentication",
                "Expense Management Module",
                "NLP Expense Parsing Module",
                "Dashboard and Analytics Module",
                "Budget Optimization Module",
                "Frontend Development",
                "Backend API Development",
                "Database Integration",
            ], size=20),
            footer="Reference: MidFinal.pdf, Section 5.1 Modules Completed",
            accent=COLORS["teal"],
        ),
        Slide(
            "Modules Remaining",
            "Remaining work",
            boxes=simple_bullets([
                "Conversational Financial Assistant / RAG",
                "Gemini API Optimization",
                "System Testing and Debugging",
                "Deployment and Performance Optimization",
                "Report Documentation and Final Presentation",
            ], size=22),
            footer="Reference: MidFinal.pdf, Section 5.2 Modules Remaining",
            accent=COLORS["amber"],
        ),
        Slide(
            "Conclusion",
            "Project conclusion",
            boxes=simple_bullets([
                "PFM reduces manual expense entry",
                "NLP makes tracking faster and easier",
                "Dashboard helps users understand spending",
                "Budget optimization supports better saving decisions",
                "Remaining work focuses on RAG, testing, deployment, and final documentation",
            ], size=21),
            footer="Reference: MidFinal.pdf, Chapter 5 Conclusion and Future Recommendation",
            accent=COLORS["teal"],
        ),
        Slide(
            "References",
            "Report references",
            boxes=simple_bullets([
                "Splitwise",
                "YNAB",
                "Wallet by BudgetBakers",
                "Automated Text Categorization",
                "Retrieval-Augmented Generation",
            ], size=24),
            footer="Reference: MidFinal.pdf, References [1]-[5]",
            accent=COLORS["blue"],
        ),
    ]


def slides() -> list[Slide]:
    d = DIAGRAMS
    return [
        Slide(
            "PFM (Personal Finance Manager)",
            "Mid / Final Defense Presentation",
            boxes=[
                TextBox(0.7, 1.45, 6.6, 0.9, "Smart expense tracking using NLP, optimization, and RAG", size=25, bold=True, color=COLORS["ink"]),
                TextBox(0.72, 2.55, 6.1, 0.7, ["Nirmal Sapkota (6-2-456-123-2021)", "Gaurav Kumar Sah (6-2-456-112-2021)", "Supervisor: Bishon Lamichhane"], size=14, color=COLORS["muted"]),
                TextBox(0.72, 5.85, 5.7, 0.35, "Tribhuvan University | Kathford International College | May 2026", size=10, color=COLORS["muted"]),
            ],
            images=[ImageBox(COVER, 8.05, 0.65, 3.85, 5.45)],
            footer="Source: docs/report/MidFinal.pdf, title page and abstract",
            accent=COLORS["teal"],
        ),
        Slide(
            "Presentation Outline",
            "15-minute defense structure",
            boxes=[
                *card(0.6, 1.45, 3.9, 4.55, "Foundation", ["Motivation and introduction", "Problem statement and objectives", "Scope, limitations, and applications"], COLORS["teal"]),
                *card(4.75, 1.45, 3.9, 4.55, "System Work", ["Background and literature review", "Methodology and requirements", "System analysis and diagrams", "Algorithm and implementation"], COLORS["blue"]),
                *card(8.9, 1.45, 3.9, 4.55, "Defense Close", ["Testing and results", "Analysis and future enhancements", "Conclusion", "IEEE-style references"], COLORS["amber"]),
            ],
            footer="Outline adapted from defense guideline image and MidFinal.pdf table of contents",
        ),
        Slide(
            "Motivation & Introduction",
            "Why PFM matters",
            boxes=[
                TextBox(0.75, 1.55, 5.75, 4.35, ["Personal finance management is essential for expense control, savings, and long-term planning.", "Traditional finance tools often lose users because every transaction requires form filling.", "PFM lets users type natural language expense entries such as 'paid 500 for lunch'."], size=17, bullet=True),
                *card(7.05, 1.6, 5.15, 3.35, "Project Idea", ["Reduce daily tracking friction", "Extract amount and category automatically", "Show spending insights and budget suggestions", "Support financial questions using stored records"], COLORS["green"]),
            ],
            footer="Reference: MidFinal.pdf, Chapter 1 Introduction and Abstract",
            accent=COLORS["green"],
        ),
        Slide(
            "Problem Statement & Objectives",
            "What the project solves",
            boxes=[
                *card(0.65, 1.45, 5.9, 4.8, "Problem Statement", ["Repetitive manual transaction entry", "Incorrect or inconsistent categorization", "Limited intelligent budget suggestions", "Need for conversational financial analysis"], COLORS["red"]),
                *card(6.9, 1.45, 5.8, 4.8, "Project Objectives", ["Develop a smart Personal Finance Manager", "Automate expense tracking using NLP", "Analyze spending behavior", "Recommend budget reductions and savings actions"], COLORS["blue"]),
            ],
            footer="Reference: MidFinal.pdf, Sections 1.2 and 1.3",
            accent=COLORS["red"],
        ),
        Slide(
            "Scope and Limitations",
            "Boundary of the project",
            boxes=[
                *card(0.65, 1.45, 5.9, 4.8, "Scope", ["Natural language expense entry", "Automatic categorization", "Spending analysis and dashboard", "Budget optimization", "Conversational finance assistant"], COLORS["green"]),
                *card(6.9, 1.45, 5.8, 4.8, "Limitations", ["No bank or payment gateway integration", "Depends on user-entered data", "Ambiguous text may be misclassified", "No multi-currency, tax, receipt scanning, or official financial reports"], COLORS["amber"]),
            ],
            footer="Reference: MidFinal.pdf, Section 1.4 Scope and Limitation",
            accent=COLORS["amber"],
        ),
        Slide(
            "Project Applications",
            "Where PFM can be used",
            boxes=[
                TextBox(0.7, 1.5, 11.9, 0.65, "PFM is designed as a practical web application for individual users who want faster daily expense tracking and clearer budget decisions.", size=18, bold=True, color=COLORS["ink"]),
                *card(0.7, 2.45, 3.75, 2.7, "Students", ["Track food, transport, and shopping", "Control monthly allowances", "Review spending habits"], COLORS["teal"]),
                *card(4.8, 2.45, 3.75, 2.7, "Individuals", ["Log transactions quickly", "View category-wise analytics", "Plan savings goals"], COLORS["blue"]),
                *card(8.9, 2.45, 3.75, 2.7, "Learning Value", ["Demonstrates NLP in a real workflow", "Connects frontend, backend, and database", "Shows AI-assisted finance analysis"], COLORS["green"]),
            ],
            footer="Reference: MidFinal.pdf, Abstract and Chapter 1",
            accent=COLORS["teal"],
        ),
        Slide(
            "Background & Literature Review",
            "Existing systems and research basis",
            boxes=[
                *card(0.6, 1.42, 4.0, 4.8, "Existing Apps", ["Splitwise: shared expenses", "YNAB: zero-based budgeting", "Wallet: expense tracking and analytics"], COLORS["blue"]),
                *card(4.85, 1.42, 4.0, 4.8, "Observed Gap", ["Manual entry remains common", "Category selection adds friction", "Limited conversational analysis over personal data"], COLORS["red"]),
                *card(9.1, 1.42, 3.65, 4.8, "Research Basis", ["Automated text categorization", "Retrieval-Augmented Generation", "Grounded answers from stored transaction records"], COLORS["green"]),
            ],
            footer="Reference: MidFinal.pdf, Chapter 2 and References [1]-[5]",
            accent=COLORS["blue"],
        ),
        Slide(
            "Methodology",
            "Agile development model",
            boxes=[
                TextBox(0.75, 1.45, 11.8, 0.5, "The project follows Agile methodology for iterative planning, design, development, testing, deployment, and maintenance.", size=17, bold=True),
                TextBox(0.8, 2.35, 1.55, 1.0, "Planning", size=15, bold=True, color=COLORS["white"], fill=COLORS["teal"], align="c"),
                TextBox(2.65, 2.35, 1.55, 1.0, "Design", size=15, bold=True, color=COLORS["white"], fill=COLORS["blue"], align="c"),
                TextBox(4.5, 2.35, 1.55, 1.0, "Development", size=13, bold=True, color=COLORS["white"], fill=COLORS["green"], align="c"),
                TextBox(6.35, 2.35, 1.55, 1.0, "Testing", size=15, bold=True, color=COLORS["white"], fill=COLORS["amber"], align="c"),
                TextBox(8.2, 2.35, 1.55, 1.0, "Deployment", size=13, bold=True, color=COLORS["white"], fill=COLORS["red"], align="c"),
                TextBox(10.05, 2.35, 2.0, 1.0, "Review & Maintenance", size=12, bold=True, color=COLORS["white"], fill=COLORS["muted"], align="c"),
                TextBox(1.05, 4.2, 10.8, 1.0, ["Each iteration validates features such as expense tracking, NLP parsing, dashboards, and budget optimization.", "Feedback and testing guide improvements before deployment."], size=15, bullet=True),
            ],
            footer="Reference: MidFinal.pdf, Section 3.1.1 Analysis Model",
            accent=COLORS["green"],
        ),
        Slide(
            "Requirement Analysis",
            "Functional and quality requirements",
            boxes=[
                *card(0.65, 1.45, 5.9, 4.8, "Functional Requirements", ["Registration and login", "Expense add, edit, delete, and view", "Automatic expense categorization", "Budget optimization", "Dashboard analytics", "Conversational financial query"], COLORS["blue"]),
                *card(6.9, 1.45, 5.8, 4.8, "Non-Functional Requirements", ["Usability", "Responsiveness", "Performance", "Security", "Availability"], COLORS["teal"]),
            ],
            footer="Reference: MidFinal.pdf, Section 3.1.2 Requirement Analysis",
            accent=COLORS["blue"],
        ),
        Slide(
            "Feasibility Analysis",
            "Practicality of the solution",
            boxes=[
                *card(0.65, 1.45, 2.85, 4.6, "Technical", ["React, FastAPI, Supabase, PostgreSQL, and NIM API are suitable and available."], COLORS["blue"]),
                *card(3.75, 1.45, 2.85, 4.6, "Economic", ["Uses open-source tools and free-tier cloud services to reduce cost."], COLORS["green"]),
                *card(6.85, 1.45, 2.85, 4.6, "Operational", ["Simple interface allows users to manage expenses without advanced technical skill."], COLORS["teal"]),
                *card(9.95, 1.45, 2.85, 4.6, "Schedule", ["Agile planning keeps development, testing, and documentation within the academic timeline."], COLORS["amber"]),
            ],
            footer="Reference: MidFinal.pdf, Section 3.1.3 Feasibility Analysis",
            accent=COLORS["amber"],
        ),
        Slide(
            "System Analysis Overview",
            "Core modules and architecture",
            boxes=[
                TextBox(0.65, 1.35, 5.25, 4.75, ["User authentication", "Expense management", "NLP-based expense parsing", "Budget optimization", "Dashboard analytics", "RAG-based financial assistance"], size=16, bullet=True),
            ],
            images=[ImageBox(d / "12_Component_Diagram.png", 6.05, 1.25, 6.65, 5.2)],
            footer="Diagram source: docs/diagrams/newdigrams/12_Component_Diagram.png; Reference: MidFinal.pdf, Chapter 3",
            accent=COLORS["teal"],
        ),
        Slide(
            "Use Case Diagram",
            "User interaction with PFM",
            boxes=[
                TextBox(0.65, 1.4, 3.5, 4.75, ["Register and log in", "Manage profile and expenses", "Use natural language entry", "View analytics and budget suggestions", "Ask financial questions"], size=15, bullet=True),
            ],
            images=[ImageBox(d / "1_Use_Case_Diagram.png", 4.4, 1.25, 7.9, 5.55)],
            footer="Diagram source: docs/diagrams/newdigrams/1_Use_Case_Diagram.png; Reference: MidFinal.pdf, Figure 3.2",
            accent=COLORS["blue"],
        ),
        Slide(
            "Class & Object Diagrams",
            "Static object modeling",
            boxes=[
                TextBox(0.65, 1.32, 4.0, 0.45, "Class Diagram", size=16, bold=True, color=COLORS["blue"]),
                TextBox(6.85, 1.32, 4.0, 0.45, "Object Diagram", size=16, bold=True, color=COLORS["teal"]),
            ],
            images=[
                ImageBox(d / "7_Refined_Class_Diagram.png", 0.55, 1.85, 5.95, 4.65),
                ImageBox(d / "8_Refined_Object_Diagram.png", 6.65, 1.85, 6.05, 4.65),
            ],
            footer="Diagram sources: 7_Refined_Class_Diagram.png and 8_Refined_Object_Diagram.png; Reference: MidFinal.pdf, Section 3.1.4",
            accent=COLORS["blue"],
        ),
        Slide(
            "Dynamic Modeling",
            "State and sequence behavior",
            boxes=[
                TextBox(0.65, 1.32, 4.0, 0.45, "State Diagram", size=16, bold=True, color=COLORS["green"]),
                TextBox(6.85, 1.32, 4.0, 0.45, "Sequence Diagram", size=16, bold=True, color=COLORS["amber"]),
            ],
            images=[
                ImageBox(d / "4_State_Diagram.png", 0.55, 1.85, 5.95, 4.65),
                ImageBox(d / "10_Refined_Sequence_Diagram.png", 6.65, 1.85, 6.05, 4.65),
            ],
            footer="Diagram sources: 4_State_Diagram.png and 10_Refined_Sequence_Diagram.png; Reference: MidFinal.pdf, Section 3.1.5",
            accent=COLORS["green"],
        ),
        Slide(
            "Process & Deployment View",
            "Workflow and runtime structure",
            boxes=[
                TextBox(0.65, 1.32, 3.6, 0.45, "Activity Diagram", size=16, bold=True, color=COLORS["teal"]),
                TextBox(7.0, 1.32, 3.8, 0.45, "Deployment Diagram", size=16, bold=True, color=COLORS["blue"]),
            ],
            images=[
                ImageBox(d / "6_Activity_Diagram.png", 0.75, 1.75, 4.9, 4.9),
                ImageBox(d / "13_Deployment_Diagram.png", 6.2, 2.0, 6.4, 4.2),
            ],
            footer="Diagram sources: 6_Activity_Diagram.png and 13_Deployment_Diagram.png; Reference: MidFinal.pdf, Chapter 3",
            accent=COLORS["teal"],
        ),
        Slide(
            "Algorithm Details",
            "NLP expense parsing",
            boxes=[
                *card(0.65, 1.42, 4.05, 4.8, "Input Processing", ["Convert text to lowercase", "Extract amount using regular expression", "Prepare category keyword dictionary"], COLORS["blue"]),
                *card(4.95, 1.42, 4.05, 4.8, "Category Scoring", ["Scan keywords in user input", "Increase score for matched category", "Select highest-scoring category"], COLORS["green"]),
                *card(9.25, 1.42, 3.55, 4.8, "Output", ["Return extracted amount", "Return selected category", "Fallback to Others or AI-assisted categorization when confidence is low"], COLORS["amber"]),
            ],
            footer="Reference: MidFinal.pdf, Section 3.3 Algorithm Details",
            accent=COLORS["green"],
        ),
        Slide(
            "Implementation",
            "Technology stack and tools",
            boxes=[
                *card(0.65, 1.45, 3.85, 4.8, "Frontend", ["React.js", "Tailwind CSS", "JavaScript", "Recharts for analytics"], COLORS["blue"]),
                *card(4.75, 1.45, 3.85, 4.8, "Backend", ["FastAPI", "REST API routing", "NLP processing", "NIM API integration"], COLORS["teal"]),
                *card(8.85, 1.45, 3.85, 4.8, "Database & CASE Tools", ["Supabase PostgreSQL", "Supabase authentication", "VS Code", "Draw.io, Lucidchart, Figma"], COLORS["green"]),
            ],
            footer="Reference: MidFinal.pdf, Section 4.1.1 Tools Used",
            accent=COLORS["blue"],
        ),
        Slide(
            "Implemented Modules & Testing",
            "Current result status",
            boxes=[
                *card(0.65, 1.45, 5.9, 4.8, "Modules Completed", ["User Authentication", "Expense Management", "NLP Expense Parsing", "Dashboard and Analytics", "Budget Optimization", "Frontend, Backend API, Database Integration"], COLORS["green"]),
                *card(6.9, 1.45, 5.8, 4.8, "Unit Testing Results", ["Registration: Pass", "Login: Pass", "Add/Delete expense: Pass", "NLP parsing: Pass", "Budget optimization: Pass", "Dashboard analytics: Pass", "Conversational query: Pass", "Logout: Pass"], COLORS["blue"]),
            ],
            footer="Reference: MidFinal.pdf, Sections 4.2 and 5.1",
            accent=COLORS["green"],
        ),
        Slide(
            "Analysis, Discussion & Future Enhancements",
            "What the results show",
            boxes=[
                *card(0.65, 1.45, 5.9, 4.8, "Discussion", ["NLP entry reduces friction compared with form-based tracking", "Dashboard gives quick category-wise spending visibility", "Optimization suggests reductions based on historical spending", "Secure storage supports personalized finance records"], COLORS["teal"]),
                *card(6.9, 1.45, 5.8, 4.8, "Future Enhancements", ["Complete and refine RAG financial assistant", "Optimize Gemini/NIM-assisted categorization", "Perform full system testing and debugging", "Deploy and tune production performance", "Finalize report and defense materials"], COLORS["amber"]),
            ],
            footer="Reference: MidFinal.pdf, Sections 5.1 and 5.2",
            accent=COLORS["amber"],
        ),
        Slide(
            "Conclusion & References",
            "Defense close",
            boxes=[
                TextBox(0.65, 1.35, 5.5, 4.7, ["PFM simplifies personal expense tracking through natural language input.", "NLP reduces repetitive manual entry and improves transaction categorization.", "Analytics and budget optimization help users make better financial decisions.", "The system demonstrates a modern React, FastAPI, and Supabase full-stack architecture."], size=15, bullet=True),
                TextBox(6.55, 1.35, 6.1, 4.85, ["[1] Splitwise, 'Splitwise Official Website,' 2026.", "[2] YNAB, 'YNAB Official Website,' 2026.", "[3] Wallet by BudgetBakers, 'Wallet Official Website,' 2026.", "[4] F. Sebastiani, 'Machine Learning in Automated Text Categorization,' ACM Computing Surveys, 2002.", "[5] P. Lewis et al., 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks,' 2020.", "[6] N. Sapkota and G. K. Sah, 'PFM(Personal Finance Manager),' Mid-Defense Report, TU/Kathford, May 2026.", "[7] PFM system diagrams, docs/diagrams/newdigrams/, May 2026."], size=10, color=COLORS["ink"]),
            ],
            footer="References compiled from MidFinal.pdf references and local diagram assets",
            accent=COLORS["teal"],
        ),
    ]


def slide_xml(slide: Slide, rel_start: int, slide_no: int, total_slides: int) -> tuple[str, str, list[Path]]:
    content = []
    idx = 2
    for box in title(slide) + slide.boxes:
        content.append(shape_xml(idx, box))
        idx += 1
    image_rels = []
    rel_id = rel_start
    for img in slide.images:
        content.append(picture_xml(idx, rel_id, img))
        image_rels.append((rel_id, img.path))
        rel_id += 1
        idx += 1
    if slide_no > 1:
        content.append(shape_xml(idx, TextBox(11.55, 7.02, 1.15, 0.25, f"{slide_no} / {total_slides}", size=9, color=COLORS["muted"], align="r")))
    xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      {''.join(content)}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>"""
    rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
    for rid, path in image_rels:
        rels.append(f'<Relationship Id="rId{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/{escape(path.name)}"/>')
    rels.append("</Relationships>")
    return xml, "".join(rels), [p for _, p in image_rels]


def write_static(z: zipfile.ZipFile, count: int) -> None:
    z.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>""")
    overrides = [
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Default Extension="png" ContentType="image/png"/>',
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    ]
    overrides += [f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' for i in range(1, count + 1)]
    z.writestr("[Content_Types].xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">{"".join(overrides)}</Types>')
    z.writestr("docProps/core.xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>PFM Mid/Final Defense Presentation</dc:title><dc:creator>Codex</dc:creator><cp:lastModifiedBy>Codex</cp:lastModifiedBy></cp:coreProperties>""")
    z.writestr("docProps/app.xml", f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Codex Python OOXML Builder</Application><Slides>{count}</Slides></Properties>""")
    sld_ids = "".join([f'<p:sldId id="{255+i}" r:id="rId{i}"/>' for i in range(1, count + 1)])
    z.writestr("ppt/presentation.xml", f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>{sld_ids}</p:sldIdLst><p:sldSz cx="{PPT_W}" cy="{PPT_H}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>""")
    rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
    rels += [f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>' for i in range(1, count + 1)]
    rels.append("</Relationships>")
    z.writestr("ppt/_rels/presentation.xml.rels", "".join(rels))


def simple_bullets(items: list[str], y: float = 1.75, size: int = 24) -> list[TextBox]:
    return [TextBox(1.05, y, 11.1, 4.8, items, size=size, bullet=True, color=COLORS["ink"])]


def diagram_slide(
    title_text: str,
    figure: str,
    image_path: Path,
    mention: list[str],
    footer: str,
    *,
    accent: str = COLORS["blue"],
) -> Slide:
    return Slide(
        title_text,
        figure,
        boxes=[
            TextBox(9.55, 1.55, 2.55, 0.35, "Mention", size=14, bold=True, color=accent),
            TextBox(9.55, 2.0, 2.8, 4.25, mention, size=12, bullet=True, color=COLORS["ink"]),
        ],
        images=[ImageBox(image_path, 0.72, 1.38, 8.35, 5.35)],
        footer=footer,
        accent=accent,
    )


def simple_slides() -> list[Slide]:
    """Clean 20-slide deck that closely follows the user-provided outline."""
    d = DIAGRAMS
    ref = "Reference: MidFinal.pdf"
    return [
        Slide(
            "PFM (Personal Finance Manager)",
            "Mid / Final Defense Presentation",
            boxes=[
                TextBox(0.85, 1.85, 9.0, 0.8, "Smart Personal Finance Manager", size=30, bold=True),
                TextBox(0.88, 2.85, 7.2, 0.9, ["Nirmal Sapkota (6-2-456-123-2021)", "Gaurav Kumar Sah (6-2-456-112-2021)", "Supervisor: Bishon Lamichhane"], size=16, color=COLORS["muted"]),
                TextBox(0.88, 5.9, 8.8, 0.35, "Tribhuvan University | Kathford International College | May 2026", size=11, color=COLORS["muted"]),
            ],
            footer="Reference: MidFinal.pdf, title page and abstract",
            accent=COLORS["teal"],
        ),
        Slide(
            "Introduction",
            "Project overview",
            boxes=simple_bullets([
                "Personal finance management",
                "Problem with manual expense tracking",
                "Need for smart and automated finance system",
            ], size=26),
            footer="Reference: MidFinal.pdf, Section 1.1 Introduction",
            accent=COLORS["blue"],
        ),
        Slide(
            "Problem Statement",
            "Identified problem",
            boxes=simple_bullets([
                "Repetitive manual data entry",
                "Incorrect expense categorization",
                "Lack of intelligent budget suggestions",
                "Need for conversational financial analysis",
            ], size=24),
            footer="Reference: MidFinal.pdf, Section 1.2 Problem Statement",
            accent=COLORS["red"],
        ),
        Slide(
            "Project Objectives",
            "Main objectives",
            boxes=simple_bullets([
                "Develop smart Personal Finance Manager",
                "Automate expense tracking",
                "Use NLP for natural language input",
                "Provide budget analysis and optimization",
            ], size=24),
            footer="Reference: MidFinal.pdf, Section 1.3 Project Objectives",
            accent=COLORS["green"],
        ),
        Slide(
            "Scope and Limitations",
            "Project boundary",
            boxes=[
                TextBox(0.95, 1.55, 5.55, 0.45, "Scope", size=22, bold=True, color=COLORS["green"]),
                TextBox(0.95, 2.1, 5.55, 3.75, [
                    "Natural language expense entry",
                    "Automatic categorization",
                    "Spending analysis",
                    "Budget optimization",
                    "Conversational finance assistant",
                ], size=18, bullet=True),
                TextBox(7.0, 1.55, 5.25, 0.45, "Limitations", size=22, bold=True, color=COLORS["amber"]),
                TextBox(7.0, 2.1, 5.25, 3.75, [
                    "No bank/payment gateway integration",
                    "Depends on user-entered data",
                    "No multi-currency support",
                    "No tax, receipt scanning, or official reports",
                ], size=18, bullet=True),
            ],
            footer="Reference: MidFinal.pdf, Section 1.4 Scope and Limitation",
            accent=COLORS["amber"],
        ),
        Slide(
            "Background Study",
            "Study summary",
            boxes=simple_bullets([
                "Existing finance apps rely on manual input",
                "PFM uses NLP, RAG, and optimization",
                "Built with React, FastAPI, and Supabase",
            ], size=25),
            footer="Reference: MidFinal.pdf, Section 2.1 Background Study",
            accent=COLORS["teal"],
        ),
        Slide(
            "Literature Review",
            "Related work",
            boxes=simple_bullets([
                "Splitwise",
                "YNAB",
                "Wallet by BudgetBakers",
                "Automated text categorization",
                "RAG-based response generation",
            ], size=24),
            footer="Reference: MidFinal.pdf, Section 2.3 Literature Review",
            accent=COLORS["blue"],
        ),
        Slide(
            "System Analysis",
            "Major system modules",
            boxes=simple_bullets([
                "User authentication",
                "Expense management",
                "NLP expense parsing",
                "Budget optimization",
                "Dashboard analytics",
                "RAG-based assistant",
            ], size=23),
            footer="Reference: MidFinal.pdf, Section 3.1 System Analysis",
            accent=COLORS["teal"],
        ),
        Slide(
            "Methodology",
            "Agile methodology",
            boxes=simple_bullets([
                "Planning",
                "Design",
                "Development",
                "Testing",
                "Deployment",
                "Review & Maintenance",
            ], size=23),
            footer="Reference: MidFinal.pdf, Section 3.1.1 Analysis Model",
            accent=COLORS["green"],
        ),
        Slide(
            "Requirement Analysis",
            "Functional requirements",
            boxes=simple_bullets([
                "Registration and login",
                "Expense management",
                "Automatic expense categorization",
                "Budget optimization",
                "Dashboard analytics",
                "Conversational financial query",
            ], size=22),
            footer="Reference: MidFinal.pdf, Section 3.1.2.1 Functional Requirement",
            accent=COLORS["blue"],
        ),
        Slide(
            "Non-Functional Requirements",
            "System quality requirements",
            boxes=simple_bullets([
                "Usability",
                "Responsiveness",
                "Performance",
                "Security",
                "Availability",
            ], size=25),
            footer="Reference: MidFinal.pdf, Section 3.1.2.3 Non Functional Requirement",
            accent=COLORS["teal"],
        ),
        Slide(
            "Feasibility Analysis",
            "Project feasibility",
            boxes=simple_bullets([
                "Technical feasibility",
                "Economic feasibility",
                "Operational feasibility",
                "Schedule feasibility",
            ], size=25),
            footer="Reference: MidFinal.pdf, Section 3.1.3 Feasibility Analysis",
            accent=COLORS["amber"],
        ),
        Slide(
            "System Diagrams",
            "UML and design diagrams",
            boxes=[
                TextBox(0.85, 1.45, 5.3, 4.95, [
                    "Use Case Diagram",
                    "Class Diagram",
                    "Object Diagram",
                    "State Diagram",
                    "Sequence Diagram",
                    "Activity Diagram",
                    "Component Diagram",
                ], size=21, bullet=True),
                TextBox(7.0, 1.45, 4.85, 0.4, "Sample diagram reference", size=15, bold=True, color=COLORS["muted"]),
            ],
            images=[ImageBox(d / "12_Component_Diagram.png", 6.65, 2.05, 5.35, 3.7)],
            footer="Diagram source: docs/diagrams/newdigrams/12_Component_Diagram.png; Reference: MidFinal.pdf, Chapter 3 figures",
            accent=COLORS["blue"],
        ),
        Slide(
            "Algorithm Details",
            "NLP Expense Parsing Algorithm",
            boxes=simple_bullets([
                "Normalize input text",
                "Extract amount using regex",
                "Match keywords with categories",
                "Select highest-scoring category",
                "Return amount and category",
            ], size=23),
            footer="Reference: MidFinal.pdf, Section 3.3 Algorithm Details",
            accent=COLORS["green"],
        ),
        Slide(
            "Implementation",
            "Tools and technologies",
            boxes=simple_bullets([
                "Frontend: React.js, Tailwind CSS, Recharts",
                "Backend: FastAPI, NIM API",
                "Database: Supabase PostgreSQL",
                "CASE Tools: VS Code, Draw.io, Lucidchart, Figma",
            ], size=22),
            footer="Reference: MidFinal.pdf, Section 4.1.1 Tools Used",
            accent=COLORS["teal"],
        ),
        Slide(
            "Implemented Modules",
            "Main modules",
            boxes=simple_bullets([
                "Registration Module",
                "Login Module",
                "Expense Management Module",
                "NLP Expense Parsing Module",
                "Budget Optimization Module",
                "Dashboard and Analytics Module",
                "Conversational Financial Assistant Module",
            ], size=21),
            footer="Reference: MidFinal.pdf, Section 4.1.2 Implementation Details of Modules",
            accent=COLORS["blue"],
        ),
        Slide(
            "Testing",
            "Unit testing",
            boxes=simple_bullets([
                "User registration",
                "User login",
                "Add expense",
                "NLP parsing",
                "Budget optimization",
                "Dashboard analytics",
                "Conversational query",
                "Delete expense",
                "Logout",
            ], size=20),
            footer="Reference: MidFinal.pdf, Section 4.2.1 Test Cases for Unit Testing",
            accent=COLORS["green"],
        ),
        Slide(
            "Modules Completed",
            "Completed work",
            boxes=simple_bullets([
                "User Authentication",
                "Expense Management Module",
                "NLP Expense Parsing Module",
                "Dashboard and Analytics Module",
                "Budget Optimization Module",
                "Frontend Development",
                "Backend API Development",
                "Database Integration",
            ], size=20),
            footer="Reference: MidFinal.pdf, Section 5.1 Modules Completed",
            accent=COLORS["teal"],
        ),
        Slide(
            "Modules Remaining",
            "Remaining work",
            boxes=simple_bullets([
                "Conversational Financial Assistant / RAG",
                "Gemini API Optimization",
                "System Testing and Debugging",
                "Deployment and Performance Optimization",
                "Report Documentation and Final Presentation",
            ], size=22),
            footer="Reference: MidFinal.pdf, Section 5.2 Modules Remaining",
            accent=COLORS["amber"],
        ),
        Slide(
            "Conclusion",
            "Project conclusion",
            boxes=simple_bullets([
                "PFM simplifies expense tracking",
                "Reduces manual entry using NLP",
                "Provides analytics and budget suggestions",
                "Uses modern full-stack architecture",
                "Future work focuses on RAG completion, optimization, testing, and deployment",
            ], size=22),
            footer="Reference: MidFinal.pdf, Chapter 5 Conclusion and Future Recommendation",
            accent=COLORS["teal"],
        ),
    ]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    deck = deck_slides()
    for slide in deck:
        for image in slide.images:
            try:
                image.path.resolve().relative_to(DIAGRAMS.resolve())
            except ValueError as exc:
                raise ValueError(f"Deck image is not from {DIAGRAMS}: {image.path}") from exc
    media_written: set[str] = set()
    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED) as z:
        write_static(z, len(deck))
        for i, s in enumerate(deck, 1):
            xml, rels, media = slide_xml(s, 2, i, len(deck))
            z.writestr(f"ppt/slides/slide{i}.xml", xml)
            z.writestr(f"ppt/slides/_rels/slide{i}.xml.rels", rels)
            for path in media:
                key = path.name
                if key not in media_written:
                    z.write(path, f"ppt/media/{key}")
                    media_written.add(key)
    print(OUT)


if __name__ == "__main__":
    main()
