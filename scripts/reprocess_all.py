"""Re-process all character sprites with aggressive chroma key.

The Gemini "magenta" background renders as ~(226, 48, 144). Anti-aliased
edges leave residual pink-purple pixels at (R≈120-150, G≈10-30, B≈60-80)
which were missed by earlier passes.

Discriminator vs the red tie in user_suit.png:
- tie pixels: R≈140-185, G≈5-15, B≈30-45  (low B)
- chroma pink residual: R≈120-160, G≈10-30, B≈55-100  (higher B)

We use B > ~50 OR a hue-direction test to catch one but not the other.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FRAME = 128

JOBS = [
    # (source 1024 path, output 128 path)
    ("scripts/test_gen_v2.png",         "frontend/public/sprites/characters/default.png"),
    ("scripts/test_gen_typing_v2.png",  "frontend/public/sprites/characters/default_typing.png"),
    ("scripts/test_gen_user.png",       "frontend/public/sprites/characters/user.png"),
    ("scripts/test_gen_user_suit.png",  "frontend/public/sprites/characters/user_suit.png"),
]


def kill_chroma(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            # Pass 1 — bright magenta core
            if r > 180 and g < 110 and 90 < b < 200 and r > g + 80:
                px[x, y] = (0, 0, 0, 0); continue
            # Pass 2 — pinkish halo (medium R, low G, moderate B)
            if r > 100 and r < 175 and g < 55 and 50 < b < 110 and (r - g) > 70:
                px[x, y] = (0, 0, 0, 0); continue
            # Pass 3 — very dark purple residuals (rgb like 32, 0, 31)
            if r < 60 and g < 20 and b < 60 and r > 10 and abs(r - b) < 25 and g < r - 8:
                px[x, y] = (0, 0, 0, 0); continue
            # Pass 4 — strict chroma fingerprint missed by Pass 1/2: pixels with
            # very low green AND significant blue presence, NOT the tie's
            # saturated red (whose B is much smaller than R).
            #   chroma residual:   R 140-220, G < 40, B 85-150, R-G > 100
            #   tie red excluded:  B < 50 → fails B > 85 check
            if 140 <= r <= 220 and g < 40 and 85 <= b <= 150 and (r - g) > 100:
                px[x, y] = (0, 0, 0, 0); continue
            # Pass 5 — DESATURATE pinkish-brown edge contamination (chroma bleed
            # into hair/skin). These pixels are valid silhouette but have a
            # magenta tint pulling R too high. Cap R closer to G to make them
            # neutral brown/tan. Tie red is safe because its B is much smaller.
            if r > 130 and 60 < g < 140 and 60 < b < 140 and (r - g) > 30 and (r - b) < 80:
                new_r = min(r, g + 25)
                px[x, y] = (new_r, g, b, a)
    return img


def process(src_path: Path, out_path: Path) -> None:
    if not src_path.exists():
        print(f"SKIP (no source): {src_path}")
        return
    src = Image.open(src_path)
    w, h = src.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = src.crop((left, top, left + side, top + side))
    small = cropped.resize((FRAME, FRAME), Image.NEAREST)
    out = kill_chroma(small)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    for src, dst in JOBS:
        process(ROOT / src, ROOT / dst)
