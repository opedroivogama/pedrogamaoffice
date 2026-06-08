"""Aplica tint cobre em todas as PNGs do AI_SILVER e escreve em AI_COPPER.

Estratégia: converte cada pixel não-transparente pra luminância (L) e usa
``ImageOps.colorize`` com gradiente cobre — preto vira sombra cobre escura,
branco vira highlight cobre claro. Preserva o canal alpha.

Cor base: #B87333 (cobre puro). Gradiente:
  black=#1a0e04 (sombras profundas)
  white=#e9b870 (highlights amarelados)

Esse contraste deixa o sprite reconhecível como cobre mesmo em escala
pequena, igual o silver é reconhecível como prata.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps

# Caminhos absolutos no projeto
PROJECT_ROOT = Path(__file__).resolve().parents[2]
SILVER_ROOT = PROJECT_ROOT / "frontend" / "public" / "sprites" / "characters" / "AI_SILVER"
COPPER_ROOT = PROJECT_ROOT / "frontend" / "public" / "sprites" / "characters" / "AI_COPPER"

BLACK = "#1a0e04"  # sombra cobre profunda
WHITE = "#e9b870"  # highlight cobre claro


def tint_copper(src: Path, dst: Path) -> None:
    """Lê uma PNG do silver, aplica tint cobre, salva em dst."""
    img = Image.open(src).convert("RGBA")
    r, g, b, a = img.split()
    # Luminância via canal médio dos RGBs
    gray = Image.merge("RGB", (r, g, b)).convert("L")
    colored = ImageOps.colorize(gray, black=BLACK, white=WHITE)
    r2, g2, b2 = colored.split()
    result = Image.merge("RGBA", (r2, g2, b2, a))
    dst.parent.mkdir(parents=True, exist_ok=True)
    result.save(dst, "PNG")


def main() -> int:
    if not SILVER_ROOT.is_dir():
        print(f"ERR: AI_SILVER não encontrado em {SILVER_ROOT}", file=sys.stderr)
        return 1

    # Limpa AI_COPPER inteiro pra não deixar resíduos
    if COPPER_ROOT.exists():
        shutil.rmtree(COPPER_ROOT)

    pngs = list(SILVER_ROOT.rglob("*.png"))
    if not pngs:
        print("ERR: nenhuma PNG no AI_SILVER", file=sys.stderr)
        return 1

    print(f"Processando {len(pngs)} sprites do AI_SILVER -> AI_COPPER...")
    for src in pngs:
        rel = src.relative_to(SILVER_ROOT)
        dst = COPPER_ROOT / rel
        tint_copper(src, dst)
        print(f"  {rel}")

    print(f"\nOK — {len(pngs)} sprites cobre em {COPPER_ROOT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
