"""Mostra pixels semi-transparentes ou claros nas bordas dos dois sprites."""
from collections import Counter
from pathlib import Path
from PIL import Image

TARGETS = [
    Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\watercooler.png"),
    Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\coffee-machine.png"),
]


def inspect(path: Path) -> None:
    print(f"\n=== {path.name} ===")
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    px = img.load()

    # Pixels com alfa parcial (semi-transparentes) — geralmente borda
    semi = Counter()
    # Pixels opacos brancos/claros (>= 200 RGB)
    light = Counter()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 250:
                semi[(r, g, b, a)] += 1
            if a >= 200 and r >= 200 and g >= 200 and b >= 200:
                light[(r, g, b)] += 1

    print(f"semi-transparentes únicos: {len(semi)} total: {sum(semi.values())}")
    for col, n in semi.most_common(8):
        print(f"  {col}  count={n}")
    print(f"\nclaros (RGB>=200) únicos: {len(light)} total: {sum(light.values())}")
    for col, n in light.most_common(10):
        print(f"  rgb{col}  count={n}")


if __name__ == "__main__":
    for p in TARGETS:
        inspect(p)
