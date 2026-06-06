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
from typing import IO, Literal

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
    # "main" = turno normal, escreve no JSONL da sessão (--resume/--session-id).
    # "btw" = sidequest paralela: spawn claude -p efêmero (sem --session-id)
    # com snapshot das últimas msgs da sessão principal injetado via
    # --append-system-prompt. Não polui o JSONL principal nem disputa lock,
    # mas a resposta é persistida na mesma thread do chat com kind='btw'.
    kind: Literal["main", "btw"] = "main"


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


# ---------------------------------------------------------------------------
# /btw — context fork
# ---------------------------------------------------------------------------

# Quantos chars no máximo de contexto da sessão principal mandamos pra um
# /btw. Não dá pra subir muito porque no Windows o `claude` é um shim .CMD
# e o cmd.exe tem teto de 8191 chars na linha de comando inteira — com o
# header do system prompt, prompt do usuário e demais flags, sobra ~4–5K
# pro snapshot. Acima disso o subprocess falha com "Linha de comando muito
# longa". Se um dia rodar via PowerShell direto (sem .CMD shim) dá pra
# subir esse limite.
_BTW_CONTEXT_MAX_CHARS = 4000
# Limite por turno individual — evita que uma resposta gigante do Claude
# coma todo o budget de contexto sozinha.
_BTW_PER_TURN_CAP = 800
# Teto duro da linha de comando inteira no Windows (cmd.exe). Trim defensivo
# caso o prompt do usuário e o contexto somados tentem ultrapassar.
_WIN_CMD_LINE_MAX = 7500


def _find_main_jsonl(session_id: str) -> Path | None:
    """Localiza o JSONL da sessão Claude Code principal.

    Claude Code organiza por `~/.claude/projects/<project-hash>/<session>.jsonl`,
    e o project-hash depende do cwd — então é mais barato fazer um glob direto
    do que recalcular o hash a partir do cwd.
    """
    home = Path.home()
    base = home / ".claude" / "projects"
    if not base.is_dir():
        return None
    matches = list(base.glob(f"*/{session_id}.jsonl"))
    return matches[0] if matches else None


def _extract_text(content: object) -> str:
    """Extrai texto consolidado de um campo `content` do Claude Code JSONL.

    O campo pode ser string (formato antigo) ou lista de blocos
    (`[{type:'text', text:'...'}, ...]`). Ignora blocos não-text (tool_use,
    tool_result, thinking — irrelevantes pra snapshot de conversa).
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                t = block.get("text")
                if isinstance(t, str):
                    parts.append(t)
        return "".join(parts)
    return ""


def _load_main_session_context(
    session_id: str,
    *,
    max_chars: int = _BTW_CONTEXT_MAX_CHARS,
) -> str:
    """Lê o JSONL da sessão principal e devolve snapshot das últimas trocas.

    Caminha de trás pra frente coletando pares user/assistant até estourar o
    `max_chars`. Cada turno é truncado em `_BTW_PER_TURN_CAP` chars pra
    evitar que uma única resposta longa consuma todo o orçamento.

    Returns:
        String formatada (blocos `[user] …` / `[assistant] …` separados por
        linhas em branco), ou string vazia se não achou o JSONL ou está vazio.
    """
    path = _find_main_jsonl(session_id)
    if path is None:
        logger.info("btw: JSONL não encontrado pra session_id=%s", session_id)
        return ""
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError as exc:
        logger.warning("btw: falha lendo %s: %s", path, exc)
        return ""

    blocks: list[str] = []
    total = 0
    for line in reversed(lines):
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        msg = obj.get("message")
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        if role not in ("user", "assistant"):
            continue
        text = _extract_text(msg.get("content")).strip()
        if not text:
            continue
        if len(text) > _BTW_PER_TURN_CAP:
            text = text[: _BTW_PER_TURN_CAP] + " […]"
        block = f"[{role}] {text}"
        if total + len(block) > max_chars:
            break
        blocks.append(block)
        total += len(block) + 2

    if not blocks:
        return ""
    blocks.reverse()  # cronológico
    return "\n\n".join(blocks)


def _build_btw_system_prompt(context: str) -> str:
    """Monta o system prompt extra pro /btw.

    Explica pro sub-claude que ele é uma side-question e dá o snapshot da
    sessão principal como contexto somente-leitura.
    """
    header = (
        "Você é uma execução paralela (`/btw` — by the way) disparada pelo "
        "usuário no painel de chat. A sessão principal continua rodando em "
        "outro processo e você NÃO tem acesso ao estado em tempo real dela. "
        "Use o snapshot abaixo como contexto de leitura, responda objetivo "
        "e curto, e não tente assumir tarefas longas — qualquer trabalho "
        "real continua na thread principal."
    )
    if not context:
        return header + "\n\n(Snapshot da sessão principal indisponível.)"
    return (
        header
        + "\n\n--- Snapshot da sessão principal (últimas trocas) ---\n"
        + context
        + "\n--- fim do snapshot ---"
    )


def _build_btw_command(
    prompt: str,
    ephemeral_id: str,
    model: str | None,
    context: str,
) -> list[str]:
    """Comando pra rodar um /btw — claude -p efêmero com snapshot injetado.

    Faz trim defensivo do contexto se a linha de comando total passar de
    `_WIN_CMD_LINE_MAX` (limite do cmd.exe). Sob trim, a snapshot perde os
    turnos mais antigos primeiro.
    """
    def assemble(ctx: str) -> list[str]:
        c = [
            _claude_executable(),
            "--print",
            prompt,
            "--output-format",
            "stream-json",
            "--include-partial-messages",
            "--verbose",
            "--session-id",
            ephemeral_id,  # id descartável só pra não colidir com nenhuma sessão
            "--append-system-prompt",
            _build_btw_system_prompt(ctx),
        ]
        if model and model in _ALLOWED_MODELS:
            c.extend(["--model", model])
        return c

    cmd = assemble(context)
    if model and model not in _ALLOWED_MODELS:
        logger.warning("ignoring unknown model id from client: %s", model)

    # Soma o tamanho do cmd inteiro (chars + 1 espaço entre args). Se exceder,
    # corta o contexto pela metade até caber. Última saída garantida: sem
    # contexto algum, só o header do system prompt.
    if sys.platform == "win32":
        while context and sum(len(a) for a in cmd) + len(cmd) > _WIN_CMD_LINE_MAX:
            context = context[len(context) // 4 :]  # joga fora 1/4 do mais antigo
            cmd = assemble(context)
            if len(context) < 200:
                break
    return cmd


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
    is_btw = req.kind == "btw"
    if is_btw and not req.session_id:
        raise HTTPException(
            status_code=400,
            detail="/btw exige session_id da thread principal",
        )

    # session_id "lógico" = id que persistimos no chat_messages. Pra /btw é
    # a mesma thread principal (vivendo no mesmo painel). Pra /main é o id
    # do --session-id/--resume do Claude.
    session_id = req.session_id or str(uuid.uuid4())
    is_new = (not is_btw) and (req.is_new or req.session_id is None)
    cwd = _resolve_cwd(req.cwd)

    if is_btw:
        ephemeral_id = str(uuid.uuid4())
        context_snapshot = _load_main_session_context(session_id)
        cmd = _build_btw_command(
            req.prompt, ephemeral_id, req.model, context_snapshot,
        )
    else:
        cmd = _build_command(req.prompt, session_id, is_new, req.model)

    logger.info(
        "chat/stream session=%s kind=%s new=%s model=%s cwd=%s prompt_len=%d",
        session_id, req.kind, is_new, req.model or "(default)", cwd, len(req.prompt),
    )

    # Pra /btw a thread principal já existe — só persiste a msg do user com
    # kind=btw e não toca no title. Pra /main mantém comportamento atual.
    if not is_btw:
        await supabase_chat.upsert_thread(
            session_id,
            title=supabase_chat.derive_title(req.prompt) if is_new else None,
            cwd=cwd,
        )
    await supabase_chat.insert_message(
        session_id, "user", req.prompt, kind=req.kind,
    )

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
        # pra próximas mensagens (e o kind, pra a UI já pintar a bolha do
        # /btw com o tom certo desde o primeiro delta).
        yield _sse({
            "type": "meta",
            "session_id": session_id,
            "is_new": is_new,
            "kind": req.kind,
        })

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
                    kind=req.kind,
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
