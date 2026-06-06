"""Pipeline v4: 4 directions (S,N,E,W), cleanup agressivo, deploy."""
from pathlib import Path
from PIL import Image
import shutil

BK = Path(r"C:\Users\Pedro\Desktop\PEDRO_SAMURAI V4 BACKUP")
DEPLOY = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\characters\PEDRO_SAMURAI")

DIRS = ["south", "north", "east", "west"]
ALPHA_THRESHOLD = 160
WHITE_SUM = 560
CLEANUP_PASSES = 4


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
        if not to_clear:
            break
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)
    return im


def main():
    # Rotations
    (DEPLOY / "rotations").mkdir(parents=True, exist_ok=True)
    for d in DIRS:
        src = BK / "rotations" / f"{d}.png"
        if not src.exists():
            continue
        im = Image.open(src).convert("RGBA")
        im = clean_halo(im)
        im.save(DEPLOY / "rotations" / f"{d}.png", "PNG")
    print("rotations cleaned+deployed")

    # Walks
    for d in DIRS:
        src_dir = BK / "animations" / f"walk_{d}"
        if not src_dir.exists():
            continue
        out = DEPLOY / "animations" / "walk" / d
        out.mkdir(parents=True, exist_ok=True)
        for i in range(4):
            f = src_dir / f"{i}.png"
            if not f.exists():
                continue
            im = Image.open(f).convert("RGBA")
            im = clean_halo(im)
            im.save(out / f"frame_{i:03d}.png", "PNG")
        print(f"  walk {d}: 4 frames")

    # Idle
    idle_src = BK / "animations" / "idle"
    if idle_src.exists():
        idle_out = DEPLOY / "animations" / "idle" / "south"
        idle_out.mkdir(parents=True, exist_ok=True)
        for i in range(4):
            f = idle_src / f"{i}.png"
            if not f.exists():
                continue
            im = Image.open(f).convert("RGBA")
            im = clean_halo(im)
            im.save(idle_out / f"frame_{i:03d}.png", "PNG")
        print("idle cleaned+deployed")

    # Limpar dirs antigos de 8 directions/walk-v3
    walk_v3 = DEPLOY / "animations" / "walk-v3"
    if walk_v3.exists():
        try:
            shutil.rmtree(walk_v3)
            print("walk-v3 antigo removido")
        except Exception as e:
            print(f"walk-v3 mantido (lock): {e}")
    for diag in ("south-east", "south-west", "north-east", "north-west"):
        f = DEPLOY / "rotations" / f"{diag}.png"
        if f.exists():
            try:
                f.unlink()
            except Exception:
                pass

    print(f"\nDONE -> {DEPLOY}")


if __name__ == "__main__":
    main()
