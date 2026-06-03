"""Build typing-eye-left variant by compositing ONLY the eye region of the
Gemini-generated alternate take over the canonical typing sprite.

Result: 128x128 PNG where 99% of pixels are identical to default_typing.png,
and only a small rectangle around the eyes differs. Eliminates "flicker" of
other features during eye-movement animation.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_BASE = ROOT / "frontend" / "public" / "sprites" / "characters" / "default_typing.png"
SRC_ALT = ROOT / "scripts" / "test_gen_typing_eyeleft.png"
OUT = ROOT / "frontend" / "public" / "sprites" / "characters" / "default_typing_eyeleft.png"

FRAME = 128

# Eye region in the 128x128 sprite — band over the actual eye row,
# below the hair fringe. Validated visually via eye_box_debug.png.
EYE_BOX = (52, 58, 92, 72)  # (left, top, right, bottom)


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


def downsample(path: Path) -> Image.Image:
    src = Image.open(path)
    w, h = src.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = src.crop((left, top, left + side, top + side))
    small = cropped.resize((FRAME, FRAME), Image.NEAREST)
    return remove_magenta(small)


def main() -> None:
    base = Image.open(SRC_BASE).convert("RGBA")
    alt = downsample(SRC_ALT)

    composite = base.copy()
    eye_patch = alt.crop(EYE_BOX)
    composite.paste(eye_patch, EYE_BOX, eye_patch)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    composite.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
