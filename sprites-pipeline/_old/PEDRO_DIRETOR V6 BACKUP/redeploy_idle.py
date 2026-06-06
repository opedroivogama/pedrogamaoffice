"""Re-deploy só do idle (8 frames novos)."""
from pathlib import Path
from PIL import Image
import shutil

BK = Path(r"C:\Users\Pedro\Desktop\PEDRO_DIRETOR V6 BACKUP")
DEPLOY = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\characters\PEDRO_SAMURAI")

ALPHA_THRESHOLD = 200
WHITE_SUM = 540


def clean(im):
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
    for _ in range(6):
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
    idle_out = DEPLOY / "animations" / "idle" / "south"
    if idle_out.exists():
        for f in idle_out.glob("*.png"):
            try:
                f.unlink()
            except Exception:
                pass
    idle_out.mkdir(parents=True, exist_ok=True)
    for i in range(6):
        src = BK / "animations" / "idle" / f"{i}.png"
        if src.exists():
            im = Image.open(src).convert("RGBA")
            im = clean(im)
            im.save(idle_out / f"frame_{i:03d}.png", "PNG")
    print("idle 6 frames deployed")


if __name__ == "__main__":
    main()
