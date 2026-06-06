"""Acha pixels brancos NEUTROS (não-azul) no topo da cadeira."""
from collections import Counter
from PIL import Image

for path in [
    r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\chair.png",
    r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\chair-red.png",
]:
    print(f"\n=== {path.split(chr(92))[-1]} ===")
    img = Image.open(path).convert("RGBA")
    w, h = img.size

    px = img.load()
    c = Counter()
    # Pixels NEUTROS (baixa saturação): max-min <= 25, luma >= 150
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            if min(r, g, b) >= 130 and (max(r, g, b) - min(r, g, b)) <= 30:
                c[(r, g, b)] += 1
    print(f"pixels neutros claros: {sum(c.values())} unique: {len(c)}")
    for col, n in c.most_common(15):
        print(f"  rgb{col}  count={n}")
