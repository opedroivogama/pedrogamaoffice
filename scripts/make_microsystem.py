"""Convert the old-printer asset into a grayscale 'microsystem' variant.

- Desaturates each pixel to luminance.
- Applies a subtle cool-gray tint (slight blue cast) for a modern hi-fi look.
- Preserves alpha and outlines intact.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "public" / "sprites" / "old-printer.png"
OUT = ROOT / "frontend" / "public" / "sprites" / "microsystem.png"

# Cool-gray tint multiplier (R, G, B). 1.0 = no change.
# Slight pull toward blue: red dampened, blue boosted.
TINT_R = 0.94
TINT_G = 0.97
TINT_B = 1.08


def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # Luminance (BT.601)
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            # Apply cool-gray tint, clamp to 0..255
            nr = max(0, min(255, int(lum * TINT_R)))
            ng = max(0, min(255, int(lum * TINT_G)))
            nb = max(0, min(255, int(lum * TINT_B)))
            px[x, y] = (nr, ng, nb, a)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
