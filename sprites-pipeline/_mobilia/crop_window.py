"""Extrai a moldura+grades da janela nova como sprite com painéis transparentes.

A imagem de origem tem fundo preto puro (mesmo do interior dos 4 painéis).
A moldura/grade é cinza-azulado escuro (~RGB 30-55). Estratégia: qualquer
pixel com luma <= LUMA_THRESHOLD vira transparente. O resto (a estrutura
da moldura) fica preservado. Resultado: PNG com 4 painéis transparentes
prontos pra deixar passar o céu procedural por trás.
"""
import shutil
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\Pedro\.claude\image-cache\ce5c3b25-1382-48c2-8d48-7c869c1e1f3b\7.png")
DST = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\window-frame.png")
BAK = DST.with_suffix(".png.bak")

# Limiar de luminância. Pixels com max(R,G,B) <= LUMA_THRESHOLD viram
# transparentes. Olhei a imagem: o preto puro do fundo é 0-3; a moldura
# mais escura é ~25-30. 10 é uma margem segura.
LUMA_THRESHOLD = 10


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
            if max(r, g, b) <= LUMA_THRESHOLD:
                px[x, y] = (0, 0, 0, 0)
                cleared += 1
    print(f"pixels removidos (preto): {cleared}")

    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("imagem totalmente transparente?")
    pad = 4
    cropped = img.crop((
        max(0, bbox[0] - pad),
        max(0, bbox[1] - pad),
        min(w, bbox[2] + pad),
        min(h, bbox[3] + pad),
    ))
    print(f"bbox: {bbox}  size: {cropped.size}  aspect w/h={cropped.size[0] / cropped.size[1]:.3f}")
    cropped.save(DST)
    print(f"salvo: {DST}")


if __name__ == "__main__":
    main()
