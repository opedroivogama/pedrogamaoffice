"""Copia do CLEANED pro DEPLOY sem deletar pastas (evita lock do dev server)."""
from pathlib import Path
import shutil

CLEANED = Path(r"C:\Users\Pedro\Desktop\PEDRO_SAMURAI V3 CLEANED")
DEPLOY = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\characters\PEDRO_SAMURAI")

DIRS = ["north", "north-east", "east", "south-east", "south",
        "south-west", "west", "north-west"]
WALK_SOURCE_FRAMES = [0, 2, 4, 7]


def main():
    # Rotations
    for d in DIRS:
        src = CLEANED / "rotations" / f"{d}.png"
        dst = DEPLOY / "rotations" / f"{d}.png"
        if src.exists():
            shutil.copy(src, dst)
    print("rotations copied")

    # Walks (curated)
    for d in DIRS:
        src_dir = CLEANED / "animations" / f"walk_{d}_v3"
        if not src_dir.exists():
            continue
        out = DEPLOY / "animations" / "walk-v3" / d
        out.mkdir(parents=True, exist_ok=True)
        for new_idx, src_idx in enumerate(WALK_SOURCE_FRAMES):
            src_file = src_dir / f"{src_idx}.png"
            if src_file.exists():
                shutil.copy(src_file, out / f"frame_{new_idx:03d}.png")
        print(f"  walk {d}: 4 frames")

    # Idle
    idle_src = CLEANED / "animations" / "idle"
    if idle_src.exists():
        idle_out = DEPLOY / "animations" / "idle" / "south"
        idle_out.mkdir(parents=True, exist_ok=True)
        for i in range(4):
            f = idle_src / f"{i}.png"
            if f.exists():
                shutil.copy(f, idle_out / f"frame_{i:03d}.png")
        print("idle copied")

    print(f"\nREDEPLOY DONE -> {DEPLOY}")


if __name__ == "__main__":
    main()
