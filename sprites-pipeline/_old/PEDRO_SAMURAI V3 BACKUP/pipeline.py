"""Pipeline v3: cleanup agressivo + curagem 4 frames + deploy substituindo v2.
Sem recolor (v3 não tem problema na SE)."""
from pathlib import Path
from PIL import Image
import shutil

BK = Path(r"C:\Users\Pedro\Desktop\PEDRO_SAMURAI V3 BACKUP")
CLEANED = Path(r"C:\Users\Pedro\Desktop\PEDRO_SAMURAI V3 CLEANED")
DEPLOY = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\characters\PEDRO_SAMURAI")

DIRS = ["north", "north-east", "east", "south-east", "south",
        "south-west", "west", "north-west"]
WALK_SOURCE_FRAMES = [0, 2, 4, 7]

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
    if CLEANED.exists():
        shutil.rmtree(CLEANED)
    CLEANED.mkdir(parents=True)

    (CLEANED / "rotations").mkdir(parents=True)
    for d in DIRS:
        src = BK / "rotations" / f"{d}.png"
        if not src.exists():
            print(f"  rotation {d}: missing")
            continue
        im = Image.open(src).convert("RGBA")
        im = clean_halo(im)
        im.save(CLEANED / "rotations" / f"{d}.png", "PNG")
    print("rotations cleaned")

    for d in DIRS:
        anim_dir = BK / "animations" / f"walk_{d}_v3"
        if not anim_dir.exists():
            print(f"  walk {d}: missing, skip")
            continue
        out_dir = CLEANED / "animations" / f"walk_{d}_v3"
        out_dir.mkdir(parents=True)
        for i in range(9):
            f = anim_dir / f"{i}.png"
            if not f.exists():
                continue
            im = Image.open(f).convert("RGBA")
            im = clean_halo(im)
            im.save(out_dir / f"{i}.png", "PNG")
        print(f"  walk {d}: cleaned")

    idle_src = BK / "animations" / "idle"
    if idle_src.exists():
        idle_out = CLEANED / "animations" / "idle"
        idle_out.mkdir(parents=True)
        for f in sorted(idle_src.glob("*.png")):
            im = Image.open(f).convert("RGBA")
            im = clean_halo(im)
            im.save(idle_out / f.name, "PNG")
        print("idle cleaned")
    else:
        print("idle: missing, skip")

    if DEPLOY.exists():
        shutil.rmtree(DEPLOY)
    DEPLOY.mkdir(parents=True)
    (DEPLOY / "rotations").mkdir()
    for d in DIRS:
        src = CLEANED / "rotations" / f"{d}.png"
        if src.exists():
            shutil.copy(src, DEPLOY / "rotations" / f"{d}.png")

    walk_dst_root = DEPLOY / "animations" / "walk-v3"
    for d in DIRS:
        src_dir = CLEANED / "animations" / f"walk_{d}_v3"
        if not src_dir.exists():
            continue
        out = walk_dst_root / d
        out.mkdir(parents=True)
        for new_idx, src_idx in enumerate(WALK_SOURCE_FRAMES):
            src_file = src_dir / f"{src_idx}.png"
            if src_file.exists():
                shutil.copy(src_file, out / f"frame_{new_idx:03d}.png")

    idle_src_clean = CLEANED / "animations" / "idle"
    if idle_src_clean.exists():
        idle_out = DEPLOY / "animations" / "idle" / "south"
        idle_out.mkdir(parents=True)
        for i in range(4):
            f = idle_src_clean / f"{i}.png"
            if f.exists():
                shutil.copy(f, idle_out / f"frame_{i:03d}.png")
    print(f"\nDEPLOY DONE -> {DEPLOY}")


if __name__ == "__main__":
    main()
