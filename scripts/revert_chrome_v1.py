"""Revert chrome_dummy step/back frames to the v1 raws (pre-dramatic-pose).

Same pipeline as v1 processor:
  remove magenta → NEAREST 128 → alpha threshold.

Then re-mirror step_left → step_right and back_step2 → back_step1.
Breath frames are left on disk but no longer loaded by the hook.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "frontend" / "public" / "sprites" / "characters"
RAW_DIR = SPRITES / "_chrome_raw"
FRAME = 128


def remove_magenta(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            bright = r > 180 and g < 100 and b > 180 and r > g + 100 and b > g + 100
            dark = r > 60 and g < 40 and b > 60 and r > g + 30 and b > g + 30 and (r + b) > 2 * g + 60
            if bright or dark:
                px[x, y] = (0, 0, 0, 0)
    return img


def threshold_alpha(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255 if a >= 128 else 0)
    return img


def process_raw_to(raw_name: str, dst_name: str) -> Image.Image:
    raw = Image.open(RAW_DIR / f"{raw_name}.png").convert("RGB")
    final = threshold_alpha(remove_magenta(raw).resize((FRAME, FRAME), Image.NEAREST))
    final.save(SPRITES / f"{dst_name}.png")
    print(f"  restored {dst_name}.png from {raw_name}")
    return final


step_left = process_raw_to("chrome_dummy_step_left_raw", "chrome_dummy_step_left")
back_step2 = process_raw_to("chrome_dummy_back_step2_raw", "chrome_dummy_back_step2")
step_left.transpose(Image.FLIP_LEFT_RIGHT).save(SPRITES / "chrome_dummy_step_right.png")
print("  restored chrome_dummy_step_right.png (mirror)")
back_step2.transpose(Image.FLIP_LEFT_RIGHT).save(SPRITES / "chrome_dummy_back_step1.png")
print("  restored chrome_dummy_back_step1.png (mirror)")
