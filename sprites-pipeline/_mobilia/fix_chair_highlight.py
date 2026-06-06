"""Remove o traço branco no topo das cadeiras (chair.png e chair-red.png).

A IA original baked highlights cinza-quase-branco no encosto. Estratégia:
para pixels neutros (max-min <= 30) com luma >= 130 NA REGIÃO DO TECIDO
(y < FABRIC_END_Y), substitui pelo tom de tecido vivo da cadeira (azul ou
vinho) preservando luminância relativa pra continuar lendo como highlight.
A região da base/rodízios (parte cinza metálica) é poupada.
"""
import shutil
from pathlib import Path
from PIL import Image

TARGETS = [
    # (caminho, cor base do tecido [R,G,B], y de corte do tecido)
    (Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\chair.png"),
     (60, 80, 150), 520),
    (Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\chair-red.png"),
     (120, 30, 38), 520),
]

BAK_SUFFIX = ".png.bak4"
NEUTRAL_LUMA_MIN = 130
NEUTRAL_CHROMA_MAX = 30
# Faixa de brightness do highlight (min..max no canal mais claro do pixel)
SRC_LUMA_REF = (130, 230)


def is_neutral_highlight(r: int, g: int, b: int) -> bool:
    if min(r, g, b) < NEUTRAL_LUMA_MIN:
        return False
    if (max(r, g, b) - min(r, g, b)) > NEUTRAL_CHROMA_MAX:
        return False
    return True


def main() -> None:
    for path, base_rgb, fabric_end_y in TARGETS:
        bak = path.with_suffix(BAK_SUFFIX)
        if not bak.exists():
            shutil.copy2(path, bak)
            print(f"backup: {bak.name}")

        img = Image.open(path).convert("RGBA")
        w, h = img.size
        px = img.load()

        cleared = 0
        for y in range(min(fabric_end_y, h)):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 200:
                    continue
                if not is_neutral_highlight(r, g, b):
                    continue
                # Preserva o brilho relativo: pixel mais claro -> mais
                # próximo de pure white -> highlight mais forte. Aqui
                # mapeamos para um fator 0..1 e aplicamos sobre base_rgb,
                # somando uma escolha "highlight" extra (tons mais claros
                # ficam mais próximos do branco do tecido).
                src_y = (r + g + b) / 3
                lo, hi = SRC_LUMA_REF
                t = max(0.0, min(1.0, (src_y - lo) / (hi - lo)))
                # Base fabric vira (1-t) e highlight do tecido vira t.
                # Highlight do tecido = base + 50 em cada canal (clipado).
                hi_rgb = tuple(min(255, c + 60) for c in base_rgb)
                nr = int(round(base_rgb[0] * (1 - t) + hi_rgb[0] * t))
                ng = int(round(base_rgb[1] * (1 - t) + hi_rgb[1] * t))
                nb = int(round(base_rgb[2] * (1 - t) + hi_rgb[2] * t))
                px[x, y] = (nr, ng, nb, a)
                cleared += 1

        img.save(path)
        print(f"{path.name}: {cleared} pixels remapeados")


if __name__ == "__main__":
    main()
