"""Extrai a moldura do WallCalendar — chroma key magenta + crop."""
import shutil
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\Pedro\.claude\image-cache\ce5c3b25-1382-48c2-8d48-7c869c1e1f3b\16.png")
DST = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\wall-calendar-frame.png")
BAK = DST.with_suffix(".png.bak")


def is_magenta(r, g, b):
    return r >= 200 and b >= 130 and g <= 80


def is_pink_tinted(r, g, b):
    return (r - g) > 30 and (b - g) > 30


def main():
    if not BAK.exists() and DST.exists():
        shutil.copy2(DST, BAK)
        print(f"backup: {BAK}")

    img = Image.open(SRC).convert("RGBA")
    w, h = img.size
    px = img.load()

    cleared = 0
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if is_magenta(r, g, b) or is_pink_tinted(r, g, b):
                px[x, y] = (0, 0, 0, 0)
                cleared += 1
    print(f"magenta+pink removidos: {cleared}")

    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("vazio?")
    pad = 2
    cropped = img.crop((
        max(0, bbox[0] - pad), max(0, bbox[1] - pad),
        min(w, bbox[2] + pad), min(h, bbox[3] + pad),
    ))
    print(f"size: {cropped.size}  aspect (w/h): {cropped.size[0] / cropped.size[1]:.3f}")
    cropped.save(DST)


if __name__ == "__main__":
    main()
