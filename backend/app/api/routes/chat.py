"""Chat endpoint — streama `claude -p` em tempo real pra UI via SSE.

Cada POST /api/v1/chat/stream dispara um `claude --print --output-format
stream-json --include-partial-messages` num subprocesso. A stdout do CLI vem
em NDJSON e é redespachada como eventos SSE (`data: {...}\\n\\n`) pro browser.

Multi-turno funciona via `session_id`: o cliente gera um UUID v4 na primeira
mensagem (backend usa `--session-id` pra criar), e nas próximas envia o mesmo
id (backend usa `--resume`). O backend ecoa o id no primeiro evento `meta`
pra evitar que o cliente precise parsear o JSON do CLI pra capturá-lo.

Notas de design:
- Usamos `subprocess.Popen` síncrono lido por threads em vez de
  `asyncio.create_subprocess_exec`, porque o último falha com
  `NotImplementedError` em algumas configs de event loop Windows
  (ver [[escritorio-online-windows-gotchas]] #2).
- Cancelamento do client (fechar SSE) → termina o subprocess no `finally`.
- O CLI escreve em UTF-8; força `encoding="utf-8"` pra evitar mojibake do
  cp1252 no Windows.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import subprocess
import sys
import threading
import uuid
from pathlib import Path
from typing import IO

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services import supabase_chat

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


# ---------------------------------------------------------------------------
# Modelo
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=200_000)
    # UUID da sessão Claude Code. Cliente gera UUID na primeira mensagem; o
    # backend cria com --session-id. Nas próximas, manda o mesmo id e o
    # backend usa --resume.
    session_id: str | None = None
    # cwd opcional — onde o claude vai rodar. Default = raiz do projeto
    # (escritorio online). Permite o usuário "trocar de contexto" no futuro.
    cwd: str | None = None
    # Se True, força criação (--session-id). Se False/None, e session_id está
    # setado, usa --resume. Útil pra "reiniciar conversa" reusando o mesmo id.
    is_new: bool = False
    # ID do modelo (ex: "claude-opus-4-7"). Vem do dropdown ModelSelect no
    # header do frontend. Whitelisted em `_ALLOWED_MODELS` antes de virar
    # `--model` no CLI. None = deixa o Claude Code usar o default dele.
    model: str | None = None


# Whitelist dos IDs aceitos pra --model. Tem que bater com o que o frontend
# expõe (`CLAUDE_MODEL_OPTIONS` em preferencesStore.ts). Qualquer string fora
# disso é silenciosamente ignorada — o CLI usa o default.
_ALLOWED_MODELS: frozenset[str] = frozenset(
    {
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
    }
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


# Raiz do repositório — usada como cwd default. main.py fica em
# backend/app/main.py → parents[4] = raiz do projeto.
_PROJECT_ROOT = Path(__file__).resolve().parents[4]


def _resolve_cwd(requested: str | None) -> str:
    if requested:
        p = Path(requested)
        if p.is_dir():
            return str(p)
        logger.warning("cwd inválido '%s' — usando raiz do projeto", requested)
    return str(_PROJECT_ROOT)


def _claude_executable() -> str:
    return shutil.which("claude") or "claude"


def _build_command(
    prompt: str,
    session_id: str,
    is_new: bool,
    model: str | None = None,
) -> list[str]:
    cmd = [
        _claude_executable(),
        "--print",
        prompt,
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",  # stream-json + print exige --verbose nas versões recentes
    ]
    if model and model in _ALLOWED_MODELS:
        cmd.extend(["--model", model])
    elif model:
        logger.warning("ignoring unknown model id from client: %s", model)
    if is_new:
        cmd.extend(["--session-id", session_id])
    else:
        cmd.extend(["--resume", session_id])
    return cmd


def _sse(payload: dict) -> str:
    """Serializa um dict como evento SSE."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _accumulate_assistant_turn(
    obj: dict,
    text_parts: list[str],
    tools: list[dict],
) -> None:
    """Extrai texto e tool_use do stream-json pra persistir uma única msg
    consolidada no fim do turno.

    Prioriza `assistant.message.content` (versão final completa) sobre os
    deltas, mas faz fallback pros `text_delta` se o final não chegar
    (cancelamento mid-stream).
    """
    t = obj.get("type")
    if t == "assistant":
        msg = obj.get("message") or {}
        content = msg.get("content") or []
        # Substitui acumulado pelo texto consolidado da turn final
        final_text = "".join(
            b.get("text", "") for b in content if b.get("type") == "text"
        )
        if final_text:
            text_parts.clear()
            text_parts.append(final_text)
        for b in content:
            if b.get("type") == "tool_use":
                tools.append({"name": b.get("name"), "id": b.get("id")})
    elif t == "stream_event":
        inner = obj.get("event") or {}
        itype = inner.get("type")
        if itype == "content_block_delta":
            delta = inner.get("delta") or {}
            if delta.get("type") == "text_delta":
                text_parts.append(delta.get("text", ""))
        elif itype == "content_block_start":
            cb = inner.get("content_block") or {}
            if cb.get("type") == "tool_use":
                tools.append({"name": cb.get("name"), "id": cb.get("id")})


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    session_id = req.session_id or str(uuid.uuid4())
    is_new = req.is_new or req.session_id is None
    cwd = _resolve_cwd(req.cwd)
    cmd = _build_command(req.prompt, session_id, is_new, req.model)

    logger.info(
        "chat/stream session=%s new=%s model=%s cwd=%s prompt_len=%d",
        session_id, is_new, req.model or "(default)", cwd, len(req.prompt),
    )

    # Persiste antes de streamar pra UI já enxergar a thread se ela recarregar
    # no meio do stream. Title só é gravado na 1ª criação (upsert preserva).
    await supabase_chat.upsert_thread(
        session_id,
        title=supabase_chat.derive_title(req.prompt) if is_new else None,
        cwd=cwd,
    )
    await supabase_chat.insert_message(session_id, "user", req.prompt)

    # Acumuladores pro turno da assistente — gravamos uma única mensagem no
    # fim do stream com o texto consolidado.
    assistant_text_parts: list[str] = []
    assistant_tools: list[dict] = []

    async def event_stream():
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue[tuple[str, str] | None] = asyncio.Queue()

        # CREATE_NO_WINDOW evita pop de console quando o backend rodar como
        # serviço futuramente; no dev atual já tá tudo no terminal.
        creationflags = 0
        if sys.platform == "win32":
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

        try:
            proc = subprocess.Popen(
                cmd,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,  # line-buffered
                creationflags=creationflags,
            )
        except FileNotFoundError:
            yield _sse({
                "type": "error",
                "message": f"`claude` não encontrado no PATH. Tentei: {cmd[0]}",
            })
            yield _sse({"type": "done", "exit_code": -1})
            return

        def _pipe_reader(pipe: IO[str], stream_name: str) -> None:
            try:
                for line in pipe:
                    s = line.rstrip("\r\n")
                    if not s:
                        continue
                    loop.call_soon_threadsafe(queue.put_nowait, (stream_name, s))
            except Exception as exc:  # noqa: BLE001
                logger.warning("reader %s erro: %s", stream_name, exc)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, (stream_name, "__END__"))

        threads = [
            threading.Thread(target=_pipe_reader, args=(proc.stdout, "stdout"), daemon=True),
            threading.Thread(target=_pipe_reader, args=(proc.stderr, "stderr"), daemon=True),
        ]
        for t in threads:
            t.start()

        # Primeiro evento: meta com o session_id que o cliente deve guardar
        # pra próximas mensagens.
        yield _sse({"type": "meta", "session_id": session_id, "is_new": is_new})

        ends_pending = 2
        try:
            while ends_pending > 0:
                item = await queue.get()
                if item is None:
                    break
                stream_name, payload = item
                if payload == "__END__":
                    ends_pending -= 1
                    continue

                if stream_name == "stdout":
                    # Cada linha do CLI já é JSON válido — só re-empacotamos
                    # como SSE pra UI parsear.
                    try:
                        obj = json.loads(payload)
                        _accumulate_assistant_turn(
                            obj, assistant_text_parts, assistant_tools,
                        )
                        yield _sse({"type": "claude", "event": obj})
                    except json.JSONDecodeError:
                        yield _sse({"type": "stdout_raw", "text": payload})
                else:
                    # stderr — logamos e mandamos pra UI debugar
                    logger.debug("claude stderr: %s", payload)
                    yield _sse({"type": "stderr", "text": payload})

            rc = proc.wait(timeout=5)
            yield _sse({"type": "done", "exit_code": rc, "session_id": session_id})
        except asyncio.CancelledError:
            logger.info("chat/stream cancelado pelo client — encerrando subprocess")
            raise
        finally:
            if proc.poll() is None:
                try:
                    proc.terminate()
                    proc.wait(timeout=2)
                except Exception:  # noqa: BLE001
                    try:
                        proc.kill()
                    except Exception:  # noqa: BLE001
                        pass
            # Persiste a resposta da assistente — mesmo se canceled/abortou,
            # gravamos o que foi acumulado pra não perder.
            final_text = "".join(assistant_text_parts).strip()
            if final_text or assistant_tools:
                await supabase_chat.insert_message(
                    session_id, "assistant",
                    final_text or "(sem resposta textual)",
                    assistant_tools or None,
                )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Threads + mensagens (read-only — persistência fica a cargo do /stream)
# ---------------------------------------------------------------------------


@router.get("/threads")
async def list_threads(limit: int = Query(30, ge=1, le=100)):
    """Lista as N threads mais recentes (ordenadas por updated_at DESC)."""
    return await supabase_chat.list_threads(limit=limit)


@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str):
    t = await supabase_chat.get_thread(thread_id)
    if t is None:
        raise HTTPException(status_code=404, detail="thread não encontrada")
    return t


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str):
    ok = await supabase_chat.delete_thread(thread_id)
    if not ok:
        raise HTTPException(status_code=500, detail="falha ao deletar")
    return {"ok": True}


@router.get("/threads/{thread_id}/messages")
async def list_messages(
    thread_id: str,
    limit: int = Query(20, ge=1, le=100),
    before: str | None = Query(None, description="ISO timestamp — retorna msgs mais antigas que esse"),
):
    """Lista mensagens DESC (mais recente primeiro).

    Pra paginar pra trás (carregar anteriores), passar o created_at da msg
    mais antiga atualmente exibida como `before`.
    """
    msgs = await supabase_chat.list_messages(thread_id, limit=limit, before=before)
    return {"messages": msgs, "has_more": len(msgs) == limit}
