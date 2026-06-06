"""Pipeline final do PEDRO_SAMURAI v2:
 1. Recolor pele na rotation south-east (já feito manualmente — pulado se existir)
 2. Recolor pele em TODOS os 9 frames do walk south-east
 3. Cleanup halo branco em todas as rotations + walks + idle
 4. Curagem de walks (frames 0,2,3,4,7,8) + deploy
"""
from pathlib import Path
from PIL import Image
import shutil

BK = Path(r"C:\Users\Pedro\Desktop\PEDRO_SAMURAI V2 BACKUP")
CLEANED = Path(r"C:\Users\Pedro\Desktop\PEDRO_SAMURAI V2 CLEANED")
DEPLOY = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\characters\PEDRO_SAMURAI")

DIRS = ["north", "north-east", "east", "south-east", "south",
        "south-west", "west", "north-west"]
WALK_SOURCE_FRAMES = [0, 2, 4, 7]

ALPHA_THRESHOLD = 128
WHITE_SUM = 640
CLEANUP_PASSES = 2


def is_skinlike(r, g, b, a):
    if a < 200: return False
    if not (r > g > b): return False
    if r - b < 25: return False
    if r < 60: return False
    if r > 240 and g > 230: return False
    total = r + g + b
    if total < 180: return False
    if total > 660: return False
    return True


def avg_skin(im):
    px = im.load()
    w, h = im.size
    samples = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_skinlike(r, g, b, a):
                samples.append((r, g, b))
    if not samples:
        return None
    n = len(samples)
    return (
        sum(s[0] for s in samples) // n,
        sum(s[1] for s in samples) // n,
        sum(s[2] for s in samples) // n,
    )


def recolor_to_target(im, target_avg):
    """Shift skin pixels to match target average."""
    src_avg = avg_skin(im)
    if src_avg is None:
        return im
    dr = target_avg[0] - src_avg[0]
    dg = target_avg[1] - src_avg[1]
    db = target_avg[2] - src_avg[2]
    if abs(dr) < 5 and abs(dg) < 5 and abs(db) < 5:
        return im  # nada pra fazer
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_skinlike(r, g, b, a):
                px[x, y] = (
                    max(0, min(255, r + dr)),
                    max(0, min(255, g + dg)),
                    max(0, min(255, b + db)),
                    a,
                )
    return im


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
    # Múltiplas passadas removem halo de 2+ pixels (cada passada come 1 pixel)
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

    # 1. Target skin = south rotation (já é o tom certo)
    south_rot = Image.open(BK / "rotations" / "south.png").convert("RGBA")
    target_skin = avg_skin(south_rot)
    if target_skin is None:
        raise SystemExit("FATAL: skin não detectada na south rotation")
    print(f"Target skin RGB={target_skin}")

    # 2. Rotations — recolor SE (se necessário) + clean halo
    (CLEANED / "rotations").mkdir(parents=True)
    for d in DIRS:
        src = BK / "rotations" / f"{d}.png"
        if not src.exists():
            print(f"  rotation {d}: missing, skip")
            continue
        im = Image.open(src).convert("RGBA")
        if d == "south-east":
            im = recolor_to_target(im, target_skin)
        im = clean_halo(im)
        im.save(CLEANED / "rotations" / f"{d}.png", "PNG")
    print("rotations done")

    # 3. Walks — recolor SE em TODOS os 9 frames + clean halo todos
    for d in DIRS:
        anim_dir = BK / "animations" / f"walk_{d}_v3"
        out_dir = CLEANED / "animations" / f"walk_{d}_v3"
        if not anim_dir.exists():
            print(f"  walk {d}: missing, skip")
            continue
        out_dir.mkdir(parents=True)
        for i in range(9):
            f = anim_dir / f"{i}.png"
            if not f.exists():
                continue
            im = Image.open(f).convert("RGBA")
            if d == "south-east":
                im = recolor_to_target(im, target_skin)
            im = clean_halo(im)
            im.save(out_dir / f"{i}.png", "PNG")
        print(f"  walk {d}: cleaned")

    # 4. Idle — só cleanup (south, sem recolor)
    idle_src = BK / "animations" / "idle"
    if idle_src.exists():
        idle_out = CLEANED / "animations" / "idle"
        idle_out.mkdir(parents=True)
        for f in sorted(idle_src.glob("*.png")):
            im = Image.open(f).convert("RGBA")
            im = clean_halo(im)
            im.save(idle_out / f.name, "PNG")
        print("idle done")
    else:
        print("idle: missing, skip")

    # 5. Deploy curado
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

    idle_src = CLEANED / "animations" / "idle"
    if idle_src.exists():
        idle_out = DEPLOY / "animations" / "idle" / "south"
        idle_out.mkdir(parents=True)
        for i in range(4):
            f = idle_src / f"{i}.png"
            if f.exists():
                shutil.copy(f, idle_out / f"frame_{i:03d}.png")
    print(f"\nDEPLOY DONE -> {DEPLOY}")


if __name__ == "__main__":
    main()
