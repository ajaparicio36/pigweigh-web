# /// script
# requires-python = ">=3.13,<3.14"
# dependencies = [
#   "opencv-python-headless==4.13.0.92",
#   "numpy==2.5.4",
#   "reportlab==4.5.1",
#   "pypdf==6.21.4",
#   "pypdfium2==5.14.0",
#   "pillow==12.3.0",
# ]
# ///
"""Generate and independently check the fixed public PigWeigh marker assets.

Run with `uv run server/scripts/marker_assets.py generate` or `check`.
Tool dependencies are isolated by uv; they are not API runtime dependencies.
"""

from __future__ import annotations

import argparse
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import cv2
import numpy as np
from PIL import Image
import pypdfium2 as pdfium
from pypdf import PdfReader
from pypdf.generic import ContentStream
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "web/public/markers"
STEM = "pigweigh-aruco-4x4-50-id-0-100mm"
EXPECTED = {"dictionary": "DICT_4X4_50", "id": 0, "side_mm": 100}


def configuration() -> None:
    manifest = json.loads((ROOT / "server/models/v1/manifest.json").read_text())
    if manifest["marker"] != EXPECTED:
        raise ValueError("Serving marker configuration changed; review assets before regenerating.")


def generate() -> None:
    configuration()
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    cells = cv2.aruco.generateImageMarker(dictionary, 0, 6, borderBits=1)
    ASSETS.mkdir(parents=True, exist_ok=True)
    rects = [
        f'<rect x="{col + 1}" y="{row + 1}" width="1" height="1"/>'
        for row in range(6)
        for col in range(6)
        if cells[row, col] == 0
    ]
    svg = '\n'.join([
        '<svg xmlns="http://www.w3.org/2000/svg" width="133.333333333333mm"',
        ' height="133.333333333333mm" viewBox="0 0 8 8" shape-rendering="crispEdges"',
        ' role="img" aria-labelledby="title desc">',
        '<title id="title">PigWeigh ArUco marker: DICT_4X4_50, ID 0</title>',
        '<desc id="desc">100 mm black square with a white quiet zone of one cell on every side.</desc>',
        '<rect width="8" height="8" fill="white"/>',
        '<g fill="black">', *rects, '</g>', '</svg>', '',
    ])
    (ASSETS / f"{STEM}.svg").write_text(svg, encoding="utf-8", newline="\n")
    pdf = canvas.Canvas(str(ASSETS / f"{STEM}.pdf"), pagesize=A4, invariant=1)
    pdf.setTitle("PigWeigh - 100 mm ArUco reference")
    pdf.setAuthor("PigWeigh")
    pdf.setSubject("DICT_4X4_50 / ID 0 / 100 mm black square")

    def text(y: float, value: str, size: float = 11, bold: bool = False) -> None:
        pdf.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        pdf.drawString(20 * mm, y * mm, value)

    text(270, "PigWeigh / printable reference", 20, True)
    text(258, "DICT_4X4_50   |   ID 0   |   Black square: 100 mm (10 cm)")
    text(248, "A4 portrait - preserve the white margin around the marker.", 10)
    pdf.setFillColorRGB(1, 1, 1)
    pdf.rect((55 - 100 / 6) * mm, (112 - 100 / 6) * mm,
             (100 + 200 / 6) * mm, (100 + 200 / 6) * mm, fill=1, stroke=0)
    pdf.setFillColorRGB(0, 0, 0)
    # A marked section lets verification inspect actual PDF vector geometry.
    pdf.addLiteral("/PigWeighMarker BMC")
    for row in range(6):
        for col in range(6):
            if cells[row, col] == 0:
                # OpenCV rows start at the top; PDF coordinates start at the bottom.
                pdf.rect((55 + col * 100 / 6) * mm,
                         (112 + (5 - row) * 100 / 6) * mm,
                         100 / 6 * mm, 100 / 6 * mm, fill=1, stroke=0)
    pdf.addLiteral("EMC")
    text(82, "Before you use this marker", 14, True)
    text(70, "1. Print on A4 at 100% / Actual Size. Turn off Fit to Page.")
    text(59, "2. Use a ruler: each outside black edge must measure 100 mm.")
    text(51, "   Measure the black square only; exclude the white margin.", 10)
    text(40, "3. Mount flat. Keep the whole marker and white margin visible.")
    text(20, "Print settings do not prove physical size. Verify the printed card before capture.", 9)
    pdf.showPage()
    pdf.save()


def detect(image: np.ndarray, label: str) -> None:
    detector = cv2.aruco.ArucoDetector(
        cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    )
    _, ids, _ = detector.detectMarkers(image)
    if ids is None or ids.flatten().tolist() != [0]:
        raise ValueError(f"{label}: expected exactly marker ID 0, got {ids}")


def check(evidence: Path, svg_render: Path | None) -> None:
    configuration()
    evidence.mkdir(parents=True, exist_ok=True)
    pdf_path = ASSETS / f"{STEM}.pdf"
    reader = PdfReader(pdf_path)
    assert len(reader.pages) == 1
    page = reader.pages[0]
    assert abs(float(page.mediabox.width) - 210 * mm) < 0.001
    assert abs(float(page.mediabox.height) - 297 * mm) < 0.001
    active = False
    boxes = []
    for operands, operator in ContentStream(page.get_contents(), reader).operations:
        if operator == b"BMC" and str(operands[0]) == "/PigWeighMarker":
            active = True
        elif operator == b"EMC":
            active = False
        elif active and operator == b"re":
            boxes.append([float(value) for value in operands])
    assert boxes, "Missing actual marker vector paths"
    bounds = (min(box[0] for box in boxes), min(box[1] for box in boxes),
              max(box[0] + box[2] for box in boxes), max(box[1] + box[3] for box in boxes))
    assert abs(bounds[2] - bounds[0] - 100 * mm) < 0.001
    assert abs(bounds[3] - bounds[1] - 100 * mm) < 0.001
    content = page.extract_text()
    for required in ("100% / Actual Size", "Fit to Page", "ruler", "100 mm"):
        assert required in content
    document = pdfium.PdfDocument(str(pdf_path))
    rendered = document[0].render(scale=150 / 72).to_pil().convert("RGB")
    rendered.save(evidence / "marker-a4.png")
    detect(cv2.cvtColor(np.asarray(rendered), cv2.COLOR_RGB2GRAY), "rendered PDF")
    # Check actual output SVG physical dimensions and quiet-zone extents.
    svg = ET.parse(ASSETS / f"{STEM}.svg").getroot()
    assert svg.attrib["viewBox"] == "0 0 8 8"
    assert abs(float(svg.attrib["width"].removesuffix("mm")) * 6 / 8 - 100) < 1e-9
    assert svg.attrib["width"] == svg.attrib["height"]
    group = svg.find("{http://www.w3.org/2000/svg}g")
    assert group is not None
    for rect in group:
        assert 1 <= int(rect.attrib["x"]) <= 6
        assert 1 <= int(rect.attrib["y"]) <= 6
        assert rect.attrib["width"] == rect.attrib["height"] == "1"
    if svg_render:
        detect(cv2.imread(str(svg_render), cv2.IMREAD_GRAYSCALE), "rendered SVG")
    print("PASS: A4 MediaBox; 100 mm PDF vectors; print guidance; rendered PDF ID 0; SVG size/quiet zone")
    if svg_render:
        print("PASS: externally rendered SVG decodes as ID 0 / DICT_4X4_50")
    print("Tool versions: " + ", ".join(
        f"{package}={version(package)}"
        for package in ("opencv-python-headless", "numpy", "reportlab", "pypdf", "pypdfium2", "pillow")
    ))
    for extension in ("pdf", "svg"):
        path = ASSETS / f"{STEM}.{extension}"
        print(f"{path.name}: {path.stat().st_size} bytes; sha256 {hashlib.sha256(path.read_bytes()).hexdigest()}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("generate", "check"))
    parser.add_argument("--evidence", type=Path, default=ROOT / "tmp/pdfs/marker")
    parser.add_argument("--svg-render", type=Path)
    args = parser.parse_args()
    if args.operation == "generate":
        generate()
    else:
        check(args.evidence, args.svg_render)


if __name__ == "__main__":
    main()
