"""Limpa halo branco + alpha threshold em todos os PNGs do GESTOR_TRAFEGO."""
from pathlib import Path
from PIL import Image
import sys

ROOT = Path(r"C:\Users\Pedro\Desktop\GESTOR_TRAFEGO BACKUP")
OUT = Path(r"C:\Users\Pedro\Desktop\GESTOR_TRAFEGO CLEANED")
ALPHA_THRESHOLD = 128
WHITE_SUM = 680  # R+G+B acima disso é considerado "esbranquiçado"


def clean(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size

    # Passo 1: binariza alpha (pixels semi-transparentes <128 viram 0, >=128 viram 255)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < ALPHA_THRESHOLD:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, 255)

    # Passo 2: pixels esbranquiçados no contorno (vizinho transparente) viram transparentes
    to_clear = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r + g + b < WHITE_SUM:
                continue
            # tem vizinho transparente?
            border = False
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        if px[nx, ny][3] == 0:
                            border = True
                            break
                if border:
                    break
            if border:
                to_clear.append((x, y))

    for x, y in to_clear:
        px[x, y] = (0, 0, 0, 0)

    return im


def main():
    if OUT.exists():
        import shutil
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    count = 0
    for src in ROOT.rglob("*.png"):
        rel = src.relative_to(ROOT)
        dst = OUT / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(src) as im:
            cleaned = clean(im)
            cleaned.save(dst, "PNG")
        count += 1
        if count % 10 == 0:
            print(f"  processed {count}...")
    print(f"DONE: {count} PNGs cleaned -> {OUT}")


if __name__ == "__main__":
    main()
