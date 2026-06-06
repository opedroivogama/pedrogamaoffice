"""Cleanup halo branco nas 8 rotations do PEDRO_SAMURAI V2.
Mesmo algoritmo do GESTOR_TRAFEGO: alpha threshold + remove white-fringe."""
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\Pedro\Desktop\PEDRO_SAMURAI V2 BACKUP\rotations")
OUT = Path(r"C:\Users\Pedro\Desktop\PEDRO_SAMURAI V2 CLEANED\rotations")

ALPHA_THRESHOLD = 128
WHITE_SUM = 680
DIRS = ["north", "north-east", "east", "south-east", "south",
        "south-west", "west", "north-west"]


def clean(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < ALPHA_THRESHOLD:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, 255)

    to_clear = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r + g + b < WHITE_SUM:
                continue
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
    import shutil
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    for d in DIRS:
        src = SRC / f"{d}.png"
        if not src.exists():
            print(f"  skip {d} (missing)")
            continue
        with Image.open(src) as im:
            cleaned = clean(im)
            cleaned.save(OUT / f"{d}.png", "PNG")
        print(f"  cleaned {d}.png")
    print(f"DONE -> {OUT}")


if __name__ == "__main__":
    main()
