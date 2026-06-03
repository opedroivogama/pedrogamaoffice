"""Generate a 128x128 chibi cyborg PNG in BENDER (Futurama) style.

Key Bender traits:
- Cylindrical dome head with a rim/lip at the bottom
- Antenna on top with small ball
- Two big round white eyes with small black pupils (no glowing slits)
- Wide rectangular mouth grille (teeth) below the eyes
- Cylindrical barrel-shaped torso with rounded sides
- Chest compartment door with two round knobs/dials
- Simple cylindrical arms with rounded ends (no claws)
- Cylindrical legs with chunky flat feet

Draws on a 36x60 logical canvas, scales 2x with NEAREST.
"""

from __future__ import annotations

from pathlib import Path
from PIL import Image

# ---- Bender-ish palette ----------------------------------------------------
OUTLINE    = (18, 20, 28, 255)
METAL_HI   = (210, 215, 222, 255)   # chrome highlight
METAL      = (158, 163, 172, 255)   # Bender body gray
METAL_LO   = (110, 115, 124, 255)   # shaded gray
METAL_DARK = (70, 76, 88, 255)
WHITE      = (245, 248, 252, 255)
EYE_PUPIL  = (28, 28, 36, 255)
DOOR       = (122, 128, 138, 255)   # slightly darker than body for chest door
DOOR_DARK  = (88, 94, 104, 255)
KNOB_LIGHT = (180, 184, 192, 255)
GOLD       = (184, 151, 42, 255)    # Jurídico Pro accent on antenna ball + buckle
GOLD_HI    = (225, 195, 90, 255)
TRANS      = (0, 0, 0, 0)

W, H = 36, 60
SCALE = 2
CANVAS = 128

img = Image.new("RGBA", (W, H), TRANS)

def px(x: int, y: int, color=OUTLINE):
    if 0 <= x < W and 0 <= y < H:
        img.putpixel((x, y), color)

def rect(x0: int, y0: int, x1: int, y1: int, color):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px(x, y, color)

def disk(cx: float, cy: float, r: float, color):
    r2 = (r + 0.45) ** 2
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                px(x, y, color)

# ============================================================================
# HEAD — cylindrical dome with bottom rim/lip
# ============================================================================
# Head body: rectangular cylinder with rounded top, x=10..25, y=4..18
HX0, HX1 = 10, 25
HY_TOP, HY_BOTTOM = 4, 18

# Fill cylinder body (straight sides)
rect(HX0, HY_TOP + 2, HX1, HY_BOTTOM, METAL)

# Rounded top dome — half-disk on top of cylinder
HEAD_CX = (HX0 + HX1) / 2  # 17.5
DOME_R = (HX1 - HX0) / 2   # 7.5
for y in range(HY_TOP - 2, HY_TOP + 3):
    for x in range(HX0, HX1 + 1):
        if (x - HEAD_CX) ** 2 + (y - (HY_TOP + 2)) ** 2 <= (DOME_R + 0.45) ** 2:
            if y <= HY_TOP + 2:
                px(x, y, METAL)

# Highlight stripe on dome (upper-left arc)
for y in range(HY_TOP - 1, HY_TOP + 3):
    for x in range(HX0 + 1, int(HEAD_CX)):
        d = ((x - HEAD_CX) ** 2 + (y - (HY_TOP + 2)) ** 2) ** 0.5
        if (DOME_R - 1.8) < d <= (DOME_R - 0.5) and y <= HY_TOP + 2:
            px(x, y, METAL_HI)

# Vertical body shading: right-side shadow column
for y in range(HY_TOP + 2, HY_BOTTOM + 1):
    px(HX1 - 1, y, METAL_LO)
# left-side highlight column (thin)
for y in range(HY_TOP + 3, HY_BOTTOM):
    px(HX0 + 1, y, METAL_HI)

# Bottom rim/lip (Bender's iconic head base) — slightly wider, dark band
RIM_Y0, RIM_Y1 = HY_BOTTOM + 1, HY_BOTTOM + 2
rect(HX0 - 1, RIM_Y0, HX1 + 1, RIM_Y1, METAL_DARK)
# rim highlight
for x in range(HX0, HX1 + 1):
    px(x, RIM_Y0, METAL_LO)

# Head outline (dome top + straight sides + rim)
# Top dome outline
for y in range(HY_TOP - 2, HY_TOP + 3):
    for x in range(HX0 - 1, HX1 + 2):
        d = ((x - HEAD_CX) ** 2 + (y - (HY_TOP + 2)) ** 2) ** 0.5
        if (DOME_R - 0.5) < d <= (DOME_R + 0.5) and y <= HY_TOP + 2:
            px(x, y, OUTLINE)
# Side outlines (cylinder)
for y in range(HY_TOP + 2, HY_BOTTOM + 1):
    px(HX0 - 1, y, OUTLINE)
    px(HX1 + 1, y, OUTLINE)
# Rim outline
for x in range(HX0 - 1, HX1 + 2):
    px(x, RIM_Y0 - 0, OUTLINE) if False else None
px(HX0 - 2, RIM_Y0, OUTLINE); px(HX1 + 2, RIM_Y0, OUTLINE)
px(HX0 - 2, RIM_Y1, OUTLINE); px(HX1 + 2, RIM_Y1, OUTLINE)
for x in range(HX0 - 1, HX1 + 2):
    px(x, RIM_Y1 + 1, OUTLINE)

# ============================================================================
# ANTENNA — thin stalk with small ball on top
# ============================================================================
# Stalk at x=17 (slightly left of center for the iconic Bender lean)
px(17, 0, METAL_LO)
px(17, 1, METAL_LO)
px(17, 2, METAL_LO)
# Ball
disk(17, -1, 1.3, GOLD)   # gold antenna ball (Jurídico Pro accent)
px(17, -1, GOLD_HI)
# outline ball
px(16, -1, OUTLINE) if False else None
px(15, 0, TRANS) if False else None
# manual ball outline
px(16, 0, OUTLINE); px(18, 0, OUTLINE)
px(17, 0, GOLD)  # ensure top of stalk visible
# Re-paint ball cleanly
img.putpixel((17, 0), GOLD)
img.putpixel((16, 0), OUTLINE)
img.putpixel((18, 0), OUTLINE)
# Tiny tip highlight
# (kept minimal — sprite is small)

# ============================================================================
# FACE — two big round white eyes + grille mouth
# ============================================================================
# Eyes: round white circles with small black pupils, sitting on top of head
# Eyes are slightly raised (Bender's eyes sit ABOVE the face like binoculars
# attached to the head). Position them on the rounded dome.
EYE_Y = 6
EYE_L_CX, EYE_R_CX = 14, 21
EYE_R_RAD = 2.4

# White eyeballs
disk(EYE_L_CX, EYE_Y, EYE_R_RAD, WHITE)
disk(EYE_R_CX, EYE_Y, EYE_R_RAD, WHITE)
# Outline eyeballs (black ring)
for cy_off in range(-3, 4):
    for cx_off in range(-3, 4):
        d_l = (cx_off) ** 2 + (cy_off) ** 2
        if (EYE_R_RAD + 0.0) ** 2 < d_l <= (EYE_R_RAD + 1.0) ** 2:
            px(EYE_L_CX + cx_off, EYE_Y + cy_off, OUTLINE)
            px(EYE_R_CX + cx_off, EYE_Y + cy_off, OUTLINE)

# Pupils — small black dots (slightly off-center to give personality)
px(EYE_L_CX, EYE_Y, EYE_PUPIL)
px(EYE_L_CX + 1, EYE_Y, EYE_PUPIL)
px(EYE_R_CX, EYE_Y, EYE_PUPIL)
px(EYE_R_CX + 1, EYE_Y, EYE_PUPIL)

# Bridge between eyes (subtle dark line — like Bender's connecting bar)
px(17, EYE_Y, METAL_DARK)
px(18, EYE_Y, METAL_DARK)

# Eyebrows? Bender doesn't have eyebrows — skip.

# ----------------------------------------------------------------------------
# Mouth grille — horizontal grille below the eyes, full-width
# ----------------------------------------------------------------------------
MOUTH_X0, MOUTH_X1 = 12, 23
MOUTH_Y0, MOUTH_Y1 = 11, 15
# Frame (dark)
rect(MOUTH_X0, MOUTH_Y0, MOUTH_X1, MOUTH_Y1, METAL_DARK)
# Teeth — vertical bars in metallic white/gray
for x in range(MOUTH_X0 + 1, MOUTH_X1):
    if (x - MOUTH_X0) % 2 == 1:
        for y in range(MOUTH_Y0 + 1, MOUTH_Y1):
            px(x, y, WHITE)
    else:
        for y in range(MOUTH_Y0 + 1, MOUTH_Y1):
            px(x, y, METAL_DARK)
# Top/bottom dark frame strips
for x in range(MOUTH_X0, MOUTH_X1 + 1):
    px(x, MOUTH_Y0, OUTLINE)
    px(x, MOUTH_Y1, OUTLINE)
px(MOUTH_X0, MOUTH_Y0, OUTLINE); px(MOUTH_X1, MOUTH_Y0, OUTLINE)
for y in range(MOUTH_Y0, MOUTH_Y1 + 1):
    px(MOUTH_X0 - 0, y, OUTLINE) if False else None

# ============================================================================
# NECK — short cylindrical
# ============================================================================
rect(15, 22, 20, 23, METAL_LO)
px(14, 22, OUTLINE); px(21, 22, OUTLINE)
px(14, 23, OUTLINE); px(21, 23, OUTLINE)

# ============================================================================
# TORSO — Bender's iconic barrel/beer-can shape (rounded sides)
# ============================================================================
# Barrel silhouette: bulges outward in middle
TY_TOP, TY_BOTTOM = 24, 46
# Define width per row to make a barrel (widest in middle)
def barrel_width(y: int) -> tuple[int, int]:
    # y in 24..46 (range 22)
    # widest near middle (y=33..38), narrower at top and bottom
    if y <= 25:
        return (12, 23)
    elif y <= 28:
        return (11, 24)
    elif y <= 42:
        return (10, 25)   # max width middle
    elif y <= 44:
        return (11, 24)
    else:
        return (12, 23)

for y in range(TY_TOP, TY_BOTTOM + 1):
    xl, xr = barrel_width(y)
    rect(xl, y, xr, y, METAL)

# Highlight stripe on left side
for y in range(TY_TOP + 2, TY_BOTTOM - 1):
    xl, _ = barrel_width(y)
    px(xl + 1, y, METAL_HI)
# Shadow stripe on right side
for y in range(TY_TOP + 2, TY_BOTTOM - 1):
    _, xr = barrel_width(y)
    px(xr - 1, y, METAL_LO)

# Top cap and bottom cap (darker rings)
for x in range(barrel_width(TY_TOP)[0], barrel_width(TY_TOP)[1] + 1):
    px(x, TY_TOP, METAL_LO)
for x in range(barrel_width(TY_BOTTOM)[0], barrel_width(TY_BOTTOM)[1] + 1):
    px(x, TY_BOTTOM, METAL_DARK)
# Bottom-of-torso belt strip (one row dark) above legs
for x in range(barrel_width(TY_BOTTOM)[0], barrel_width(TY_BOTTOM)[1] + 1):
    px(x, TY_BOTTOM - 0, METAL_DARK)

# Torso outline
for y in range(TY_TOP, TY_BOTTOM + 1):
    xl, xr = barrel_width(y)
    px(xl - 1, y, OUTLINE)
    px(xr + 1, y, OUTLINE)
# Top outline
xl_t, xr_t = barrel_width(TY_TOP)
for x in range(xl_t, xr_t + 1):
    px(x, TY_TOP - 1, OUTLINE)
# Bottom outline
xl_b, xr_b = barrel_width(TY_BOTTOM)
for x in range(xl_b, xr_b + 1):
    px(x, TY_BOTTOM + 1, OUTLINE)

# ----------------------------------------------------------------------------
# Chest door + two knobs (Bender's compartment)
# ----------------------------------------------------------------------------
DOOR_X0, DOOR_Y0, DOOR_X1, DOOR_Y1 = 12, 30, 23, 42
rect(DOOR_X0, DOOR_Y0, DOOR_X1, DOOR_Y1, DOOR)
# Door bevel
for x in range(DOOR_X0, DOOR_X1 + 1):
    px(x, DOOR_Y0, METAL_HI)
for y in range(DOOR_Y0, DOOR_Y1 + 1):
    px(DOOR_X0, y, METAL_HI)
for x in range(DOOR_X0, DOOR_X1 + 1):
    px(x, DOOR_Y1, DOOR_DARK)
for y in range(DOOR_Y0, DOOR_Y1 + 1):
    px(DOOR_X1, y, DOOR_DARK)
# Door outline
for x in range(DOOR_X0 - 0, DOOR_X1 + 1):
    px(x, DOOR_Y0 - 0, OUTLINE) if False else None
# crisp outline
for x in range(DOOR_X0, DOOR_X1 + 1):
    px(x, DOOR_Y0 - 0, OUTLINE) if False else None
# Use simple rectangle outline:
for x in range(DOOR_X0, DOOR_X1 + 1):
    img.putpixel((x, DOOR_Y0 - 0), OUTLINE) if False else None
# (simpler — draw outline pixels manually around the door)
for x in range(DOOR_X0, DOOR_X1 + 1):
    px(x, DOOR_Y0 - 0, OUTLINE) if False else None

# Just draw outline using direct pixel ops:
for x in range(DOOR_X0 - 0, DOOR_X1 + 1):
    img.putpixel((x, DOOR_Y0), OUTLINE)
    img.putpixel((x, DOOR_Y1), OUTLINE)
for y in range(DOOR_Y0, DOOR_Y1 + 1):
    img.putpixel((DOOR_X0, y), OUTLINE)
    img.putpixel((DOOR_X1, y), OUTLINE)

# Two round knobs/dials on the door
def draw_knob(cx: int, cy: int):
    disk(cx, cy, 1.6, KNOB_LIGHT)
    px(cx, cy, METAL_HI)
    # outline
    for ox, oy in [(-2, 0), (2, 0), (0, -2), (0, 2),
                   (-1, -1), (-1, 1), (1, -1), (1, 1)]:
        px(cx + ox, cy + oy, OUTLINE)

draw_knob(15, 34)
draw_knob(20, 34)

# Door hinge dots on left side
px(DOOR_X0 + 1, DOOR_Y0 + 2, METAL_DARK)
px(DOOR_X0 + 1, DOOR_Y1 - 2, METAL_DARK)

# Small status LED below knobs
px(17, 39, GOLD); px(18, 39, GOLD)
px(17, 40, GOLD_HI); px(18, 40, GOLD_HI)

# ============================================================================
# ARMS — slim cylindrical, dangling at sides (Bender style)
# ============================================================================
def draw_arm(side: str):
    if side == "L":
        x_out, x_in = 8, 9
    else:
        x_out, x_in = 27, 26
    # Shoulder joint disk
    disk(x_in if side == "L" else x_in, 26, 1.5, METAL)
    # Upper arm (single column wide)
    for y in range(27, 35):
        px(x_in, y, METAL)
    # Elbow joint
    px(x_in, 35, METAL_LO)
    # Forearm
    for y in range(36, 43):
        px(x_in, y, METAL)
    # Hand (small rounded "fist") — 2x2 block with rounded corners
    disk(x_in - (1 if side == "L" else -1), 44, 1.6, METAL)
    # Outline arm
    for y in range(26, 44):
        # left outline
        ol_x = x_in - 1
        or_x = x_in + 1
        px(ol_x, y, OUTLINE)
        px(or_x, y, OUTLINE)
    # Highlight stripe on outer side
    for y in range(28, 43):
        px(x_in, y, METAL_HI if side == "L" else METAL_LO)

draw_arm("L")
draw_arm("R")

# ============================================================================
# LEGS — sturdier cylinders
# ============================================================================
def draw_leg(x_center: int):
    # thigh
    for y in range(47, 53):
        rect(x_center - 1, y, x_center + 1, y, METAL)
    # knee band (single dark row)
    rect(x_center - 1, 53, x_center + 1, 53, METAL_DARK)
    # shin
    for y in range(54, 58):
        rect(x_center - 1, y, x_center + 1, y, METAL)
    # highlight
    for y in range(48, 53):
        px(x_center - 1, y, METAL_HI)
    for y in range(54, 58):
        px(x_center - 1, y, METAL_HI)
    # shadow
    for y in range(48, 53):
        px(x_center + 1, y, METAL_LO)
    for y in range(54, 58):
        px(x_center + 1, y, METAL_LO)
    # outline
    for y in range(47, 58):
        px(x_center - 2, y, OUTLINE)
        px(x_center + 2, y, OUTLINE)

draw_leg(14)
draw_leg(21)

# ============================================================================
# FEET — wide flat chunky boots (Bender style)
# ============================================================================
def draw_foot(x_center: int):
    # Foot extends forward (left) of leg — Bender's feet are wider/longer
    rect(x_center - 3, 58, x_center + 3, 59, METAL_DARK)
    # Toe highlight
    for x in range(x_center - 2, x_center + 3):
        px(x, 58, METAL_LO)
    # Gold trim across toe
    for x in range(x_center - 2, x_center + 3):
        px(x, 59, GOLD)
    px(x_center - 2, 59, GOLD_HI)
    # Outline
    for x in range(x_center - 3, x_center + 4):
        px(x, 58 - 0, OUTLINE) if False else None
    # crisp outline
    img.putpixel((x_center - 3, 58), OUTLINE)
    img.putpixel((x_center + 3, 58), OUTLINE)
    img.putpixel((x_center - 3, 59), OUTLINE)
    img.putpixel((x_center + 3, 59), OUTLINE)
    for x in range(x_center - 3, x_center + 4):
        img.putpixel((x, 59 + 0), OUTLINE) if False else None
    # bottom outline row
    # (canvas is only 60 tall, y=59 is last — outline above only)
    # add top outline:
    for x in range(x_center - 3, x_center + 4):
        img.putpixel((x, 58 - 1), OUTLINE) if False else None

draw_foot(14)
draw_foot(21)

# ============================================================================
# Compose into 128x128 canvas
# ============================================================================
scaled = img.resize((W * SCALE, H * SCALE), Image.NEAREST)
out = Image.new("RGBA", (CANVAS, CANVAS), TRANS)
ox = (CANVAS - scaled.width) // 2
oy = 124 - scaled.height
out.paste(scaled, (ox, oy), scaled)

dst = Path(__file__).resolve().parents[1] / "frontend" / "public" / "sprites" / "characters" / "cyborg.png"
dst.parent.mkdir(parents=True, exist_ok=True)
out.save(dst)
print(f"wrote {dst}  size={out.size}  scaled_block={W*SCALE}x{H*SCALE}")
