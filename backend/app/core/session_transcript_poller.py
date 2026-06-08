"""Poll do JSONL da sessão principal para emitir mensagens do terminal no WebSocket."""

import asyncio
import contextlib
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from app.api.websocket import manager
from app.core.path_utils import is_safe_transcript_path

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 1.0
MAX_TEXT_CHARS = 400


def _find_jsonl_for_session(session_id: str) -> Path | None:
    p = Path.home() / ".claude" / "projects"
    if not p.is_dir():
        return None
    try:
        candidates = list(p.glob(f"*/{session_id}.jsonl"))
    except OSError:
        return None
    return max(candidates, key=lambda x: x.stat().st_mtime) if candidates else None


@dataclass
class _WatchedSession:
    session_id: str
    transcript_path: Path
    file_position: int = 0
    last_user_hash: int = 0
    last_assistant_hash: int = 0
    poll_task: asyncio.Task | None = field(default=None, repr=False)


class SessionTranscriptPoller:
    def __init__(self) -> None:
        self._sessions: dict[str, _WatchedSession] = {}
        self._lock = asyncio.Lock()

    async def start_watching(self, session_id: str) -> bool:
        async with self._lock:
            if session_id in self._sessions:
                return False
        path = _find_jsonl_for_session(session_id)
        if not path or not is_safe_transcript_path(path):
            logger.warning("SessionTranscriptPoller: JSONL não encontrado para %s", session_id)
            return False
        async with self._lock:
            if session_id in self._sessions:
                return False
            w = _WatchedSession(
                session_id=session_id,
                transcript_path=path,
                file_position=path.stat().st_size if path.exists() else 0,
            )
            w.poll_task = asyncio.create_task(
                self._poll_loop(session_id), name=f"session_transcript_{session_id}"
            )
            self._sessions[session_id] = w
            logger.info("SessionTranscriptPoller: watching %s em %s", session_id, path)
            return True

    async def stop_watching(self, session_id: str) -> None:
        async with self._lock:
            w = self._sessions.pop(session_id, None)
        if w and w.poll_task:
            w.poll_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await w.poll_task

    def is_watching(self, session_id: str) -> bool:
        return session_id in self._sessions

    async def _poll_loop(self, session_id: str) -> None:
        try:
            while True:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                async with self._lock:
                    w = self._sessions.get(session_id)
                if w is None:
                    return
                try:
                    messages = self._read_new(w)
                except Exception as e:
                    logger.warning("SessionTranscriptPoller: erro ao ler %s: %s", session_id, e)
                    continue
                for role, text in messages:
                    try:
                        await manager.broadcast_global(
                            {
                                "type": "session_transcript_message",
                                "session_id": session_id,
                                "role": role,
                                "text": text,
                            }
                        )
                    except Exception as e:
                        logger.warning("SessionTranscriptPoller: erro ao broadcast: %s", e)
        except asyncio.CancelledError:
            raise

    def _read_new(self, w: _WatchedSession) -> list[tuple[str, str]]:
        if not w.transcript_path.exists():
            return []
        if w.transcript_path.stat().st_size <= w.file_position:
            return []
        results: list[tuple[str, str]] = []
        with open(w.transcript_path, encoding="utf-8") as f:
            f.seek(w.file_position)
            content = f.read()
            w.file_position = f.tell()
        for line in content.split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            msg = rec.get("message", {})
            role = msg.get("role", "")
            blocks = msg.get("content", [])

            if rec.get("type") == "user" and role == "user":
                parts = [
                    b if isinstance(b, str) else b.get("text", "")
                    for b in blocks
                    if isinstance(b, (str, dict))
                ]
                text = "\n".join(p for p in parts if p).strip()
                if not text:
                    continue
                h = hash(text[:200])
                if h == w.last_user_hash:
                    continue
                w.last_user_hash = h
                results.append(("user", text[:MAX_TEXT_CHARS]))

            elif rec.get("type") == "assistant" and role == "assistant":
                parts = [
                    b.get("text", "")
                    for b in blocks
                    if isinstance(b, dict) and b.get("type") == "text"
                ]
                text = "\n".join(p for p in parts if p).strip()
                if not text:
                    continue
                h = hash(text[:200])
                if h == w.last_assistant_hash:
                    continue
                w.last_assistant_hash = h
                results.append(("assistant", text[:MAX_TEXT_CHARS]))

        return results


_poller: SessionTranscriptPoller | None = None


def get_session_transcript_poller() -> SessionTranscriptPoller | None:
    return _poller


def init_session_transcript_poller() -> SessionTranscriptPoller:
    global _poller
    _poller = SessionTranscriptPoller()
    return _poller
