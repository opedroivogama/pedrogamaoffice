"""Process the user avatar sprite to 128x128 with transparent background."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "test_gen_user.png"
OUT = ROOT / "frontend" / "public" / "sprites" / "characters" / "user.png"
FRAME = 128


def remove_magenta(img: Image.Image) -> Image.Image:
    """Two-pass chroma removal.

    Pass 1: strong magenta core (the obvious background pixels).
    Pass 2: pinkish halo at edges — pixels that are pink-leaning but darker
    (residual from anti-aliased edge softening). Catches the visible outline
    that survives a single threshold.
    """
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            # Core magenta (bright)
            if r > 180 and g < 110 and 90 < b < 200 and r > g + 80:
                px[x, y] = (0, 0, 0, 0)
                continue
            # Halo pink (darker, still strongly pink-biased)
            if r > 130 and g < 80 and 60 < b < 160 and r > g + 90 and r > b + 20:
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
