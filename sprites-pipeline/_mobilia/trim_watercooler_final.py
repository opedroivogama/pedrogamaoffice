"""Trim final do filtro — vai com threshold 120 + 6 passadas.

A versão anterior (155 + 4 passadas) ainda deixou pixels de contorno claros
vazando segundo o Pedro. Aqui afrouxo o threshold pra pegar cinza médio
(R/G/B >= 120) que esteja na borda. O risco de comer o corpo é baixo
porque restringimos a pixels adjacentes a transparente.
"""
import shutil
from pathlib import Path
from PIL import Image

DST = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\watercooler.png")
BAK = DST.with_suffix(".png.bak5")

LIGHT_THRESHOLD = 120
PASSES = 6


def has_transparent_neighbor(px, x, y, w, h):
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                return True
    return False


def trim_once(img: Image.Image) -> int:
    w, h = img.size
    px = img.load()
    to_clear = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 250:
                continue
            if min(r, g, b) < LIGHT_THRESHOLD:
                continue
            if has_transparent_neighbor(px, x, y, w, h):
                to_clear.append((x, y))
    for x, y in to_clear:
        px[x, y] = (0, 0, 0, 0)
    return len(to_clear)


def main() -> None:
    if not BAK.exists():
        shutil.copy2(DST, BAK)
        print(f"backup: {BAK}")

    img = Image.open(DST).convert("RGBA")
    total = 0
    for i in range(PASSES):
        n = trim_once(img)
        print(f"passada {i+1}: {n}")
        total += n
        if n == 0:
            break

    bbox = img.getbbox()
    pad = 2
    cropped = img.crop((
        max(0, bbox[0] - pad), max(0, bbox[1] - pad),
        min(img.size[0], bbox[2] + pad), min(img.size[1], bbox[3] + pad),
    ))
    cropped.save(DST)
    print(f"total: {total}  size final: {cropped.size}")


if __name__ == "__main__":
    main()
