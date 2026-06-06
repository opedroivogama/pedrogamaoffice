"""Substitui o sprite da impressora + mesinha (integrado num só sprite)."""
import shutil
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\Pedro\.claude\image-cache\ce5c3b25-1382-48c2-8d48-7c869c1e1f3b\15.png")
DST = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\printer-station.png")
BAK = DST.with_suffix(".png.bak")

BG_MIN_LUMA = 220
BG_CHROMA_TOL = 8
HALO_THRESHOLD = 180
HALO_PASSES = 2


def is_bg(r, g, b):
    if r < BG_MIN_LUMA or g < BG_MIN_LUMA or b < BG_MIN_LUMA:
        return False
    return (max(r, g, b) - min(r, g, b)) <= BG_CHROMA_TOL


def has_transparent_neighbor(px, x, y, w, h):
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                return True
    return False


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
            if is_bg(r, g, b):
                px[x, y] = (0, 0, 0, 0)
                cleared += 1
    print(f"bg removido: {cleared}")

    for i in range(HALO_PASSES):
        to_clear = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 250:
                    continue
                if min(r, g, b) < HALO_THRESHOLD:
                    continue
                if has_transparent_neighbor(px, x, y, w, h):
                    to_clear.append((x, y))
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)
        print(f"halo passada {i+1}: {len(to_clear)}")
        if not to_clear:
            break

    bbox = img.getbbox()
    pad = 4
    cropped = img.crop((
        max(0, bbox[0] - pad), max(0, bbox[1] - pad),
        min(w, bbox[2] + pad), min(h, bbox[3] + pad),
    ))
    print(f"size: {cropped.size}  aspect: {cropped.size[0] / cropped.size[1]:.3f}")
    cropped.save(DST)


if __name__ == "__main__":
    main()
