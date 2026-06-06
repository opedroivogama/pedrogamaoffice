"""Acha pixels brancos/claros no topo da cadeira (área do encosto)."""
from collections import Counter
from PIL import Image

src = r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\chair.png"
img = Image.open(src).convert("RGBA")
w, h = img.size
print(f"chair size: {w}x{h}")

# Sample top 25% of the image (backrest area)
top_region = int(h * 0.25)
px = img.load()
c = Counter()
for y in range(top_region):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a < 200:
            continue
        # Brilho relativo
        if (r + g + b) > 250:  # claro
            c[(r, g, b)] += 1
print(f"\nTop 25% area - pixels claros (R+G+B>250):")
for col, n in c.most_common(15):
    print(f"  rgb{col}  count={n}")
