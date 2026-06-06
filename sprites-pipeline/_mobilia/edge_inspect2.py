"""Acha pixels claros próximos da borda transparente (suspeitos de bg residual)."""
from pathlib import Path
from PIL import Image

TARGETS = [
    Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\watercooler.png"),
    Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\coffee-machine.png"),
]

NEIGHBOR_RADIUS = 3
LIGHT_THRESHOLD = 180


def near_transparent(px, x, y, w, h, radius=NEIGHBOR_RADIUS) -> bool:
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                if px[nx, ny][3] == 0:
                    return True
    return False


def main() -> None:
    for path in TARGETS:
        print(f"\n=== {path.name} ===")
        img = Image.open(path).convert("RGBA")
        w, h = img.size
        px = img.load()

        # Pixels opacos claros próximos de transparente — pinta de magenta numa cópia
        marked = img.copy()
        mp = marked.load()
        count = 0
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 250:
                    continue
                if min(r, g, b) < LIGHT_THRESHOLD:
                    continue
                if near_transparent(px, x, y, w, h):
                    mp[x, y] = (255, 0, 255, 255)
                    count += 1

        out = Path(r"C:\Users\Pedro\Desktop\escritorio online\sprites-pipeline\_mobilia") / f"DEBUG-{path.stem}-suspects.png"
        marked.save(out)
        print(f"  suspeitos pintados de magenta: {count}")
        print(f"  preview: {out}")


if __name__ == "__main__":
    main()
