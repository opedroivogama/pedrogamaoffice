"""Detecta tom de pele na south.png e remapeia os pixels skin-like da
south-east.png pra match. Salva como south-east.fixed.png."""
from pathlib import Path
from PIL import Image
from collections import Counter

BK = Path(r"C:\Users\Pedro\Desktop\PEDRO_SAMURAI V2 BACKUP\rotations")
SOUTH = BK / "south.png"
SE = BK / "south-east.png"
OUT = BK / "south-east.fixed.png"


def is_skinlike(r: int, g: int, b: int, a: int) -> bool:
    """Heurística: warm olive, semi-bright, não preto, não branco, não cinza."""
    if a < 200:
        return False
    if not (r > g > b):
        return False
    if r - b < 25:
        return False  # gravata cinza tem diff baixo
    if r < 60:
        return False  # muito escuro (sombra)
    if r > 240 and g > 230:
        return False  # quase branco (camisa)
    total = r + g + b
    if total < 180:
        return False
    if total > 660:
        return False
    return True


def average_skin(im: Image.Image) -> tuple[int, int, int]:
    px = im.load()
    w, h = im.size
    samples = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_skinlike(r, g, b, a):
                samples.append((r, g, b))
    if not samples:
        raise SystemExit("Nenhum pixel skin-like encontrado")
    n = len(samples)
    return (
        sum(s[0] for s in samples) // n,
        sum(s[1] for s in samples) // n,
        sum(s[2] for s in samples) // n,
    )


def main():
    s_im = Image.open(SOUTH).convert("RGBA")
    se_im = Image.open(SE).convert("RGBA")

    s_avg = average_skin(s_im)
    se_avg = average_skin(se_im)
    print(f"south skin avg:      RGB={s_avg}")
    print(f"south-east skin avg: RGB={se_avg}")

    dr = s_avg[0] - se_avg[0]
    dg = s_avg[1] - se_avg[1]
    db = s_avg[2] - se_avg[2]
    print(f"shift to apply:      dR={dr} dG={dg} dB={db}")

    px = se_im.load()
    w, h = se_im.size
    changed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_skinlike(r, g, b, a):
                nr = max(0, min(255, r + dr))
                ng = max(0, min(255, g + dg))
                nb = max(0, min(255, b + db))
                px[x, y] = (nr, ng, nb, a)
                changed += 1
    se_im.save(OUT, "PNG")
    print(f"pixels recolored: {changed}")
    print(f"saved: {OUT}")


if __name__ == "__main__":
    main()
