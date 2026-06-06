"""Pipeline CLAUDIUS_SLIM: cleanup agressivo + curagem 4 frames + deploy."""
from pathlib import Path
from PIL import Image

BK = Path(r"C:\Users\Pedro\Desktop\escritorio online\sprites-pipeline\CLAUDIUS_SLIM")
DEPLOY = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\characters\CLAUDIUS_SLIM")

DIRS = ["north", "north-east", "east", "south-east", "south",
        "south-west", "west", "north-west"]
WALK_SOURCE_FRAMES = [0, 2, 4, 7]
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
            continue
        im = Image.open(src).convert("RGBA")
        im = clean_halo(im)
        im.save(DEPLOY / "rotations" / f"{d}.png", "PNG")
    print("rotations cleaned")

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
            im = clean_halo(im)
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
            im = clean_halo(im)
            im.save(idle_out / f"frame_{i:03d}.png", "PNG")
    print("idle 2 frames cleaned")

    print(f"\nDONE -> {DEPLOY}")


if __name__ == "__main__":
    main()
