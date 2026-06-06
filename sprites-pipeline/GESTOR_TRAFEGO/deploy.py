"""Deploy GESTOR_TRAFEGO sprites cleaned -> frontend/public/sprites/characters/GESTOR_TRAFEGO/.

Estrutura final (mirrors PEDRO):
  rotations/<dir>.png  (8 dirs)
  animations/walk-v3/<DIR_UPPER>/frame_000..005 (curated: source 0,2,3,4,7,8)
  animations/idle/SOUTH/frame_000..003
"""
from pathlib import Path
import shutil

SRC = Path(r"C:\Users\Pedro\Desktop\GESTOR_TRAFEGO CLEANED")
DST = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\characters\GESTOR_TRAFEGO")

DIRS = ["south", "east", "west", "north", "south-east", "south-west", "north-east", "north-west"]
WALK_SOURCE_FRAMES = [0, 2, 3, 4, 7, 8]


def main():
    if DST.exists():
        shutil.rmtree(DST)
    DST.mkdir(parents=True)

    # 1. rotations
    rot_dst = DST / "rotations"
    rot_dst.mkdir()
    for d in DIRS:
        shutil.copy(SRC / "rotations" / f"{d}.png", rot_dst / f"{d}.png")
    print(f"rotations: 8 PNGs copied")

    # 2. walk-v3 curated
    walk_dst_root = DST / "animations" / "walk-v3"
    for d in DIRS:
        d_dst = walk_dst_root / d.upper()
        d_dst.mkdir(parents=True)
        for new_idx, src_idx in enumerate(WALK_SOURCE_FRAMES):
            src_file = SRC / "animations" / f"walk_{d}_v3" / f"{src_idx}.png"
            dst_file = d_dst / f"frame_{new_idx:03d}.png"
            shutil.copy(src_file, dst_file)
        print(f"walk-v3 {d.upper()}: 6 curated frames")

    # 3. idle
    idle_dst = DST / "animations" / "idle" / "SOUTH"
    idle_dst.mkdir(parents=True)
    for i in range(4):
        shutil.copy(SRC / "animations" / "idle" / f"{i}.png", idle_dst / f"frame_{i:03d}.png")
    print(f"idle SOUTH: 4 frames")

    print(f"\nDEPLOY DONE -> {DST}")


if __name__ == "__main__":
    main()
