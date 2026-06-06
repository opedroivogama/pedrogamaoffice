"""Extrai a janela v2 (transparência em magenta = #f902a8).

Estratégia: qualquer pixel "magenta-ish" (R alto, G muito baixo, B alto) vira
transparente. Pega tanto o fundo externo quanto o interior dos 4 painéis numa
única varredura.
"""
import shutil
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\Pedro\.claude\image-cache\ce5c3b25-1382-48c2-8d48-7c869c1e1f3b\9.png")
DST = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\window-frame.png")
BAK = DST.with_suffix(".png.bak2")


def is_magenta(r: int, g: int, b: int) -> bool:
    # Magenta de chroma key: R alto, B alto, G baixo
    return r >= 200 and b >= 130 and g <= 80


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
            if is_magenta(r, g, b):
                px[x, y] = (0, 0, 0, 0)
                cleared += 1
    print(f"magenta removido: {cleared}")

    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("imagem totalmente transparente?")
    pad = 2
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
