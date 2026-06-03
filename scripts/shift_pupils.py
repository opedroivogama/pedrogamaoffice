"""Build typing-eye-left variant by manually shifting pupil pixels left.

Strategy:
1. Load default_typing.png (128x128).
2. Define a tight eye region (y=37..52, both eyes horizontally).
3. Identify pupil pixels (very dark RGB) within that region.
4. Shift them left by 2 px; refill the original pupil spot with the average
   nearby light eye-white color.
5. Save as default_typing_eyeleft.png.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "public" / "sprites" / "characters" / "default_typing.png"
OUT = ROOT / "frontend" / "public" / "sprites" / "characters" / "default_typing_eyeleft.png"

# Tight eye band (covers both pupils, no hair/forehead/mouth).
EYE_Y_MIN, EYE_Y_MAX = 37, 52
EYE_X_MIN, EYE_X_MAX = 40, 90

SHIFT_X = 2  # pixels to shift pupil leftward
PUPIL_THRESHOLD = 60  # RGB sum threshold; pixels darker than this are "pupil"


def is_pupil(px) -> bool:
    r, g, b, a = px
    return a > 200 and r < PUPIL_THRESHOLD and g < PUPIL_THRESHOLD and b < PUPIL_THRESHOLD


def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    src_px = img.load()
    out = img.copy()
    out_px = out.load()

    # Collect pupil pixels in eye band
    pupil_coords = []
    for y in range(EYE_Y_MIN, EYE_Y_MAX + 1):
        for x in range(EYE_X_MIN, EYE_X_MAX + 1):
            if is_pupil(src_px[x, y]):
                pupil_coords.append((x, y))

    if not pupil_coords:
        print("WARN: no pupil pixels found — adjust threshold or region")
        return

    # Sample a nearby light pixel (eye white) to refill the vacated original
    def sample_eye_white(near_x: int, near_y: int) -> tuple[int, int, int, int]:
        # Probe a few pixels to the right/above to find a light non-pupil pixel
        for dy in (-1, 0, 1):
            for dx in (1, 2, 3, -1, -2):
                px = src_px[near_x + dx, near_y + dy]
                r, g, b, a = px
                if a > 200 and r > 120 and (r + g + b) > 360 and not is_pupil(px):
                    return (r, g, b, a)
        # Fallback: light tan/skin
        return (240, 220, 200, 255)

    # Erase old pupils with eye-white, then paint new pupils 2px to the left
    erased_first = {}
    for x, y in pupil_coords:
        erased_first[(x, y)] = src_px[x, y]
        out_px[x, y] = sample_eye_white(x, y)

    for x, y in pupil_coords:
        new_x = x - SHIFT_X
        if EYE_X_MIN - SHIFT_X <= new_x <= EYE_X_MAX:
            out_px[new_x, y] = erased_first[(x, y)]

    out.save(OUT)
    print(f"wrote {OUT} (shifted {len(pupil_coords)} pupil pixels {SHIFT_X}px left)")


if __name__ == "__main__":
    main()
