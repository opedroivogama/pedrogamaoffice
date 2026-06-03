"""Post-process a generated sprite into a clean 256x256 sheet.

- Downsamples to crisp pixel art (nearest-neighbor)
- Removes magenta chroma-key background (#FF00FF with tolerance)
- Builds a 4x4 sheet (4 directions x 4 frames) by replicating the single pose
- Output: frontend/public/sprites/characters/default.png
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "test_gen.png"
OUT = ROOT / "frontend" / "public" / "sprites" / "characters" / "default.png"

FRAME = 64
TOLERANCE = 40


def remove_magenta(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    # Gemini renders the "magenta" prompt as ~(226, 48, 144) — a pink-magenta.
    # Match anything broadly in the high-R, low-G, mid-B band.
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if r > 180 and g < 110 and 90 < b < 200 and r > g + 80:
                px[x, y] = (0, 0, 0, 0)
    return img


def make_frame(src: Image.Image) -> Image.Image:
    w, h = src.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = src.crop((left, top, left + side, top + side))
    small = cropped.resize((FRAME, FRAME), Image.NEAREST)
    return remove_magenta(small)


def main() -> None:
    src = Image.open(SRC)
    frame = make_frame(src)

    sheet = Image.new("RGBA", (FRAME * 4, FRAME * 4), (0, 0, 0, 0))
    for r in range(4):
        for c in range(4):
            sheet.paste(frame, (c * FRAME, r * FRAME), frame)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)
    print(f"wrote {OUT} ({sheet.size[0]}x{sheet.size[1]})")


if __name__ == "__main__":
    main()
