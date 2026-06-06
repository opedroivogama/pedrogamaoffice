from PIL import Image
from collections import Counter

src = r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\chair-red.png"
img = Image.open(src).convert("RGBA")
px = list(img.getdata())
opaque = [p for p in px if p[3] > 200]
c = Counter(opaque)
print(f"total opaque: {len(opaque)}  unique: {len(c)}")
print("\nTop 25 colors:")
for color, count in c.most_common(25):
    r, g, b, a = color
    print(f"  rgb({r:3d},{g:3d},{b:3d}) hex=#{r:02x}{g:02x}{b:02x}  count={count}")

print("\nBluish pixels (B > R and B > G):")
bluish = [(p, n) for p, n in c.items() if p[2] > p[0] and p[2] > p[1]]
bluish.sort(key=lambda x: -x[1])
for color, count in bluish[:20]:
    r, g, b, a = color
    print(f"  rgb({r:3d},{g:3d},{b:3d}) hex=#{r:02x}{g:02x}{b:02x}  count={count}")
