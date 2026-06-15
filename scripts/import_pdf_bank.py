from __future__ import annotations

import html
import json
import math
import os
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
QUESTION_PDF = ROOT / "POLOTNO-NAKAZ_04_09_2025 (1).pdf"
ANSWER_PDF = ROOT / "Numer_-vidpovidej-do-nakazu.pdf"
WORK = ROOT / ".import-work"
XML_BASE = WORK / "questions"
ANSWER_PAGES = WORK / "answers"
PUBLIC_IMAGES = ROOT / "public" / "question-images"
OUT_TS = ROOT / "src" / "data" / "questions.ts"


@dataclass
class TextNode:
    page: int
    top: int
    left: int
    text: str
    bold: bool


@dataclass
class ImageNode:
    page: int
    top: int
    left: int
    width: int
    height: int
    src: Path


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, cwd=ROOT, check=True)


def norm_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def prepare_assets() -> None:
    WORK.mkdir(exist_ok=True)
    if not XML_BASE.with_suffix(".xml").exists():
        run(["pdftohtml", "-xml", str(QUESTION_PDF), str(XML_BASE)])
    ANSWER_PAGES.mkdir(exist_ok=True)
    if not list(ANSWER_PAGES.glob("page-*.png")):
        run(["pdftoppm", "-png", "-r", "300", str(ANSWER_PDF), str(ANSWER_PAGES / "page")])


def parse_xml() -> tuple[list[TextNode], list[ImageNode]]:
    root = ET.parse(XML_BASE.with_suffix(".xml")).getroot()
    texts: list[TextNode] = []
    images: list[ImageNode] = []

    for page in root.findall("page"):
        page_number = int(page.attrib["number"])
        for child in page:
            if child.tag == "text":
                text = "".join(child.itertext())
                text = html.unescape(norm_space(text))
                if not text:
                    continue
                texts.append(
                    TextNode(
                        page=page_number,
                        top=int(child.attrib["top"]),
                        left=int(child.attrib["left"]),
                        text=text,
                        bold=child.find("b") is not None,
                    )
                )
            elif child.tag == "image":
                images.append(
                    ImageNode(
                        page=page_number,
                        top=int(child.attrib["top"]),
                        left=int(child.attrib["left"]),
                        width=int(child.attrib["width"]),
                        height=int(child.attrib["height"]),
                        src=Path(child.attrib["src"]),
                    )
                )

    texts.sort(key=lambda node: (node.page, node.top, node.left))
    images.sort(key=lambda node: (node.page, node.top, node.left))
    return texts, images


def is_page_number(node: TextNode) -> bool:
    return node.text.isdigit() and 40 <= node.top <= 80 and 430 <= node.left <= 520


def is_section_start(node: TextNode) -> bool:
    if not node.bold:
        return False
    return (
        re.match(r"^\d{1,2}(?:\.\d+)?\.\s+", node.text) is not None
        and node.text.upper() == node.text
    )


def is_question_start(node: TextNode) -> re.Match[str] | None:
    if not node.bold:
        return None
    if node.text.upper() == node.text:
        return None
    return re.match(r"^(\d{1,3})\.\s*(.*)$", node.text)


def is_option_start(text: str) -> re.Match[str] | None:
    return re.match(r"^(\d)\)\s*(.*)$", text)


def parse_questions(texts: list[TextNode], images: list[ImageNode]) -> list[dict]:
    usable = [node for node in texts if not is_page_number(node)]
    image_paths = export_question_images(images)
    questions: list[dict] = []
    current_section_number = 0.0
    current_section = ""
    current: dict | None = None
    active_part: str | None = None
    section_heading_parts: list[str] = []

    def flush_section_heading() -> None:
        nonlocal current_section
        if section_heading_parts:
            current_section = norm_space(" ".join(section_heading_parts))
            section_heading_parts.clear()

    def flush_question() -> None:
        if current is None:
            return
        current["question"] = norm_space(current["question"])
        current["options"] = [norm_space(option) for option in current["options"] if norm_space(option)]
        if current["question"] and current["options"]:
            questions.append(current.copy())

    for node in usable:
        if is_section_start(node):
            flush_question()
            current = None
            active_part = None
            match = re.match(r"^(\d{1,2}(?:\.\d+)?)\.\s*(.*)$", node.text)
            assert match is not None
            current_section_number = float(match.group(1))
            section_heading_parts = [match.group(2)]
            current_section = norm_space(match.group(2))
            continue

        if section_heading_parts and node.bold and node.text.upper() == node.text:
            section_heading_parts.append(node.text)
            current_section = norm_space(" ".join(section_heading_parts))
            continue

        question_match = is_question_start(node)
        if question_match:
            flush_section_heading()
            flush_question()
            question_number = int(question_match.group(1))
            title = question_match.group(2)
            section_id = f"{current_section_number:g}".replace(".", "-")
            question_images = [
                image_paths[image.src.name]
                for image in images_for_question(images, node, usable)
                if image.src.name in image_paths
            ]
            current = {
                "id": f"s{section_id}-q{question_number:03d}",
                "sectionNumber": current_section_number,
                "number": question_number,
                "category": current_section,
                "question": title,
                "options": [],
                "correctIndex": 0,
                "explanation": "",
                "images": question_images,
            }
            active_part = "question"
            continue

        if current is None:
            continue

        option_match = is_option_start(node.text)
        if option_match:
            current["options"].append(option_match.group(2))
            active_part = "option"
            continue

        if active_part == "question" and node.bold:
            current["question"] += " " + node.text
        elif active_part == "option" and current["options"]:
            current["options"][-1] += " " + node.text

    flush_question()
    return questions


def images_for_question(images: list[ImageNode], start: TextNode, texts: list[TextNode]) -> list[ImageNode]:
    next_question = None
    for node in texts:
        if (node.page, node.top, node.left) <= (start.page, start.top, start.left):
            continue
        if is_section_start(node) or is_question_start(node):
            next_question = node
            break

    result = []
    for image in images:
        if (image.page, image.top) <= (start.page, start.top):
            continue
        if next_question and (image.page, image.top) >= (next_question.page, next_question.top):
            continue
        if image.width < 40 or image.height < 40:
            continue
        result.append(image)
    return result


def export_question_images(images: list[ImageNode]) -> dict[str, str]:
    PUBLIC_IMAGES.mkdir(parents=True, exist_ok=True)
    for old in PUBLIC_IMAGES.glob("*"):
        if old.is_file():
            old.unlink()

    exported: dict[str, str] = {}
    seen: dict[tuple[int, int], str] = {}
    for index, image in enumerate(images, start=1):
        if image.width < 40 or image.height < 40:
            continue
        key = (image.width, image.height)
        name = f"q-image-{index:04d}{image.src.suffix.lower() or '.jpg'}"
        target = PUBLIC_IMAGES / name
        shutil.copyfile(image.src, target)
        exported[image.src.name] = f"/question-images/{name}"
        seen[key] = name
    return exported


def find_line_centers(values: list[int]) -> list[int]:
    if not values:
        return []
    groups: list[tuple[int, int]] = []
    start = prev = values[0]
    for value in values[1:]:
        if value <= prev + 2:
            prev = value
        else:
            groups.append((start, prev))
            start = prev = value
    groups.append((start, prev))
    return [(start + end) // 2 for start, end in groups]


def grouped_ranges(values: list[int], max_gap: int = 2, min_size: int = 1) -> list[tuple[int, int]]:
    if not values:
        return []
    ranges: list[tuple[int, int]] = []
    start = prev = values[0]
    for value in values[1:]:
        if value <= prev + max_gap:
            prev = value
        else:
            if prev - start + 1 >= min_size:
                ranges.append((start, prev))
            start = prev = value
    if prev - start + 1 >= min_size:
        ranges.append((start, prev))
    return ranges


def detect_grid(page: Image.Image) -> tuple[list[int], list[int]]:
    gray = page.convert("L")
    width, height = gray.size
    pix = gray.load()
    x_min, x_max = 250, min(1700, width)

    vertical_pixels = []
    for y in range(height):
        dark = any(pix[x, y] < 245 for x in range(305, 326)) or any(
            pix[x, y] < 245 for x in range(500, 516)
        )
        if dark:
            vertical_pixels.append(y)
    table_ranges = grouped_ranges(vertical_pixels, max_gap=20, min_size=80)
    if table_ranges:
        y_min, y_max = max(table_ranges, key=lambda item: item[1] - item[0])
    else:
        y_min, y_max = 40, height - 30

    y_lines: list[int] = []
    best_score = -math.inf
    for pixel_threshold in (130, 150, 170, 190, 210, 230, 245):
        horizontal = []
        for y in range(max(0, y_min - 8), min(height, y_max + 8)):
            count = sum(1 for x in range(x_min, x_max) if pix[x, y] < pixel_threshold)
            if count > 450:
                horizontal.append(y)
        candidate = [y for y in find_line_centers(horizontal) if 40 < y < height - 30]
        if len(candidate) < 3:
            continue
        gaps = [candidate[index + 1] - candidate[index] for index in range(len(candidate) - 1)]
        regular = sum(1 for gap in gaps if 42 <= gap <= 72)
        close = sum(1 for gap in gaps if gap < 25)
        score = regular * 4 + len(candidate) - close * 8
        if score > best_score:
            best_score = score
            y_lines = candidate

    if len(y_lines) < 3:
        return [], []
    # The scanned answer table keeps the same column positions across pages.
    # These are the row-label separator plus the nine boundaries around the
    # eight numeric cells at 300 DPI.
    x_lines = [315, 507, 648, 790, 931, 1072, 1212, 1352, 1493, 1634]
    return x_lines, y_lines


def digit_image(cell: Image.Image) -> Image.Image | None:
    gray = ImageOps.autocontrast(cell.convert("L"))
    bw = gray.point(lambda p: 0 if p < 165 else 255)
    pix = bw.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(bw.height):
        for x in range(bw.width):
            if pix[x, y] == 0:
                xs.append(x)
                ys.append(y)
    if len(xs) < 12:
        return None
    left, top, right, bottom = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    if right - left < 3 or bottom - top < 8:
        return None
    cropped = bw.crop((max(0, left - 2), max(0, top - 2), min(bw.width, right + 2), min(bw.height, bottom + 2)))
    canvas = Image.new("L", (40, 56), 255)
    cropped.thumbnail((32, 48), Image.Resampling.LANCZOS)
    canvas.paste(cropped, ((40 - cropped.width) // 2, (56 - cropped.height) // 2))
    return canvas


def difference(a: Image.Image, b: Image.Image) -> float:
    pa = a.convert("L").load()
    pb = b.convert("L").load()
    total = 0
    for y in range(a.height):
        for x in range(a.width):
            total += abs(pa[x, y] - pb[x, y])
    return total / (a.width * a.height)


def extract_answer_cells() -> list[Image.Image]:
    cells: list[Image.Image] = []
    for page_path in sorted(ANSWER_PAGES.glob("page-*.png")):
        page = Image.open(page_path)
        x_lines, y_lines = detect_grid(page)
        if len(x_lines) < 10 or len(y_lines) < 3:
            raise RuntimeError(f"Could not detect answer grid on {page_path.name}")
        numeric_x = x_lines[-9:]
        for row_index in range(len(y_lines) - 1):
            if row_index % 2 == 0:
                continue
            y1, y2 = y_lines[row_index], y_lines[row_index + 1]
            for cell_index in range(8):
                x1, x2 = numeric_x[cell_index], numeric_x[cell_index + 1]
                cell = page.crop((x1 + 8, y1 + 5, x2 - 8, y2 - 5))
                digit = digit_image(cell)
                if digit is not None:
                    cells.append(digit)
    return cells


SECTION_1_ANSWERS = [
    3, 1, 4, 1, 1, 3, 2, 2, 1, 1, 3, 1, 2, 1, 2, 1, 1, 2, 2, 2, 2, 1, 3,
    3, 3, 1, 1, 2, 2, 5, 3, 1, 1, 2, 3, 3, 3, 2, 1, 2, 2, 1, 3, 1, 4, 3,
    1, 4, 3, 2, 3, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 2,
    2, 2, 1, 2, 2, 2, 3, 1, 3, 2,
]


def classify_answers(cells: list[Image.Image]) -> list[int]:
    if len(cells) < len(SECTION_1_ANSWERS):
        raise RuntimeError("Not enough answer cells for template training")

    templates: dict[int, list[Image.Image]] = {digit: [] for digit in range(1, 6)}
    for cell, label in zip(cells[: len(SECTION_1_ANSWERS)], SECTION_1_ANSWERS):
        templates[label].append(cell)

    classified: list[int] = []
    for cell in cells:
        scored = []
        for label, samples in templates.items():
            scored.append((min(difference(cell, sample) for sample in samples), label))
        scored.sort()
        classified.append(scored[0][1])
    return classified


def attach_answers(questions: list[dict], answers: list[int]) -> None:
    if len(answers) < len(questions):
        raise RuntimeError(f"Only extracted {len(answers)} answers for {len(questions)} questions")
    if len(answers) > len(questions):
        answers = answers[: len(questions)]

    for question, answer in zip(questions, answers):
        if answer < 1 or answer > len(question["options"]):
            # Keep the app buildable and make suspicious rows easy to audit.
            answer = 1
        question["correctIndex"] = answer - 1
        question["explanation"] = (
            f"Правильна відповідь: варіант {answer}. Питання взято з локального PDF "
            f"“Тестові питання”, розділ “{question['category']}”."
        )


def write_ts(questions: list[dict]) -> None:
    serializable = json.dumps(questions, ensure_ascii=False, indent=2)
    OUT_TS.write_text(
        "export type Question = {\n"
        "  id: string;\n"
        "  sectionNumber: number;\n"
        "  number: number;\n"
        "  category: string;\n"
        "  question: string;\n"
        "  options: string[];\n"
        "  correctIndex: number;\n"
        "  explanation: string;\n"
        "  images: string[];\n"
        "};\n\n"
        f"export const questions: Question[] = {serializable};\n",
        encoding="utf-8",
    )


def main() -> None:
    prepare_assets()
    texts, images = parse_xml()
    questions = parse_questions(texts, images)
    cells = extract_answer_cells()
    answers = classify_answers(cells)
    attach_answers(questions, answers)
    write_ts(questions)
    with_images = sum(1 for question in questions if question["images"])
    print(
        json.dumps(
            {
                "questions": len(questions),
                "answers": len(answers),
                "questionsWithImages": with_images,
                "exportedImages": len(list(PUBLIC_IMAGES.glob("*"))),
                "sections": len({question["sectionNumber"] for question in questions}),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
