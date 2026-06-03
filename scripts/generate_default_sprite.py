"""Generate an original 256x256 character sprite sheet (4 directions x 4 frames).

Pure code, no external sprite references. Original art.
"""
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "sprites" / "characters" / "default.png"

FRAME = 64
PX = 3  # virtual pixel size in real pixels
COLS_V = 16
ROWS_V = 20

PALETTE = {
    "K": (74, 50, 32, 255),       # hair: warm dark brown
    "k": (54, 36, 22, 255),       # hair shadow
    "F": (248, 200, 144, 255),    # skin
    "f": (200, 144, 96, 255),     # skin shadow
    "E": (32, 24, 24, 255),       # eye
    "m": (160, 80, 60, 255),      # mouth
    "S": (88, 124, 176, 255),     # shirt (blue-gray default; tinted per agent later)
    "s": (60, 88, 132, 255),      # shirt shadow
    "C": (240, 240, 240, 255),    # collar white
    "P": (56, 60, 84, 255),       # pants
    "p": (36, 40, 60, 255),       # pants shadow
    "B": (84, 56, 36, 255),       # shoe
    "b": (52, 32, 20, 255),       # shoe shadow
    ".": None,                     # transparent
}

# Each row 16 chars. Generic office-worker chibi, my own design.
TEMPLATE_DOWN_IDLE = [
    "................",
    ".....kKKKKk.....",
    "....KKKKKKKK....",
    "...KKKFFFFKKK...",
    "..KKFFFFFFFFKK..",
    "..KFFEFFFFEFFK..",
    "..KFFFFFFFFFFK..",
    "..KFFFFmmFFFFK..",
    "...fFFFFFFFFf...",
    "....fFFFFFFf....",
    "....CCCCCCCC....",
    "...SSCCCCCCSS...",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..PPPPPPPPPPPP..",
    "..pPPP....PPPp..",
    "..pPPP....PPPp..",
    "..BBBb....bBBB..",
    "................",
]

# Walk frames: slight leg variation (left leg forward, right leg forward).
TEMPLATE_DOWN_WALK_L = [
    "................",
    ".....kKKKKk.....",
    "....KKKKKKKK....",
    "...KKKFFFFKKK...",
    "..KKFFFFFFFFKK..",
    "..KFFEFFFFEFFK..",
    "..KFFFFFFFFFFK..",
    "..KFFFFmmFFFFK..",
    "...fFFFFFFFFf...",
    "....fFFFFFFf....",
    "....CCCCCCCC....",
    "...SSCCCCCCSS...",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..PPPPPPPPPPPP..",
    "..pPPPP..pPPPp..",
    "...PPPP..pPPPp..",
    "..BBBb....bBBB..",
    "................",
]
TEMPLATE_DOWN_WALK_R = [
    "................",
    ".....kKKKKk.....",
    "....KKKKKKKK....",
    "...KKKFFFFKKK...",
    "..KKFFFFFFFFKK..",
    "..KFFEFFFFEFFK..",
    "..KFFFFFFFFFFK..",
    "..KFFFFmmFFFFK..",
    "...fFFFFFFFFf...",
    "....fFFFFFFf....",
    "....CCCCCCCC....",
    "...SSCCCCCCSS...",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..PPPPPPPPPPPP..",
    "..pPPPp..PPPPp..",
    "..pPPPp...PPPP..",
    "..BBBb....bBBB..",
    "................",
]

# Side view: half-turn, single-eye visible.
TEMPLATE_SIDE_IDLE = [
    "................",
    ".....KKKKKk.....",
    "....KKKKKKKK....",
    "...KKFFFFFFKK...",
    "..KKFFFFFFFFKK..",
    "..KFFEEFFFFFFK..",
    "..KFFFFFFFFFFK..",
    "..KFFFFmFFFFFK..",
    "...fFFFFFFFFf...",
    "....fFFFFFFf....",
    "....CCCCCCCC....",
    "...SSCCCCCCSS...",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..PPPPPPPPPPPP..",
    "..pPPPPPPPPPPp..",
    "..pPPPPPPPPPPp..",
    "..BBBBbbbbBBBB..",
    "................",
]
TEMPLATE_SIDE_WALK = [
    "................",
    ".....KKKKKk.....",
    "....KKKKKKKK....",
    "...KKFFFFFFKK...",
    "..KKFFFFFFFFKK..",
    "..KFFEEFFFFFFK..",
    "..KFFFFFFFFFFK..",
    "..KFFFFmFFFFFK..",
    "...fFFFFFFFFf...",
    "....fFFFFFFf....",
    "....CCCCCCCC....",
    "...SSCCCCCCSS...",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..PPPPPPPPPPPP..",
    "...pPPPP..PPPPp.",
    "....pPPP..PPPPp.",
    "...BBBb...bBBB..",
    "................",
]

# Up view: back of head, no face.
TEMPLATE_UP_IDLE = [
    "................",
    ".....kKKKKk.....",
    "....KKKKKKKK....",
    "...KKKKKKKKKK...",
    "..KKKKKKKKKKKK..",
    "..KKKKKKKKKKKK..",
    "..KKKKKKKKKKKK..",
    "..KKKKKKKKKKKK..",
    "...kKKKKKKKKk...",
    "....kKKKKKKk....",
    "....CCCCCCCC....",
    "...SSCCCCCCSS...",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..PPPPPPPPPPPP..",
    "..pPPP....PPPp..",
    "..pPPP....PPPp..",
    "..BBBb....bBBB..",
    "................",
]
TEMPLATE_UP_WALK_L = [
    "................",
    ".....kKKKKk.....",
    "....KKKKKKKK....",
    "...KKKKKKKKKK...",
    "..KKKKKKKKKKKK..",
    "..KKKKKKKKKKKK..",
    "..KKKKKKKKKKKK..",
    "..KKKKKKKKKKKK..",
    "...kKKKKKKKKk...",
    "....kKKKKKKk....",
    "....CCCCCCCC....",
    "...SSCCCCCCSS...",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..PPPPPPPPPPPP..",
    "..pPPPP..pPPPp..",
    "...PPPP..pPPPp..",
    "..BBBb....bBBB..",
    "................",
]
TEMPLATE_UP_WALK_R = [
    "................",
    ".....kKKKKk.....",
    "....KKKKKKKK....",
    "...KKKKKKKKKK...",
    "..KKKKKKKKKKKK..",
    "..KKKKKKKKKKKK..",
    "..KKKKKKKKKKKK..",
    "..KKKKKKKKKKKK..",
    "...kKKKKKKKKk...",
    "....kKKKKKKk....",
    "....CCCCCCCC....",
    "...SSCCCCCCSS...",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..sSSSSSSSSSSs..",
    "..PPPPPPPPPPPP..",
    "..pPPPp..PPPPp..",
    "..pPPPp...PPPP..",
    "..BBBb....bBBB..",
    "................",
]


def render_frame(template: list[str], mirror_x: bool = False) -> Image.Image:
    img = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    sprite_w = COLS_V * PX
    sprite_h = ROWS_V * PX
    offset_x = (FRAME - sprite_w) // 2
    offset_y = (FRAME - sprite_h) // 2 + 2  # nudge down a tiny bit
    for row in range(ROWS_V):
        line = template[row]
        if mirror_x:
            line = line[::-1]
        for col in range(COLS_V):
            ch = line[col]
            color = PALETTE.get(ch)
            if color is None:
                continue
            x0 = offset_x + col * PX
            y0 = offset_y + row * PX
            for dx in range(PX):
                for dy in range(PX):
                    img.putpixel((x0 + dx, y0 + dy), color)
    return img


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (FRAME * 4, FRAME * 4), (0, 0, 0, 0))

    # Row 0: down (south)
    down_frames = [
        render_frame(TEMPLATE_DOWN_IDLE),
        render_frame(TEMPLATE_DOWN_WALK_L),
        render_frame(TEMPLATE_DOWN_IDLE),
        render_frame(TEMPLATE_DOWN_WALK_R),
    ]
    # Row 1: left
    left_frames = [
        render_frame(TEMPLATE_SIDE_IDLE),
        render_frame(TEMPLATE_SIDE_WALK),
        render_frame(TEMPLATE_SIDE_IDLE),
        render_frame(TEMPLATE_SIDE_WALK, mirror_x=False),
    ]
    # Row 2: right (mirrored side view)
    right_frames = [
        render_frame(TEMPLATE_SIDE_IDLE, mirror_x=True),
        render_frame(TEMPLATE_SIDE_WALK, mirror_x=True),
        render_frame(TEMPLATE_SIDE_IDLE, mirror_x=True),
        render_frame(TEMPLATE_SIDE_WALK, mirror_x=True),
    ]
    # Row 3: up (north)
    up_frames = [
        render_frame(TEMPLATE_UP_IDLE),
        render_frame(TEMPLATE_UP_WALK_L),
        render_frame(TEMPLATE_UP_IDLE),
        render_frame(TEMPLATE_UP_WALK_R),
    ]

    rows = [down_frames, left_frames, right_frames, up_frames]
    for r, frames in enumerate(rows):
        for c, frame in enumerate(frames):
            sheet.paste(frame, (c * FRAME, r * FRAME), frame)

    sheet.save(OUT)
    print(f"wrote {OUT} ({sheet.size[0]}x{sheet.size[1]})")


if __name__ == "__main__":
    main()
