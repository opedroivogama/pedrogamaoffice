"""Teste end-to-end da API Autentique.

1. Gera um PDF mínimo de teste.
2. Envia mutation `createDocument` com Pedro como único signatário.
3. Imprime o ID e link público pra acompanhar a assinatura.
4. (Opcional) Consulta status passando --doc-id <ID>.

Uso:
    python test_autentique.py              # cria documento novo
    python test_autentique.py --doc-id ABC # consulta status
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from io import BytesIO
from pathlib import Path

import requests
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

API_URL = "https://api.autentique.com.br/v2/graphql"
API_KEY = "8093f6de5db5594d4afed4f3063089ef99a15205a586316e56ca8839546a2a9d"

PEDRO_EMAIL = "opedroivogama@gmail.com"
PEDRO_NAME = "Pedro Ivo De Oliveira Gama"

# Cenário "full" — simulação de contrato JP com nova sociedade
SIGNERS_FULL = [
    {
        "email": "gabriel@juridicopro.com",
        "action": "SIGN",
        "name": "Gabriel (Juridico Pro - CONTRATADA)",
    },
    {
        "email": "opedroivogama@gmail.com",
        "action": "SIGN",
        "name": "Pedro (simulando CONTRATANTE - cliente)",
    },
    {
        "email": "pedro@juridicopro.com",
        "action": "SIGN_AS_A_WITNESS",
        "name": "Pedro Ivo (TESTEMUNHA 1)",
    },
    {
        "email": "araquelcarvalhosa@gmail.com",
        "action": "SIGN_AS_A_WITNESS",
        "name": "Raquel Carvalho (TESTEMUNHA 2)",
    },
]

# Cenário "dr-daniel" — contrato real do Dr Daniel Godinho com positions calculadas
# (sem Gabriel - pedro@juridicopro.com substitui como CONTRATADA pro teste)
PDF_DR_DANIEL = Path(
    r"C:\Users\Pedro\Desktop\JURIDICO PRO - SECOND BRAIN\COMERCIAL\CONTRATOS\Dr Daniel Godinho\Contrato_Dr_Daniel_Godinho_RASCUNHO_V6.pdf"
)
SIGNERS_DR_DANIEL = [
    {
        "email": "pedro@juridicopro.com",
        "action": "SIGN",
        "name": "Pedro Ivo (CONTRATADA - teste)",
        "positions": [{"x": "13.04", "y": "53.42", "z": 11, "element": "SIGNATURE"}],
    },
    {
        "email": "opedroivogama@gmail.com",
        "action": "SIGN",
        "name": "Pedro (CONTRATANTE - cliente simulado)",
        "positions": [{"x": "13.04", "y": "67.67", "z": 11, "element": "SIGNATURE"}],
    },
    {
        "email": "pedroivogamaoficial@gmail.com",
        "action": "SIGN_AS_A_WITNESS",
        "name": "Pedro Ivo Oficial (TESTEMUNHA 1)",
        "positions": [{"x": "52.56", "y": "53.42", "z": 11, "element": "SIGNATURE"}],
    },
    {
        "email": "araquelcarvalhosa@gmail.com",
        "action": "SIGN_AS_A_WITNESS",
        "name": "Raquel Carvalho (TESTEMUNHA 2)",
        "positions": [{"x": "52.56", "y": "67.67", "z": 11, "element": "SIGNATURE"}],
    },
]


def gerar_pdf_teste() -> Path:
    """Gera um PDF mínimo de 1 página com texto de teste."""
    out = Path(__file__).parent / "_autentique_teste.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(80, 760, "Teste de Integracao - Autentique API")
    c.setFont("Helvetica", 11)
    c.drawString(80, 720, "Documento gerado pelo teste end-to-end da integracao Autentique <> escritorio-online.")
    c.drawString(80, 700, "Se voce esta vendo isso na sua caixa de entrada e a Autentique te pediu pra assinar,")
    c.drawString(80, 680, "o fluxo Claudius -> contrato-generator -> Autentique esta funcionando.")
    c.drawString(80, 640, "Acoes possiveis:")
    c.drawString(100, 620, "- Clicar em Assinar -> validar fluxo completo")
    c.drawString(100, 600, "- Recusar -> validar webhook REFUSED")
    c.drawString(100, 580, "- Ignorar -> validar resend posterior")
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(80, 80, "Documento de teste - sem valor juridico. Apenas validacao de API.")
    c.showPage()
    c.save()
    return out


def criar_documento(pdf_path: Path, signers: list[dict] | None = None, doc_name: str = "Teste API Autentique - escritorio-online") -> dict:
    """Mutation createDocument via multipart spec."""
    mutation = """
    mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
      createDocument(document: $document, signers: $signers, file: $file) {
        id
        name
        refusable
        sortable
        created_at
        signatures {
          public_id
          name
          email
          action { name }
          link { short_link }
        }
      }
    }
    """
    if signers is None:
        signers = [{"email": PEDRO_EMAIL, "action": "SIGN", "name": PEDRO_NAME}]
    operations = {
        "query": mutation,
        "variables": {
            "document": {
                "name": doc_name,
                "message": "Documento de teste da integracao. Pode assinar ou recusar - sem impacto real.",
            },
            "signers": signers,
            "file": None,
        },
    }
    map_ = {"0": ["variables.file"]}

    with open(pdf_path, "rb") as f:
        files = {
            "operations": (None, json.dumps(operations), "application/json"),
            "map": (None, json.dumps(map_), "application/json"),
            "0": (pdf_path.name, f, "application/pdf"),
        }
        headers = {"Authorization": f"Bearer {API_KEY}"}
        resp = requests.post(API_URL, headers=headers, files=files, timeout=60)

    try:
        return resp.json()
    except Exception:
        return {"http_status": resp.status_code, "body": resp.text}


def consultar_status(doc_id: str) -> dict:
    query = """
    query DocumentQuery($id: UUID!) {
      document(id: $id) {
        id
        name
        created_at
        signed_count
        refusable
        signatures {
          public_id
          name
          email
          signed { created_at }
          rejected { created_at }
          viewed { created_at }
          link { short_link }
        }
        files { signed pades original }
      }
    }
    """
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"query": query, "variables": {"id": doc_id}}
    resp = requests.post(API_URL, headers=headers, json=payload, timeout=30)
    return resp.json()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--doc-id", help="Se passado, consulta status em vez de criar")
    parser.add_argument(
        "--scenario",
        choices=["simple", "full", "dr-daniel"],
        default="simple",
        help="simple = só Pedro; full = 4 signers PDF placeholder; dr-daniel = contrato real + positions",
    )
    args = parser.parse_args()

    if args.doc_id:
        print(f"Consultando status do documento {args.doc_id}...")
        result = consultar_status(args.doc_id)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0

    if args.scenario == "dr-daniel":
        print("[1/3] Usando PDF real do Dr Daniel...")
        pdf = PDF_DR_DANIEL
        if not pdf.exists():
            print(f"      [X] PDF nao encontrado: {pdf}")
            return 1
        print(f"      OK -> {pdf.name} ({pdf.stat().st_size:,} bytes)")
        signers = SIGNERS_DR_DANIEL
        doc_name = "[TESTE INTEGRACAO API - IGNORAR] Contrato Dr Daniel Godinho RASCUNHO V6"
    else:
        print("[1/3] Gerando PDF de teste...")
        pdf = gerar_pdf_teste()
        print(f"      OK -> {pdf} ({pdf.stat().st_size} bytes)")
        if args.scenario == "full":
            signers = SIGNERS_FULL
            doc_name = "Teste FULL - Contrato JP nova sociedade (Gabriel CONTRATADA)"
        else:
            signers = None
            doc_name = "Teste API Autentique - escritorio-online"

    print(f"[2/3] Criando documento na Autentique...")
    print(f"      Cenario: {args.scenario} ({len(signers or [{}])} signers)")
    for s in (signers or [{"action": "SIGN", "email": PEDRO_EMAIL, "name": PEDRO_NAME}]):
        pos = s.get("positions")
        pos_str = f" pos={pos[0]['x']}%,{pos[0]['y']}% pg{pos[0]['z']}" if pos else ""
        print(f"        - {s['action']:22} {s['email']:40} {s.get('name', ''):45}{pos_str}")

    result = criar_documento(pdf, signers=signers, doc_name=doc_name)
    print(json.dumps(result, indent=2, ensure_ascii=False))

    if "errors" in result:
        print("\n[X] Erros retornados pela API.")
        return 1

    data = result.get("data", {}).get("createDocument", {})
    doc_id = data.get("id")
    print(f"\n[3/3] OK! Documento criado: {doc_id}")
    sigs = data.get("signatures", [])
    if sigs:
        link = sigs[0].get("link", {}).get("short_link") if isinstance(sigs[0].get("link"), dict) else None
        print(f"      Link pra Pedro assinar: {link}")
    print(f"\n      Pra consultar status depois:")
    print(f"      python {Path(__file__).name} --doc-id {doc_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
