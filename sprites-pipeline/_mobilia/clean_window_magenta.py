"""Remove magenta residual nas bordas do window-frame.png.

A primeira passada (chroma key estrito R>=200 B>=130 G<=80) deixou pixels
de antialiasing com tonalidade rosa: G maior, R/B mais baixos. Critério
ampliado: pixel é "magenta-tinted" se R > G+30 E B > G+30 (cromaticidade
puxando pra pink/magenta). Funciona pra qualquer tom rosa, do puro #ff00ff
até misturas com o cinza da moldura.
"""
import shutil
from pathlib import Path
from PIL import Image

DST = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\window-frame.png")
BAK = DST.with_suffix(".png.bak3")


def is_pink_tinted(r: int, g: int, b: int) -> bool:
    return (r - g) > 30 and (b - g) > 30


def main() -> None:
    if not BAK.exists():
        shutil.copy2(DST, BAK)
        print(f"backup: {BAK}")

    img = Image.open(DST).convert("RGBA")
    w, h = img.size
    px = img.load()

    cleared = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if is_pink_tinted(r, g, b):
                px[x, y] = (0, 0, 0, 0)
                cleared += 1
    print(f"pixels rosa removidos: {cleared}")

    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("vazio?")
    pad = 1
    cropped = img.crop((
        max(0, bbox[0] - pad),
        max(0, bbox[1] - pad),
        min(w, bbox[2] + pad),
        min(h, bbox[3] + pad),
    ))
    print(f"bbox: {bbox}  size: {cropped.size}")
    cropped.save(DST)


if __name__ == "__main__":
    main()
