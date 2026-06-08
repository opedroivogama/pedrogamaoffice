"""Pipeline v12 PEDRO_NEUTRO_PRETO: cleanup agressivo + curagem 4 frames + deploy.

Mudancas vs V10:
- polo PRETA (antes azul-escura)
- jeans AZUL (antes calca preta)
- rosto NEUTRO (nem carrancudo V10 nem bobao V11)

Substitui PEDRO_SAMURAI integral (rotations + walks + idle). Backup anterior
em sprites-pipeline/_old/PEDRO_SAMURAI_V10_BACKUP/ (gerado antes do V11).
"""
from pathlib import Path
from PIL import Image

BK = Path(r"C:\Users\Pedro\Desktop\escritorio online\sprites-pipeline\PEDRO_V12_NEUTRO_PRETO")
DEPLOY = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\characters\PEDRO_SAMURAI")

DIRS = ["north", "north-east", "east", "south-east", "south",
        "south-west", "west", "north-west"]
WALK_SOURCE_FRAMES = [0, 2, 4, 7]
ALPHA_THRESHOLD = 200
WHITE_SUM = 600
CLEANUP_PASSES = 2
HOLE_NEIGHBOR_THRESHOLD = 12
HOLE_PASSES = 3


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


def fill_internal_holes(im):
    """Flood-fill BFS a partir das bordas. Qualquer pixel alpha=0 NAO alcancavel
    a partir da borda do canvas e um buraco interno isolado, preenche com a cor
    mediana dos vizinhos opacos mais proximos."""
    px = im.load()
    w, h = im.size
    reachable = [[False] * w for _ in range(h)]
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if px[x, y][3] == 0 and not reachable[y][x]:
                reachable[y][x] = True
                stack.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if px[x, y][3] == 0 and not reachable[y][x]:
                reachable[y][x] = True
                stack.append((x, y))
    while stack:
        x, y = stack.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not reachable[ny][nx] and px[nx, ny][3] == 0:
                reachable[ny][nx] = True
                stack.append((nx, ny))
    to_fill = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0 and not reachable[y][x]:
                neighbors = []
                for radius in (1, 2, 3):
                    for dy in range(-radius, radius + 1):
                        for dx in range(-radius, radius + 1):
                            if dx == 0 and dy == 0:
                                continue
                            nx, ny = x + dx, y + dy
                            if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 255:
                                neighbors.append(px[nx, ny])
                    if neighbors:
                        break
                if neighbors:
                    rs = sorted(n[0] for n in neighbors)
                    gs = sorted(n[1] for n in neighbors)
                    bs = sorted(n[2] for n in neighbors)
                    mid = len(neighbors) // 2
                    to_fill.append((x, y, rs[mid], gs[mid], bs[mid]))
    for x, y, r, g, b in to_fill:
        px[x, y] = (r, g, b, 255)
    return im


def darken_hair(im, factor=0.45):
    """Escurece pixels com padrao castanho-avermelhado (cabelo + barba).
    Detecta R>G>B, R em [30,100], gap R-B > 10. Multiplica RGB por factor."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a != 255:
                continue
            if 30 <= r <= 100 and r > g > b and (r - b) > 10:
                px[x, y] = (int(r * factor), int(g * factor), int(b * factor), 255)
    return im


def process(im):
    im = clean_halo(im)
    im = fill_internal_holes(im)
    im = darken_hair(im)
    return im


def main():
    (DEPLOY / "rotations").mkdir(parents=True, exist_ok=True)
    for d in DIRS:
        src = BK / "rotations" / f"{d}.png"
        if not src.exists():
            print(f"  rot {d}: missing")
            continue
        im = Image.open(src).convert("RGBA")
        im = process(im)
        im.save(DEPLOY / "rotations" / f"{d}.png", "PNG")
        print(f"  rot {d}: deployed")

    for d in DIRS:
        src_dir = BK / "animations" / f"walk_{d}_v3"
        if not src_dir.exists():
            print(f"  walk {d}: missing")
            continue
        out = DEPLOY / "animations" / "walk-v3" / d
        out.mkdir(parents=True, exist_ok=True)
        for f in out.glob("*.png"):
            try:
                f.unlink()
            except Exception:
                pass
        for new_idx, src_idx in enumerate(WALK_SOURCE_FRAMES):
            src_file = src_dir / f"{src_idx}.png"
            if not src_file.exists():
                continue
            im = Image.open(src_file).convert("RGBA")
            im = process(im)
            im.save(out / f"frame_{new_idx:03d}.png", "PNG")
        print(f"  walk {d}: 4 frames")

    idle_src = BK / "animations" / "idle"
    idle_out = DEPLOY / "animations" / "idle" / "south"
    if idle_out.exists():
        for f in idle_out.glob("*.png"):
            try:
                f.unlink()
            except Exception:
                pass
    idle_out.mkdir(parents=True, exist_ok=True)
    for i in range(2):
        f = idle_src / f"{i}.png"
        if f.exists():
            im = Image.open(f).convert("RGBA")
            im = process(im)
            im.save(idle_out / f"frame_{i:03d}.png", "PNG")
    print("idle 2 frames cleaned")

    print(f"\nDONE -> {DEPLOY}")


if __name__ == "__main__":
    main()
