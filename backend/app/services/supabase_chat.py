"""Cliente leve pro Supabase self-hosted — persistência do painel chat.

Mantemos a interface mínima: criar thread, upsert thread (touch updated_at),
inserir mensagem, listar threads, listar mensagens paginadas. Tudo via
PostgREST com `service_role` — só roda no backend.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import httpx

from app.config import get_settings


def _now_iso() -> str:
    """Timestamp ISO-8601 UTC — usado nos updated_at/last_message_at em vez do
    truque '\"now()\"' (PostgREST manda como string literal, casting depende
    do dialect e nem sempre rola)."""
    return datetime.now(UTC).isoformat()

logger = logging.getLogger(__name__)


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
# Threads
# ---------------------------------------------------------------------------


async def upsert_thread(
    thread_id: str,
    title: str | None = None,
    cwd: str | None = None,
) -> dict[str, Any] | None:
    """Cria thread se não existir, atualiza updated_at se existir.

    Idempotente — pode chamar todo turno sem medo. Title só é gravado na
    primeira criação (não sobrescreve título existente).
    """
    payload: dict[str, Any] = {"id": thread_id}
    if title:
        payload["title"] = title[:200]
    if cwd:
        payload["cwd"] = cwd

    headers = _headers()
    # on_conflict + Prefer=resolution=merge-duplicates faz UPDATE quando a PK
    # já existe — mas nesse caso só queremos preservar título antigo, não
    # sobrescrever. Estratégia: tentar INSERT; se conflito, fazer PATCH só do
    # updated_at via outra chamada.
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.post(
                _rest_url("chat_threads"),
                headers={**headers, "Prefer": "return=representation"},
                json=payload,
            )
            if r.status_code == 201:
                return r.json()[0] if isinstance(r.json(), list) else r.json()
            if r.status_code == 409:
                # Já existe — só touch o updated_at
                touch = await client.patch(
                    _rest_url(f"chat_threads?id=eq.{thread_id}"),
                    headers={**headers, "Prefer": "return=representation"},
                    json={"updated_at": _now_iso()},
                )
                if touch.is_success:
                    body = touch.json()
                    return body[0] if isinstance(body, list) and body else None
                logger.warning("touch thread %s falhou: %s", thread_id, touch.text)
                return None
            logger.warning("upsert_thread %s status=%s body=%s",
                           thread_id, r.status_code, r.text[:200])
            return None
        except httpx.HTTPError as exc:
            logger.warning("upsert_thread %s erro: %s", thread_id, exc)
            return None


async def list_threads(limit: int = 30) -> list[dict[str, Any]]:
    """Lista as threads mais recentes (ordenadas por updated_at DESC)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.get(
                _rest_url(
                    f"chat_threads?select=*&order=updated_at.desc&limit={limit}"
                ),
                headers=_headers(),
            )
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError as exc:
            logger.warning("list_threads erro: %s", exc)
            return []


async def get_thread(thread_id: str) -> dict[str, Any] | None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.get(
                _rest_url(f"chat_threads?id=eq.{thread_id}&select=*"),
                headers=_headers(),
            )
            r.raise_for_status()
            body = r.json()
            return body[0] if body else None
        except httpx.HTTPError as exc:
            logger.warning("get_thread %s erro: %s", thread_id, exc)
            return None


async def delete_thread(thread_id: str) -> bool:
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.delete(
                _rest_url(f"chat_threads?id=eq.{thread_id}"),
                headers=_headers(),
            )
            return r.is_success
        except httpx.HTTPError as exc:
            logger.warning("delete_thread %s erro: %s", thread_id, exc)
            return False


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------


async def insert_message(
    thread_id: str,
    role: str,
    text: str,
    tools: list[dict[str, Any]] | None = None,
    *,
    kind: str = "main",
) -> dict[str, Any] | None:
    """Insere uma mensagem e bumpa counters/last_message_at da thread.

    `kind` distingue turnos normais (`main`) de sidequests `/btw` — esses
    aparecem na mesma thread no painel mas com bolha de tom diferente e
    NÃO escrevem no JSONL da sessão Claude Code principal.
    """
    payload = {
        "thread_id": thread_id,
        "role": role,
        "text": text,
        "tools": tools,
        "kind": kind,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.post(
                _rest_url("chat_messages"),
                headers={**_headers(), "Prefer": "return=representation"},
                json=payload,
            )
            if not r.is_success:
                logger.warning(
                    "insert_message thread=%s role=%s status=%s body=%s",
                    thread_id, role, r.status_code, r.text[:200],
                )
                return None
            body = r.json()
            # Trigger Postgres `chat_messages_bump_thread` cuida de bumpar
            # message_count, last_message_at e updated_at server-side — não
            # precisamos patchar daqui (evita race + clock skew local-VPS).
            return body[0] if isinstance(body, list) and body else body
        except httpx.HTTPError as exc:
            logger.warning("insert_message %s erro: %s", thread_id, exc)
            return None


async def list_messages(
    thread_id: str,
    limit: int = 20,
    before: str | None = None,
) -> list[dict[str, Any]]:
    """Lista mensagens DESC (mais recentes primeiro). `before` paginates older.

    Frontend tipicamente carrega os últimos N (sem before), mostra invertido,
    e ao pedir "carregar anteriores" passa o created_at da mensagem mais antiga
    visível como `before`.

    Retorna ordenado DESC (mais recente primeiro). Cliente inverte pra exibir.
    """
    parts = [
        f"thread_id=eq.{thread_id}",
        "select=*",
        "order=created_at.desc",
        f"limit={limit}",
    ]
    if before:
        parts.append(f"created_at=lt.{before}")
    url = _rest_url("chat_messages?" + "&".join(parts))

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.get(url, headers=_headers())
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError as exc:
            logger.warning("list_messages %s erro: %s", thread_id, exc)
            return []


def derive_title(prompt: str) -> str:
    """Gera um título amigável a partir do 1º prompt do usuário."""
    text = " ".join(prompt.split())
    if len(text) <= 80:
        return text
    return text[:77] + "…"
