"""Apaga pixels claros residuais nas bordas dos sprites (cleanup conservador).

Para cada sprite alvo: qualquer pixel opaco com `min(R,G,B) >= LIGHT_THRESHOLD`
que tenha pelo menos um vizinho (8-conectado) totalmente transparente é
considerado halo/bg residual e zerado. Repete N vezes pra atacar pixels que
viram borda só depois da primeira passada. Pinta também versão DEBUG-* com
os pixels removidos em magenta pra inspeção.
"""
import shutil
from pathlib import Path
from PIL import Image

TARGETS = [
    (Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\watercooler.png"), 180, 2),
    (Path(r"C:\Users\Pedro\Desktop\escritorio online\frontend\public\sprites\coffee-machine.png"), 180, 2),
]

BAK_SUFFIX = ".png.bak3"
DEBUG_DIR = Path(r"C:\Users\Pedro\Desktop\escritorio online\sprites-pipeline\_mobilia")


def has_transparent_neighbor(px, x, y, w, h) -> bool:
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                return True
    return False


def trim_once(img: Image.Image, threshold: int) -> int:
    w, h = img.size
    px = img.load()
    to_clear = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 250:
                continue
            if min(r, g, b) < threshold:
                continue
            if has_transparent_neighbor(px, x, y, w, h):
                to_clear.append((x, y))
    for x, y in to_clear:
        px[x, y] = (0, 0, 0, 0)
    return len(to_clear)


def main() -> None:
    for path, threshold, passes in TARGETS:
        bak = path.with_suffix(BAK_SUFFIX)
        if not bak.exists():
            shutil.copy2(path, bak)

        img = Image.open(path).convert("RGBA")
        original = img.copy()

        total = 0
        for i in range(passes):
            n = trim_once(img, threshold)
            print(f"{path.name}: passada {i+1} -> {n} pixels apagados")
            total += n
            if n == 0:
                break

        # Re-crop bbox final
        bbox = img.getbbox()
        if bbox is None:
            print(f"{path.name}: vazio após trim — abortando")
            continue
        pad = 4
        cropped = img.crop((
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(img.size[0], bbox[2] + pad),
            min(img.size[1], bbox[3] + pad),
        ))
        cropped.save(path)
        print(f"{path.name}: total apagados={total}  size final={cropped.size}")

        # debug: marca em magenta os pixels removidos
        dbg = original.copy()
        dp = dbg.load()
        op = img.load()
        w, h = dbg.size
        for y in range(h):
            for x in range(w):
                if dp[x, y][3] > 0 and op[x, y][3] == 0:
                    dp[x, y] = (255, 0, 255, 255)
        dbg.save(DEBUG_DIR / f"DEBUG-{path.stem}-trimmed.png")


if __name__ == "__main__":
    main()
