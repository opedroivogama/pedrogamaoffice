"""Limpa mais agressivamente o entorno do filtro.

Threshold de 180 -> 155 (pega tons mais escuros de cinza-claro residual)
e 4 passadas (alguns pixels só se tornam borda após camadas anteriores
caírem). Restringido a NÚCLEO_OUTSIDE: a remoção só rola se o pixel for
vizinho de transparente — protege o corpo do sprite por dentro.
"""
import shutil
from pathlib import Path
from PIL import Image

DST = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\watercooler.png")
BAK = DST.with_suffix(".png.bak4")

LIGHT_THRESHOLD = 155
PASSES = 4


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
    print(f"total apagados: {total}  size final: {cropped.size}")


if __name__ == "__main__":
    main()
