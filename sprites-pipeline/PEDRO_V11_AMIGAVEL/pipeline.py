"""Pipeline v11 PEDRO (rosto amigavel): so substitui rotations.

Walks e idle permanecem os da V10 — o corpo do V11 é identico (gerado com
use_color_palette_from_reference=true), entao os frames de walk antigos
casam com o rosto novo (o rosto e pequeno demais em frames de walk para
denunciar a diferenca).

Backup do deploy V10 anterior em sprites-pipeline/_old/PEDRO_SAMURAI_V10_BACKUP/.
"""
from pathlib import Path
from PIL import Image

BK = Path(r"C:\Users\Pedro\Desktop\escritorio online\sprites-pipeline\PEDRO_V11_AMIGAVEL")
DEPLOY = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\characters\PEDRO_SAMURAI")

DIRS = ["north", "north-east", "east", "south-east", "south",
        "south-west", "west", "north-west"]
ALPHA_THRESHOLD = 200
WHITE_SUM = 540
CLEANUP_PASSES = 6


def clean_halo(im):
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
    for _ in range(CLEANUP_PASSES):
        to_clear = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0 or r + g + b < WHITE_SUM:
                    continue
                border = False
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                            border = True
                            break
                    if border:
                        break
                if border:
                    to_clear.append((x, y))
        if not to_clear:
            break
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)
    return im


def main():
    (DEPLOY / "rotations").mkdir(parents=True, exist_ok=True)
    for d in DIRS:
        src = BK / "rotations" / f"{d}.png"
        if not src.exists():
            print(f"  rot {d}: missing")
            continue
        im = Image.open(src).convert("RGBA")
        im = clean_halo(im)
        im.save(DEPLOY / "rotations" / f"{d}.png", "PNG")
        print(f"  rot {d}: deployed")
    print(f"\nDONE -> {DEPLOY}")
    print("walks e idle preservados da V10 (corpo identico).")


if __name__ == "__main__":
    main()
