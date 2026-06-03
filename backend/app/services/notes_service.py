"""Notes service — CRUD da tabela `notes` via PostgREST + mirror local.

Padrão idêntico ao supabase_chat.py: httpx async com service_role key, REST
do PostgREST sob `/rest/v1/notes`. Toda operação de escrita (create/update/
delete) regenera `notas.md` na raiz do projeto a partir do estado atual da
tabela — o arquivo local é um espelho read-only do banco.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# backend/app/services/notes_service.py → projeto root = parents[3]
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_LOCAL_MD = _PROJECT_ROOT / "notas.md"


def _headers() -> dict[str, str]:
    s = get_settings()
    return {
        "apikey": s.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {s.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def _rest_url(path: str) -> str:
    s = get_settings()
    return f"{s.SUPABASE_URL.rstrip('/')}/rest/v1/{path.lstrip('/')}"


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


async def list_notes() -> list[dict[str, Any]]:
    """Lista todas as notas, mais recentemente editadas primeiro."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.get(
                _rest_url("notes?select=*&order=updated_at.desc"),
                headers=_headers(),
            )
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError as exc:
            logger.warning("list_notes erro: %s", exc)
            return []


async def create_note(
    title: str = "Sem título",
    body: str = "",
) -> dict[str, Any] | None:
    """Cria uma nota e regenera o mirror local."""
    payload = {"title": (title or "Sem título")[:200], "body": body or ""}

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.post(
                _rest_url("notes"),
                headers={**_headers(), "Prefer": "return=representation"},
                json=payload,
            )
            if not r.is_success:
                logger.warning(
                    "create_note status=%s body=%s",
                    r.status_code, r.text[:200],
                )
                return None
            data = r.json()
            note = data[0] if isinstance(data, list) and data else data
        except httpx.HTTPError as exc:
            logger.warning("create_note erro: %s", exc)
            return None

    await _sync_local_md()
    return note


async def update_note(
    note_id: str,
    title: str | None = None,
    body: str | None = None,
) -> dict[str, Any] | None:
    """Atualiza title e/ou body. `updated_at` é atualizado pelo trigger."""
    payload: dict[str, Any] = {}
    if title is not None:
        payload["title"] = (title or "Sem título")[:200]
    if body is not None:
        payload["body"] = body
    if not payload:
        return None

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.patch(
                _rest_url(f"notes?id=eq.{note_id}"),
                headers={**_headers(), "Prefer": "return=representation"},
                json=payload,
            )
            if not r.is_success:
                logger.warning(
                    "update_note %s status=%s body=%s",
                    note_id, r.status_code, r.text[:200],
                )
                return None
            data = r.json()
            note = data[0] if isinstance(data, list) and data else None
        except httpx.HTTPError as exc:
            logger.warning("update_note %s erro: %s", note_id, exc)
            return None

    await _sync_local_md()
    return note


async def delete_note(note_id: str) -> bool:
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.delete(
                _rest_url(f"notes?id=eq.{note_id}"),
                headers=_headers(),
            )
            ok = r.is_success
        except httpx.HTTPError as exc:
            logger.warning("delete_note %s erro: %s", note_id, exc)
            return False

    if ok:
        await _sync_local_md()
    return ok


# ---------------------------------------------------------------------------
# Mirror local (./notas.md)
# ---------------------------------------------------------------------------


async def _sync_local_md() -> None:
    """Regenera `./notas.md` a partir do estado atual da tabela.

    Formato: cabeçalho + uma seção por nota com frontmatter (id, title,
    timestamps) seguida do body markdown. Notas em ordem cronológica de
    criação pra leitura linear funcionar.
    """
    notes = await list_notes()
    notes_sorted = sorted(notes, key=lambda n: n.get("created_at") or "")

    lines: list[str] = [
        "# Notas Jurídico Pro",
        "",
        "<!-- Gerado automaticamente pelo painel. Editar à mão é sobrescrito no próximo save. -->",
        "",
    ]
    for n in notes_sorted:
        lines.append("---")
        lines.append(f"id: {n.get('id', '')}")
        lines.append(f"title: {n.get('title', '')}")
        lines.append(f"created_at: {n.get('created_at', '')}")
        lines.append(f"updated_at: {n.get('updated_at', '')}")
        lines.append("---")
        lines.append("")
        lines.append((n.get("body") or "").rstrip())
        lines.append("")

    try:
        _LOCAL_MD.write_text("\n".join(lines), encoding="utf-8")
    except OSError as exc:
        logger.warning("_sync_local_md write erro: %s", exc)
