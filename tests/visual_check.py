"""Pixel-level sanity check for the captured screenshots.

Reads docs/screenshots/geometry.json (written by tests/shots.mjs) and verifies
that every tile centre in the screenshot carries the colour the injected board
should produce, that the page and board colours are right, and that the board
is drawn square. It is a proxy for "the layout really shows what the engine
says", usable without a human looking at the images.
"""

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "screenshots"

PASS = 0
FAIL = 0


def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ok   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}  {detail}")


def close(a, b, tol=12):
    return all(abs(x - y) <= tol for x, y in zip(a[:3], b[:3]))


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


TILE = {
    2: "#eee4da", 4: "#ede0c8", 8: "#f2b179", 16: "#f59563",
    32: "#f67c5f", 64: "#f65e3b", 128: "#edcf72", 256: "#edcc61",
    512: "#edc850", 1024: "#edc53f", 2048: "#edc22e", 4096: "#3c3a32",
}

BOARD = [
    [2, 4, 8, 16],
    [0, 32, 64, 128],
    [2, 0, 256, 512],
    [4, 8, 0, 1024],
]


def inspect(name, geometry):
    path = SHOTS / f"{name}-mid.png"
    image = Image.open(path).convert("RGB")
    scale = image.width / geometry["viewport"]["width"]
    board = geometry["board"]
    cells = geometry["cells"]

    left = board["x"] * scale
    top = board["y"] * scale
    width = board["width"] * scale
    height = board["height"] * scale
    cell_w = cells["width"] * scale
    cell_h = cells["height"] * scale
    gap_x = cells["gapX"] * scale
    gap_y = cells["gapY"] * scale

    print(f"\n{path.name}  {image.width}x{image.height}  scale {scale:.2f}")

    corner = image.getpixel((3, 3))
    check("page background is the warm paper tone", close(corner, hex_rgb("#faf8ef"), 6), corner)

    frame = image.getpixel((int(left + 3 * scale), int(top + height / 2)))
    check("board frame uses the 2048 sand colour", close(frame, hex_rgb("#bbada0"), 16), frame)

    for r in range(4):
        for c in range(4):
            value = BOARD[r][c]
            cx = left + c * (cell_w + gap_x) + cell_w / 2
            # sample above the centred glyph so the tile background is measured
            cy = top + r * (cell_h + gap_y) + cell_h * 0.2
            pixel = image.getpixel((int(cx), int(cy)))
            if value == 0:
                check(
                    f"cell {r},{c} empty shows the empty slot",
                    175 < pixel[0] < 220 and 170 < pixel[1] < 215,
                    pixel,
                )
            else:
                expected = hex_rgb(TILE[value])
                check(f"cell {r},{c} shows tile {value}", close(pixel, expected, 12), f"{pixel} vs {expected}")

    check("board is drawn square", abs(width - height) <= 3 * scale, (width, height))
    check("board fits the viewport width", left >= 0 and left + width <= image.width + 1, (left, width, image.width))


def inspect_overlay(name, geometry):
    path = SHOTS / f"{name}.png"
    image = Image.open(path).convert("RGB")
    width, height = image.size

    print(f"\n{path.name}  {width}x{height}")

    # The dialog card is the bright panel across the vertical centre of the page.
    row = height // 2
    band = [image.getpixel((x, row)) for x in range(width)]
    bright = [x for x, pixel in enumerate(band) if pixel[0] >= 244 and pixel[1] >= 242 and pixel[2] >= 236]
    check("dialog card is drawn at the vertical centre", len(bright) > 0.35 * width, len(bright))
    if bright:
        left, right = min(bright), max(bright)
        check(
            "dialog card is centred",
            abs((left + right) / 2 - width / 2) <= 0.05 * width,
            (left, right, width),
        )
        check("dialog card has a usable width", (right - left) > 0.5 * width, right - left)


def main():
    geometry_path = SHOTS / "geometry.json"
    if not geometry_path.exists():
        print("geometry.json missing - run `npm run shots` first")
        return 1

    geometry = json.loads(geometry_path.read_text(encoding="utf8"))
    for name in ("mobile", "small", "desktop"):
        inspect(name, geometry[name])

    inspect_overlay("mobile-win", geometry["mobile"])
    inspect_overlay("mobile-gameover", geometry["mobile"])

    print(f"\n{PASS} checks passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
