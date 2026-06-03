"""Process the 8 nano-banana raw chrome_dummy frames into game-ready 128x128 sprites.

For each raw:
- Open 1024x1024 RGB raw.
- Remove magenta chroma-key (broad band that matches Gemini's pinkish #FF00FF).
- Downscale to 128x128 with NEAREST (preserves chunky pixel-art look).
- Threshold alpha to hard 0/255 edges.
- Save next to chrome_dummy.png.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "frontend" / "public" / "sprites" / "characters"
RAW_DIR = SPRITES / "_chrome_raw"
FRAME = 128

FRAMES = [
    "chrome_dummy_step_left",
    "chrome_dummy_step_right",
    "chrome_dummy_side_idle",
    "chrome_dummy_side_step1",
    "chrome_dummy_side_step2",
    "chrome_dummy_back_idle",
    "chrome_dummy_back_step1",
    "chrome_dummy_back_step2",
]


def remove_magenta(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            # Bright magenta band: Gemini renders ~#FC02FA (high R, low G, high B).
            bright = r > 180 and g < 100 and b > 180 and r > g + 100 and b > g + 100
            # Dark purple/magenta edge fringe (anti-alias halo): #6a005f-ish.
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


def process_one(name: str) -> None:
    raw_path = RAW_DIR / f"{name}_raw.png"
    out_path = SPRITES / f"{name}.png"
    if not raw_path.exists():
        print(f"  MISSING: {raw_path}")
        return
    src = Image.open(raw_path).convert("RGB")
    keyed = remove_magenta(src)
    small = keyed.resize((FRAME, FRAME), Image.NEAREST)
    final = threshold_alpha(small)
    final.save(out_path)
    print(f"  wrote {out_path.name} ({final.size[0]}x{final.size[1]})")


def main() -> None:
    for name in FRAMES:
        process_one(name)


if __name__ == "__main__":
    main()
