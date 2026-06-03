"""Process the v2 polished sprites at higher resolution (128x128).

- Crops to square
- Downsamples 1024 -> 128 with nearest-neighbor (preserves more detail than 64)
- Removes pink-magenta background
- Saves: default.png (single 128x128 frame) + default_typing.png
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FRAME = 128

ITEMS = [
    (ROOT / "scripts" / "test_gen_v2.png",
     ROOT / "frontend" / "public" / "sprites" / "characters" / "default.png"),
    (ROOT / "scripts" / "test_gen_typing_v2.png",
     ROOT / "frontend" / "public" / "sprites" / "characters" / "default_typing.png"),
]


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
    for src_path, out_path in ITEMS:
        src = Image.open(src_path)
        w, h = src.size
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        cropped = src.crop((left, top, left + side, top + side))
        small = cropped.resize((FRAME, FRAME), Image.NEAREST)
        out = remove_magenta(small)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out.save(out_path)
        print(f"wrote {out_path} ({FRAME}x{FRAME})")


if __name__ == "__main__":
    main()
