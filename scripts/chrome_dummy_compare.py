"""Build a side-by-side comparison sheet of all chrome_dummy frames at 4x scale.

Layout (4 cols × 3 rows):
  Row 0: chrome_dummy (front idle) | step_left | step_right | (blank)
  Row 1: side_idle                  | side_step1 | side_step2 | (blank)
  Row 2: back_idle                  | back_step1 | back_step2 | (blank)
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "frontend" / "public" / "sprites" / "characters"
OUT = ROOT / "scripts" / "chrome_dummy_compare.png"

SCALE = 4
CELL = 128 * SCALE  # 512
PAD = 16
LABEL_H = 24

GRID = [
    [("chrome_dummy", "FRONT idle"),
     ("chrome_dummy_step_left", "DOWN step_left"),
     ("chrome_dummy_step_right", "DOWN step_right")],
    [("chrome_dummy_side_idle", "SIDE idle"),
     ("chrome_dummy_side_step1", "SIDE step1"),
     ("chrome_dummy_side_step2", "SIDE step2")],
    [("chrome_dummy_back_idle", "BACK idle"),
     ("chrome_dummy_back_step1", "BACK step1"),
     ("chrome_dummy_back_step2", "BACK step2")],
]

cols = max(len(row) for row in GRID)
rows = len(GRID)
W = cols * (CELL + PAD) + PAD
H = rows * (CELL + LABEL_H + PAD) + PAD

sheet = Image.new("RGBA", (W, H), (40, 40, 48, 255))
draw = ImageDraw.Draw(sheet)

for r, row in enumerate(GRID):
    for c, (name, label) in enumerate(row):
        src = SPRITES / f"{name}.png"
        if not src.exists():
            continue
        img = Image.open(src).convert("RGBA")
        big = img.resize((CELL, CELL), Image.NEAREST)
        x = PAD + c * (CELL + PAD)
        y = PAD + r * (CELL + LABEL_H + PAD)
        sheet.paste(big, (x, y), big)
        draw.text((x + 6, y + CELL + 4), label, fill=(220, 220, 220, 255))

sheet.save(OUT)
print(f"wrote {OUT} ({sheet.size[0]}x{sheet.size[1]})")
