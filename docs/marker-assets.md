# Printable ArUco reference

The Marker page serves fixed, versioned assets through Next.js public files:

- `/markers/pigweigh-aruco-4x4-50-id-0-100mm.pdf`
- `/markers/pigweigh-aruco-4x4-50-id-0-100mm.svg`

Both use the serving manifest's `DICT_4X4_50`, ID 0 and **100 mm black-square side**, excluding the white margin. The PDF is one A4 portrait page (210 x 297 mm); its marker is vector geometry. The SVG is a vector preview with a 133.333333 mm square canvas: six marker cells plus one white quiet-zone cell on each side. Its black square is also 100 mm. The preview's on-screen size is not a physical reference.

`DICT_4X4_50` identifies an OpenCV dictionary containing 50 marker codes with 4 x 4 data cells, surrounded by a black border. It is the app's accepted detector configuration, and ID 0 is the accepted code. The generator intentionally offers no unsupported dictionary, ID or size variants. This choice establishes compatibility; it is not evidence that this dictionary is optimal or that a capture yields accurate weight.

Print the PDF on A4 at **100% / Actual Size**, with Fit to Page disabled. Measure each outside black edge with a ruler: it must be 100 mm (10 cm). Exclude the white margin. Preserve the margin, mount the marker flat and keep the whole marker visible. No file-size setting or automated image check verifies a physical printer's output.

## Reproduce and check

From the repository root, using uv and Python 3.13:

```powershell
uv run server/scripts/marker_assets.py generate
uv run server/scripts/marker_assets.py check
```

The script declares isolated, pinned tool dependencies; it adds no API runtime dependency. It reads the committed serving manifest and refuses to generate or check if the accepted marker configuration changes. OpenCV's predefined dictionary and `generateImageMarker` supply the cells for both files. ReportLab's invariant mode keeps repeated generation deterministic. The PDF row coordinates explicitly invert the image's top origin for PDF's bottom origin.

`check` reads the actual PDF content-stream rectangles to verify the black square's 100 mm extent, checks the A4 MediaBox and print guidance, renders through PDFium at 150 dpi, and requires OpenCV to detect exactly ID 0. It also checks SVG physical dimensions and the one-cell quiet-zone bounds. The rendered page defaults to `tmp/pdfs/marker/marker-a4.png`; use `--evidence <directory>` to put evidence elsewhere. To verify a separately rasterized SVG with OpenCV, pass `--svg-render <png>`.

For a local running web app, example downloads are:

```powershell
curl.exe --fail http://localhost:3000/markers/pigweigh-aruco-4x4-50-id-0-100mm.pdf -o marker.pdf
curl.exe --fail http://localhost:3000/markers/pigweigh-aruco-4x4-50-id-0-100mm.svg -o marker.svg
```

## Asset verification, 2026-10-29

The isolated script environment used Python 3.13 with OpenCV 4.13.0.92, NumPy 2.5.4, ReportLab 4.5.1, pypdf 6.21.4, PDFium binding 5.14.0 and Pillow 12.3.0. Generation and checks passed. A separate Sharp SVG rasterization passed the same detector check. A separate Poppler 150 dpi PDF render was visually inspected: all print instructions are legible, with no clipping, overlap or intrusion into the quiet zone. Poppler emitted a missing Symbol display-font warning; the document uses Helvetica ASCII text and the inspected output rendered correctly.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| PDF | 2360 | `2939159788a5e633eab4ba03987aa4645b5d4a16dc56e319375fd624b5449ab1` |
| SVG | 1565 | `18837c1d8581d4ed20e2853eff9ec44b3d6dc3090056698401ca2f30a92ac8d3` |

These checks establish file geometry and rendered code recognition. Physical printing, phone capture and weight accuracy remain unverified.
