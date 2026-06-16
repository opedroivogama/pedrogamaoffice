"""Gera um PDF preview marcando ONDE as assinaturas vão cair antes de disparar pra Autentique.

Pega o PDF original, sobrepõe retângulos vermelhos translúcidos nas posições calculadas
da página 11 e salva como `_preview_assinaturas.pdf` no Desktop.
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color
from reportlab.pdfgen import canvas

PDF_ORIGINAL = Path(
    r"C:\Users\Pedro\Desktop\JURIDICO PRO - SECOND BRAIN\COMERCIAL\CONTRATOS\Dr Daniel Godinho\Contrato_Dr_Daniel_Godinho_RASCUNHO_V6.pdf"
)
PDF_OUT = Path(r"C:\Users\Pedro\Desktop\_preview_assinaturas_Dr_Daniel.pdf")

# Coordenadas extraídas via pdfplumber — origem topo-esquerda em pontos
# Página 11, A4 (595.28 × 841.89 pt)
PAGE_W = 595.2756
PAGE_H = 841.8898

# Linhas de assinatura (x0, x1, y do topo)
LINHAS = {
    "CONTRATADA":   {"x0": 77.6,  "x1": 282.4, "y_top": 484.7, "signer": "pedro@juridicopro.com",       "action": "SIGN"},
    "TESTEMUNHA 1": {"x0": 312.9, "x1": 517.7, "y_top": 484.7, "signer": "pedroivogamaoficial@gmail.com", "action": "WITNESS"},
    "CONTRATANTE":  {"x0": 77.6,  "x1": 282.4, "y_top": 604.7, "signer": "opedroivogama@gmail.com",     "action": "SIGN"},
    "TESTEMUNHA 2": {"x0": 312.9, "x1": 517.7, "y_top": 604.7, "signer": "araquelcarvalhosa@gmail.com", "action": "WITNESS"},
}

# Tamanho do retângulo de assinatura (acima da linha)
SIG_HEIGHT = 35  # pontos


def gerar_overlay() -> BytesIO:
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(PAGE_W, PAGE_H))

    # reportlab usa origem bottom-left; converter y_top → y_bottom
    for label, info in LINHAS.items():
        x = info["x0"]
        width = info["x1"] - info["x0"]
        # A linha está em y_top (do topo); o quadro de assinatura fica ACIMA dela
        # y_top_rect = y_top - SIG_HEIGHT
        y_top_rect = info["y_top"] - SIG_HEIGHT
        y_bottom_rect = info["y_top"]
        # Converter pra reportlab (origem bottom-left)
        rb_y = PAGE_H - y_bottom_rect

        # Retângulo translúcido vermelho
        c.setFillColor(Color(1, 0, 0, alpha=0.25))
        c.setStrokeColor(Color(1, 0, 0, alpha=0.9))
        c.setLineWidth(1.5)
        c.rect(x, rb_y, width, SIG_HEIGHT, fill=1, stroke=1)

        # Label dentro
        c.setFillColor(Color(0.6, 0, 0, alpha=1))
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x + 4, rb_y + SIG_HEIGHT - 11, f"{label}")
        c.setFont("Helvetica", 7)
        c.drawString(x + 4, rb_y + SIG_HEIGHT - 21, info["signer"])
        c.drawString(x + 4, rb_y + SIG_HEIGHT - 30, f"action={info['action']}")

    # Header explicativo no topo da página
    c.setFillColor(Color(0, 0, 0, alpha=1))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, PAGE_H - 30, "PREVIEW — onde cada assinatura vai cair via API Autentique")
    c.setFont("Helvetica", 8)
    c.drawString(40, PAGE_H - 45, "Retangulos vermelhos = posicao calculada (element=SIGNATURE, z=pagina 11)")
    c.drawString(40, PAGE_H - 56, "Este preview NAO foi enviado pra Autentique. Confirme as posicoes antes de disparar.")

    c.save()
    buf.seek(0)
    return buf


def main():
    print(f"Lendo original: {PDF_ORIGINAL.name}")
    if not PDF_ORIGINAL.exists():
        raise SystemExit(f"PDF nao encontrado: {PDF_ORIGINAL}")

    reader = PdfReader(str(PDF_ORIGINAL))
    overlay_buf = gerar_overlay()
    overlay_reader = PdfReader(overlay_buf)
    overlay_page = overlay_reader.pages[0]

    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        if i == len(reader.pages) - 1:  # última página
            page.merge_page(overlay_page)
        writer.add_page(page)

    with open(PDF_OUT, "wb") as f:
        writer.write(f)

    print(f"OK -> {PDF_OUT}")
    print(f"     ({PDF_OUT.stat().st_size:,} bytes)")
    print()
    print("Posicoes marcadas:")
    for label, info in LINHAS.items():
        x_pct = (info["x0"] + (info["x1"] - info["x0"]) / 2) / PAGE_W * 100
        y_pct = (info["y_top"] - SIG_HEIGHT / 2) / PAGE_H * 100
        print(f"  {label:13} -> x={x_pct:5.2f}%  y={y_pct:5.2f}%  signer={info['signer']}")


if __name__ == "__main__":
    main()
