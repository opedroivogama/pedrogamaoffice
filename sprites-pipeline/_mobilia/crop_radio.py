"""Substitui o sprite do radio: remove background checker + crop + trim halo."""
import shutil
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\Pedro\.claude\image-cache\ce5c3b25-1382-48c2-8d48-7c869c1e1f3b\5.png")
DST = Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\radio.png")
BAK = DST.with_suffix(".png.bak2")

BG_MIN_LUMA = 220
BG_CHROMA_TOL = 8
HALO_THRESHOLD = 180
HALO_PASSES = 2


def is_bg(r: int, g: int, b: int) -> bool:
    if r < BG_MIN_LUMA or g < BG_MIN_LUMA or b < BG_MIN_LUMA:
        return False
    return (max(r, g, b) - min(r, g, b)) <= BG_CHROMA_TOL


def has_transparent_neighbor(px, x, y, w, h) -> bool:
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                return True
    return False


def main() -> None:
    if not BAK.exists() and DST.exists():
        shutil.copy2(DST, BAK)
        print(f"backup: {BAK}")

    img = Image.open(SRC).convert("RGBA")
    w, h = img.size
    px = img.load()

    # 1) Tira o checker do fundo
    cleared = 0
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if is_bg(r, g, b):
                px[x, y] = (0, 0, 0, 0)
                cleared += 1
    print(f"bg removido: {cleared} pixels")

    # 2) Trim halo de pixels claros nas bordas
    for i in range(HALO_PASSES):
        to_clear = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 250:
                    continue
                if min(r, g, b) < HALO_THRESHOLD:
                    continue
                if has_transparent_neighbor(px, x, y, w, h):
                    to_clear.append((x, y))
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)
        print(f"halo passada {i+1}: {len(to_clear)} pixels")
        if not to_clear:
            break

    # 3) Crop final
    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("imagem vazia após cleanup")
    pad = 4
    cropped = img.crop((
        max(0, bbox[0] - pad),
        max(0, bbox[1] - pad),
        min(w, bbox[2] + pad),
        min(h, bbox[3] + pad),
    ))
    print(f"bbox: {bbox}  size final: {cropped.size}  aspect w/h={cropped.size[0] / cropped.size[1]:.3f}")
    cropped.save(DST)
    print(f"salvo: {DST}")


if __name__ == "__main__":
    main()
