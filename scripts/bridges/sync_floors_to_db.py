#!/usr/bin/env python3
"""Sync floors.toml → DB building_config (MERGE-style, não destrutivo).

Lê `backend/floors.toml`, pega a `building_config` atual do DB via API, e faz
MERGE: andares definidos no TOML são adicionados ou substituídos, andares que
existem só no DB são preservados.

⚠️ Esse é o caminho recomendado quando você tem andares Claude Code já
configurados no DB via UI Settings e quer adicionar andares JP (Comercial,
Mídia Paga, etc.) por cima — sem perder o que já existia.

Uso:
  python scripts/bridges/sync_floors_to_db.py              # roda o merge
  python scripts/bridges/sync_floors_to_db.py --dry-run    # só mostra o diff
  python scripts/bridges/sync_floors_to_db.py --building "Jurídico Pro"  # override do nome
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import tomllib
from pathlib import Path
from typing import Any

import requests

# Console do Windows costuma vir em cp1252 — força UTF-8 pros emojis dos andares.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

API_BASE = "http://localhost:8000/api/v1"
PROJECT_ROOT = Path(__file__).parent.parent.parent
TOML_PATH = PROJECT_ROOT / "backend" / "floors.toml"

logger = logging.getLogger("sync_floors")


# ---------------------------------------------------------------------------
# Carga e normalização
# ---------------------------------------------------------------------------


def _toml_floor_to_camel(entry: dict[str, Any]) -> dict[str, Any]:
    """Converte um entry de [[floors]] do TOML pro formato camelCase do BuildingConfig.

    O loader oficial em `app.core.floor_config.load_building_config_from_toml`
    deriva o id como `name.lower().replace(" ", "")` — replicamos aqui pra
    manter o merge consistente.
    """
    name = str(entry["name"])
    floor_id = name.lower().replace(" ", "")
    rooms = [
        {"id": str(r), "repoName": str(r)} for r in entry.get("repos", [])
    ]
    return {
        "id": floor_id,
        "name": name,
        "floorNumber": int(entry["floor_number"]),
        "accent": str(entry.get("accent", "#6366f1")),
        "icon": str(entry.get("icon", "🏢")),
        "rooms": rooms,
    }


def load_toml_config(path: Path) -> dict[str, Any]:
    """Carrega o TOML e retorna o BuildingConfig em dict camelCase."""
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    floors = [_toml_floor_to_camel(f) for f in raw.get("floors", [])]
    return {
        "buildingName": str(raw.get("building_name", "Office")),
        "floors": floors,
    }


def fetch_db_config() -> dict[str, Any]:
    """Busca a building_config atual do DB via API."""
    try:
        r = requests.get(f"{API_BASE}/floors", timeout=5)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as exc:
        raise RuntimeError(
            f"Falha ao buscar config atual de {API_BASE}/floors: {exc}\n"
            "O backend tá rodando? (make dev-tmux)"
        ) from exc


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------


def merge_configs(
    db_config: dict[str, Any],
    toml_config: dict[str, Any],
    *,
    override_building_name: str | None = None,
) -> tuple[dict[str, Any], dict[str, list[str]]]:
    """Faz merge: TOML adiciona/substitui por id, DB-only é preservado.

    Returns:
        (merged_config, summary) onde summary tem chaves:
        added, updated, preserved — listas de nomes de andar.
    """
    db_floors: list[dict[str, Any]] = list(db_config.get("floors", []))
    toml_floors: list[dict[str, Any]] = list(toml_config.get("floors", []))

    db_by_id: dict[str, dict[str, Any]] = {str(f.get("id")): f for f in db_floors}
    toml_ids = {str(f.get("id")) for f in toml_floors}

    summary: dict[str, list[str]] = {"added": [], "updated": [], "preserved": []}
    merged_floors: list[dict[str, Any]] = []

    # 1. Andares do TOML (adicionados ou substituindo o existente)
    for tf in toml_floors:
        fid = str(tf.get("id"))
        if fid in db_by_id:
            summary["updated"].append(tf.get("name", fid))
        else:
            summary["added"].append(tf.get("name", fid))
        merged_floors.append(tf)

    # 2. Andares só no DB → preservar
    for df in db_floors:
        fid = str(df.get("id"))
        if fid not in toml_ids:
            summary["preserved"].append(df.get("name", fid))
            merged_floors.append(df)

    # Preserva o buildingName do DB por padrão (princípio aditivo: TOML adiciona
    # andares, não muda identidade do prédio). Pra forçar, usar --building.
    merged = {
        "buildingName": override_building_name
        or db_config.get("buildingName")
        or toml_config.get("buildingName", "Office"),
        "floors": merged_floors,
    }
    return merged, summary


# ---------------------------------------------------------------------------
# Push pro DB
# ---------------------------------------------------------------------------


def push_config(config: dict[str, Any]) -> None:
    """PUT /api/v1/preferences/building_config."""
    value_json = json.dumps(config, ensure_ascii=False)
    try:
        r = requests.put(
            f"{API_BASE}/preferences/building_config",
            json={"value": value_json},
            timeout=10,
        )
        r.raise_for_status()
    except requests.RequestException as exc:
        # Detalhe do erro (validation) costuma vir no body
        body = ""
        if hasattr(exc, "response") and exc.response is not None:
            body = f" body={exc.response.text!r}"
        raise RuntimeError(f"Falha ao salvar config: {exc}{body}") from exc


# ---------------------------------------------------------------------------
# Pretty-print
# ---------------------------------------------------------------------------


def _floor_label(f: dict[str, Any]) -> str:
    name = f.get("name", "?")
    fnum = f.get("floorNumber", "?")
    icon = f.get("icon", "")
    n_rooms = len(f.get("rooms", []))
    return f"  {icon} #{fnum} {name} ({n_rooms} salas)"


def print_diff(
    db_config: dict[str, Any],
    toml_config: dict[str, Any],
    merged: dict[str, Any],
    summary: dict[str, list[str]],
) -> None:
    """Imprime o diff resumido."""
    print(f"\n📦 Building atual (DB):  {db_config.get('buildingName', '?')}")
    for f in db_config.get("floors", []):
        print(_floor_label(f))
    if not db_config.get("floors"):
        print("  (vazio)")

    print(f"\n📄 floors.toml:          {toml_config.get('buildingName', '?')}")
    for f in toml_config.get("floors", []):
        print(_floor_label(f))

    print(f"\n🔀 Após merge:           {merged.get('buildingName')}")
    for f in merged.get("floors", []):
        print(_floor_label(f))

    print("\n📊 Resumo do merge:")
    if summary["added"]:
        print(f"  + adicionados: {', '.join(summary['added'])}")
    if summary["updated"]:
        print(f"  ~ atualizados: {', '.join(summary['updated'])}")
    if summary["preserved"]:
        print(f"  = preservados: {', '.join(summary['preserved'])}")
    if not any(summary.values()):
        print("  (nada a fazer)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Só mostra o diff, não persiste")
    parser.add_argument("--building", default=None, help="Override do buildingName")
    parser.add_argument("--toml", default=str(TOML_PATH), help="Path do floors.toml")
    parser.add_argument("--verbose", "-v", action="store_true", help="Log debug")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    toml_path = Path(args.toml)
    if not toml_path.exists():
        logger.error("floors.toml não encontrado em %s", toml_path)
        sys.exit(1)

    toml_config = load_toml_config(toml_path)

    try:
        db_config = fetch_db_config()
    except RuntimeError as exc:
        logger.error("%s", exc)
        sys.exit(2)

    merged, summary = merge_configs(
        db_config, toml_config, override_building_name=args.building
    )

    print_diff(db_config, toml_config, merged, summary)

    if args.dry_run:
        print("\n🔒 --dry-run: nada foi persistido.")
        return

    try:
        push_config(merged)
    except RuntimeError as exc:
        logger.error("%s", exc)
        sys.exit(3)

    print("\n✅ Config persistida em /api/v1/preferences/building_config")
    print("   Reload o frontend pra ver os andares novos.")


if __name__ == "__main__":
    main()
