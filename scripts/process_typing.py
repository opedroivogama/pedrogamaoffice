"""Process the typing pose into a clean 64x64 PNG with transparent background."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "test_gen_typing.png"
OUT = ROOT / "frontend" / "public" / "sprites" / "characters" / "default_typing.png"
FRAME = 64


def remove_magenta(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if r > 180 and g < 110 and 90 < b < 200 and r > g + 80:
                px[x, y] = (0, 0, 0, 0)
    return img


def main() -> None:
    src = Image.open(SRC)
    w, h = src.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = src.crop((left, top, left + side, top + side))
    small = cropped.resize((FRAME, FRAME), Image.NEAREST)
    out = remove_magenta(small)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
