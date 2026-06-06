"""Recolora contorno azul da chair-red.png para vinho escuro.

Mantém luminosidade proporcional do pixel azul original (ramp 0..1)
mapeada num gradiente vinho profundo: preto puro -> #3c080c.
"""
import shutil
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\chair-red.png")
BAK = SRC.with_suffix(".png.bak2")
PREVIEW = Path(r"C:\Users\Pedro\Desktop\escritorio online\sprites-pipeline\_mobilia\chair-red-recolored.png")

# Vinho mais escuro que o tom dominante da cadeira (#581218) — fica visível
# como contorno mas sem o frio do azul.
TARGET_R, TARGET_G, TARGET_B = 0x3c, 0x08, 0x0c

# Faixa de brilho do azul original (max canal ~50). Normalizamos pra esse pico
# de modo que o pixel mais claro do contorno azul vire ~#3c080c e os mais
# escuros virem quase preto, preservando o anti-alias.
BLUE_BRIGHT_PEAK = 50.0


def is_bluish(r: int, g: int, b: int) -> bool:
    # Pixel azulado: B domina e há separação clara dos outros canais
    # (>= 2 evita falsos positivos em quase-preto puro).
    return b > r + 2 and b > g + 2


def main() -> None:
    if not BAK.exists():
        shutil.copy2(SRC, BAK)
        print(f"backup: {BAK.name}")

    img = Image.open(SRC).convert("RGBA")
    w, h = img.size
    px = img.load()

    changed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            if not is_bluish(r, g, b):
                continue
            # Brilho relativo do pixel azul (0..1).
            f = min(1.0, max(r, g, b) / BLUE_BRIGHT_PEAK)
            nr = int(round(TARGET_R * f))
            ng = int(round(TARGET_G * f))
            nb = int(round(TARGET_B * f))
            px[x, y] = (nr, ng, nb, a)
            changed += 1

    img.save(PREVIEW)
    img.save(SRC)
    print(f"recolored {changed} pixels")
    print(f"saved: {SRC}")
    print(f"preview: {PREVIEW}")


if __name__ == "__main__":
    main()
