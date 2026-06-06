"""Remove o background checker do novo sprite do filtro e recorta.

A imagem de origem tem o padrão xadrez de "transparência" baked in
(#fefefe + #eeeeee em alpha 255). Detectamos pixels de fundo (RGB todos
acima de 220 e quase neutros) e tornamos transparentes; depois cortamos
no bbox real e salvamos.
"""
import shutil
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\Pedro\.claude\image-cache\ce5c3b25-1382-48c2-8d48-7c869c1e1f3b\2.png")
DST = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\watercooler.png")
BAK = DST.with_suffix(".png.bak2")

BG_MIN_LUMA = 220       # pixel claro o suficiente pra ser fundo candidato
BG_CHROMA_TOL = 8       # tolerância pra considerar neutro (R≈G≈B)


def is_bg(r: int, g: int, b: int) -> bool:
    if r < BG_MIN_LUMA or g < BG_MIN_LUMA or b < BG_MIN_LUMA:
        return False
    return (max(r, g, b) - min(r, g, b)) <= BG_CHROMA_TOL


def main() -> None:
    if not BAK.exists() and DST.exists():
        shutil.copy2(DST, BAK)
        print(f"backup: {BAK}")

    img = Image.open(SRC).convert("RGBA")
    w, h = img.size
    px = img.load()

    cleared = 0
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if is_bg(r, g, b):
                px[x, y] = (0, 0, 0, 0)
                cleared += 1
    print(f"pixels removidos do fundo: {cleared}")

    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("imagem totalmente transparente após cleanup")
    pad = 4
    min_x = max(0, bbox[0] - pad)
    min_y = max(0, bbox[1] - pad)
    max_x = min(w, bbox[2] + pad)
    max_y = min(h, bbox[3] + pad)
    cropped = img.crop((min_x, min_y, max_x, max_y))
    print(f"bbox: {bbox}  cropped size: {cropped.size}  aspect w/h={cropped.size[0] / cropped.size[1]:.3f}")

    cropped.save(DST)
    print(f"salvo: {DST}")


if __name__ == "__main__":
    main()
