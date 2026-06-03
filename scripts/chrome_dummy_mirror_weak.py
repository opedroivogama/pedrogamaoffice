"""Replace the two weak frames by horizontally-mirroring their stronger counterparts.

- chrome_dummy_step_right  := mirror(chrome_dummy_step_left)
- chrome_dummy_back_step1  := mirror(chrome_dummy_back_step2)

Both swaps are anatomically correct (mirror flips which foot is raised), and
they reuse the cleaner walking pose so the front and back walk cycles stop
looking like idle frames.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "frontend" / "public" / "sprites" / "characters"

PAIRS = [
    ("chrome_dummy_step_left", "chrome_dummy_step_right"),
    ("chrome_dummy_back_step2", "chrome_dummy_back_step1"),
]

for src_name, dst_name in PAIRS:
    src = SPRITES / f"{src_name}.png"
    dst = SPRITES / f"{dst_name}.png"
    img = Image.open(src).convert("RGBA")
    mirrored = img.transpose(Image.FLIP_LEFT_RIGHT)
    mirrored.save(dst)
    print(f"  mirrored {src.name} -> {dst.name}")
