import asyncio
import logging
import os
import subprocess
import sys
from datetime import UTC
from typing import Annotated, Any, TypedDict, cast

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.websocket import manager
from app.config import get_settings
from app.core.event_processor import event_processor
from app.core.jsonl_parser import get_session_ai_title
from app.core.terminal_focus import focus_session as focus_session_window
from app.core.terminal_focus import get_terminal_pid
from app.core.terminal_focus import register_session as register_terminal_pid
from app.db.database import get_db
from app.db.models import EventRecord, SessionRecord, TaskRecord, UserPreference
from app.services.git_service import git_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])

_simulation_process: subprocess.Popen[bytes] | None = None


def kill_simulation() -> bool:
    """Kill any running simulation process.

    Returns:
        True if a process was killed, False if no process was running.
    """
    global _simulation_process
    if _simulation_process is not None:
        try:
            _simulation_process.terminate()
            _simulation_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _simulation_process.kill()
        except Exception:
            pass
        finally:
            _simulation_process = None
        return True
    return False


class SessionSummary(TypedDict):
    """Summary data for a session in the list view."""

    id: str
    label: str | None
    displayName: str | None
    projectName: str | None
    projectRoot: str | None
    createdAt: str
    updatedAt: str
    status: str
    eventCount: int
    floorId: str | None
    roomId: str | None


class ReplayEvent(TypedDict):
    """Event data structure for replay."""

    id: str
    type: str
    agentId: str
    summary: str
    timestamp: str


class ReplayEntry(TypedDict):
    """A replay entry containing an event and the resulting state."""

    event: ReplayEvent
    state: dict[str, Any]


@router.get("")
async def list_sessions(
    db: Annotated[AsyncSession, Depends(get_db)],
    room_id: str | None = None,
    floor_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[SessionSummary]:
    """List sessions with event counts.

    Only returns sessions that have received a ``session_start`` event.  Child
    sessions spawned by OpenCode @agent mentions never receive a ``session_start``
    — they start directly with ``user_prompt_submit`` / ``pre_tool_use`` events —
    so filtering on this event type keeps them out of the sidebar.

    Args:
        db: Database session dependency.
        room_id: Optional filter to only return sessions in a specific room.
        floor_id: Optional filter to only return sessions on a specific floor.
        status: Optional filter by session status (``active``, ``completed``).
        limit: Maximum sessions to return (default 100, max 500).

    Returns:
        List of session summaries matching the given filters.
    """
    logger.debug("API: list_sessions called (room_id=%s, floor_id=%s)", room_id, floor_id)
    try:
        # Single query with GROUP BY to get event counts for all sessions.
        # Replaces N+1 pattern where each session required a separate COUNT query.
        event_count_subq = (
            select(
                EventRecord.session_id,
                func.count(EventRecord.id).label("event_count"),
            )
            .group_by(EventRecord.session_id)
            .subquery()
        )

        stmt = (
            select(
                SessionRecord,
                func.coalesce(event_count_subq.c.event_count, 0).label("event_count"),
            )
            .outerjoin(event_count_subq, SessionRecord.id == event_count_subq.c.session_id)
            .order_by(SessionRecord.updated_at.desc())
        )

        # Apply optional room/floor filters
        if room_id is not None:
            stmt = stmt.where(SessionRecord.room_id == room_id)
        if floor_id is not None:
            stmt = stmt.where(SessionRecord.floor_id == floor_id)
        if status is not None:
            stmt = stmt.where(SessionRecord.status == status)

        stmt = stmt.limit(min(limit, 500))
        result = await db.execute(stmt)
        rows = result.all()

        # Find session IDs that have at least one session_start event.
        # Child @agent sessions never get session_start, so they're excluded.
        sessions_with_start_stmt = (
            select(EventRecord.session_id)
            .where(EventRecord.event_type == "session_start")
            .distinct()
        )
        start_result = await db.execute(sessions_with_start_stmt)
        sessions_with_start: set[str] = {row[0] for row in start_result.all()}

        sessions: list[SessionSummary] = []
        for row in rows:
            rec = row[0]
            count = int(row[1])

            # Skip child sessions (no session_start event) unless it's the special
            # simulation session which also lacks one but is always valid.
            if rec.id not in sessions_with_start and not rec.id.startswith("sim_"):
                continue

            created_utc = (
                rec.created_at.astimezone(UTC)
                if rec.created_at.tzinfo
                else rec.created_at.replace(tzinfo=UTC)
            )
            updated_utc = (
                rec.updated_at.astimezone(UTC)
                if rec.updated_at.tzinfo
                else rec.updated_at.replace(tzinfo=UTC)
            )

            sessions.append(
                {
                    "id": rec.id,
                    "label": rec.label,
                    "displayName": rec.display_name,
                    "projectName": rec.project_name,
                    "projectRoot": rec.project_root,
                    "createdAt": created_utc.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                    "updatedAt": updated_utc.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                    "status": rec.status,
                    "eventCount": count,
                    "floorId": rec.floor_id,
                    "roomId": rec.room_id,
                }
            )
        return sessions
    except Exception as e:
        logger.exception("Error in list_sessions: %s", e)
        raise HTTPException(status_code=500, detail="Failed to list sessions") from e


class LabelUpdate(BaseModel):
    """Request body for updating a session label."""

    label: str | None = None


@router.patch("/{session_id}/label")
async def update_session_label(
    session_id: str, body: LabelUpdate, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    """Update the label of a session.

    Args:
        session_id: Identifier for the session to update.
        body: Request body containing the new label value.
        db: Database session dependency.

    Returns:
        A status payload confirming the update.

    Raises:
        HTTPException: If the session is not found or update fails.
    """
    try:
        result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        session.label = body.label
        await db.commit()
        return {"status": "success", "message": f"Label updated for session {session_id}"}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Error in update_session_label: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update session label") from e


class DisplayNameUpdate(BaseModel):
    """Request body for updating a session display name."""

    display_name: str | None = None


@router.patch("/{session_id}")
async def update_session(
    session_id: str, body: DisplayNameUpdate, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    """Update the display name of a session.

    Args:
        session_id: Identifier for the session to update.
        body: Request body containing the new display_name value.
        db: Database session dependency.

    Returns:
        A status payload confirming the update.

    Raises:
        HTTPException: If the session is not found or update fails.
    """
    try:
        result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        session.display_name = body.display_name
        await db.commit()
        return {"status": "success", "message": f"Session {session_id} updated"}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Error in update_session: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update session") from e


class RefreshNamesResult(TypedDict):
    """Result payload for refresh-names endpoint."""

    status: str
    updated: int
    scanned: int


async def refresh_display_names_from_transcripts(
    db: AsyncSession,
    *,
    broadcast: bool = True,
) -> tuple[int, int, list[str]]:
    """Scan every session's JSONL and update display_name when it changed.

    Shared core logic between the HTTP endpoint and the startup task. Walks
    every session in ``db``, locates its latest event with a ``transcript_path``,
    reads the most recent title (``custom-title`` wins over ``ai-title``) and
    overwrites ``display_name`` when different.

    Args:
        db: Async DB session (caller commits implicitly when changes occur).
        broadcast: When True, broadcasts a ``sessions_renamed`` WebSocket event
            to all connected clients. Set False during startup (no clients yet).

    Returns:
        ``(scanned, updated, changed_ids)`` — scanned counts sessions whose
        transcript was actually read; updated counts those whose display_name
        was overwritten.
    """
    settings = get_settings()
    sessions_result = await db.execute(select(SessionRecord))
    sessions = sessions_result.scalars().all()

    updated = 0
    scanned = 0
    changed_ids: list[str] = []

    for session in sessions:
        # Find the latest event for this session that carries a transcript_path.
        evt_stmt = (
            select(EventRecord.data)
            .where(EventRecord.session_id == session.id)
            .order_by(EventRecord.timestamp.desc())
            .limit(50)
        )
        evt_rows = (await db.execute(evt_stmt)).all()
        transcript_path: str | None = None
        for row in evt_rows:
            raw = row[0]
            if not isinstance(raw, dict):
                continue
            tp = cast(dict[str, Any], raw).get("transcript_path")
            if isinstance(tp, str) and tp:
                transcript_path = tp
                break

        if not transcript_path:
            continue

        scanned += 1
        translated_path = settings.translate_path(transcript_path)
        new_title = get_session_ai_title(translated_path)
        if not new_title:
            continue
        if new_title == session.display_name:
            continue
        session.display_name = new_title
        updated += 1
        changed_ids.append(session.id)

    if updated:
        await db.commit()
        if broadcast:
            await manager.broadcast_all(
                {
                    "type": "sessions_renamed",
                    "session_ids": changed_ids,
                    "timestamp": "",
                }
            )
    else:
        await db.rollback()

    return scanned, updated, changed_ids


@router.post("/refresh-names")
async def refresh_session_names(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RefreshNamesResult:
    """Refresh display names from each session's JSONL title entries.

    Scans every session's transcript, picks the latest ``custom-title``
    (manual ``/rename``) or fallback ``ai-title`` (auto), and updates
    ``display_name`` when it changed. Also called automatically at startup.

    Returns:
        A summary with the number of sessions scanned and updated.
    """
    scanned, updated, _ = await refresh_display_names_from_transcripts(db)
    return {"status": "success", "updated": updated, "scanned": scanned}


class FocusRequest(BaseModel):
    """Request body for focusing a session terminal."""

    message: str | None = None

    model_config = {"str_max_length": 100_000}


def _validate_clipboard_message(message: str | None) -> str | None:
    """Validate and truncate clipboard message to a safe maximum length.

    Args:
        message: The raw clipboard text from the request body.

    Returns:
        The validated message, truncated to 1 MB if necessary.

    Raises:
        HTTPException: If the message exceeds a hard maximum of 10 MB.
    """
    if message is None:
        return None

    hard_max = 10 * 1024 * 1024  # 10 MB
    soft_max = 1024 * 1024  # 1 MB

    if len(message) > hard_max:
        raise HTTPException(
            status_code=413,
            detail="Clipboard message too large (max 10 MB)",
        )

    if len(message) > soft_max:
        logger.warning(
            "Clipboard message truncated from %d to %d bytes",
            len(message),
            soft_max,
        )
        return message[:soft_max]

    return message


@router.post("/{session_id}/focus")
async def focus_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    body: FocusRequest | None = None,
) -> dict[str, str]:
    """Bring a session's terminal to the foreground and optionally copy a message to clipboard.

    Uses platform-appropriate commands (macOS AppleScript, Linux wmctrl/xdg-terminal).
    Clipboard copy uses ``pbcopy`` (macOS), ``xclip`` (Linux), or ``clip`` (Windows).

    Args:
        session_id: Identifier for the session to focus.
        body: Optional request body with a message to copy to clipboard.
        db: Database session dependency.

    Returns:
        A status payload confirming the focus action.

    Raises:
        HTTPException: If the session is not found or the focus action fails.
    """
    try:
        result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Bring Terminal to foreground (non-blocking async subprocess)
        if sys.platform == "win32":
            # Use the per-session terminal-PID map populated on session_start.
            # Falls through to no-op if the session hasn't reported its PID yet
            # (e.g., started before the hook was updated).
            # If the in-memory cache is cold (post-restart, before the next
            # session_start hits), seed it from the persisted column.
            if get_terminal_pid(session_id) is None and session.terminal_pid:
                register_terminal_pid(session_id, session.terminal_pid)
            focus_session_window(session_id)
        elif sys.platform == "darwin":
            await asyncio.create_subprocess_exec(
                "osascript",
                "-e",
                'tell application "Terminal" to activate',
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
        elif sys.platform == "linux":
            # Try common Linux terminal activators; non-fatal if unavailable.
            for cmd in [
                ["xdg-terminal", "wait"],
                ["wmctrl", "-xa", "terminal"],
            ]:
                try:
                    proc = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                    await proc.wait()
                    break
                except FileNotFoundError:
                    continue

        # Optionally copy message to clipboard (non-blocking async subprocess)
        clipboard_message = _validate_clipboard_message(body.message if body else None)
        if clipboard_message:
            clipboard_cmd: list[str] = []
            if sys.platform == "darwin":
                clipboard_cmd = ["pbcopy"]
            elif sys.platform == "linux":
                clipboard_cmd = ["xclip", "-selection", "clipboard"]
            elif sys.platform == "win32":
                clipboard_cmd = ["clip"]

            if clipboard_cmd:
                try:
                    proc = await asyncio.create_subprocess_exec(
                        *clipboard_cmd,
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                    await proc.communicate(input=clipboard_message.encode("utf-8"))
                except FileNotFoundError:
                    logger.warning("Clipboard command not found: %s", clipboard_cmd[0])

        return {"status": "success", "message": f"Session {session_id} focused"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in focus_session: %s", e)
        raise HTTPException(status_code=500, detail="Failed to focus session") from e


def _build_resume_command(workdir: str, session_id: str) -> list[str] | None:
    """Build the platform-appropriate command that opens a new terminal at
    ``workdir`` and runs ``claude --resume <session_id>``.

    Returns ``None`` on unsupported platforms.
    """
    import shutil

    inner = f"claude --resume {session_id}"
    if sys.platform == "win32":
        # Prefer PowerShell 7+ (pwsh) but fall back to built-in PowerShell 5.1
        # (powershell.exe) — many Windows boxes don't have pwsh installed.
        shell = "pwsh" if shutil.which("pwsh") else "powershell"
        # Windows Terminal: -d sets the starting directory, then we hand off
        # to the shell with -NoExit so the window stays open after claude exits.
        return [
            "wt.exe",
            "-d",
            workdir,
            shell,
            "-NoExit",
            "-Command",
            inner,
        ]
    if sys.platform == "darwin":
        script = f'tell application "Terminal" to do script "cd {workdir!r} && {inner}"'
        return ["osascript", "-e", script]
    if sys.platform == "linux":
        return [
            "x-terminal-emulator",
            "-e",
            "bash",
            "-lc",
            f"cd {workdir!r} && {inner}; exec bash",
        ]
    return None


async def _recover_workdir_from_events(db: AsyncSession, session_id: str) -> str | None:
    """Scan recent events for a working_dir / project_dir / cwd value.

    Used when a session predates the ``last_cwd`` column and therefore has
    no directory persisted on the SessionRecord. Walks the most recent
    events first so the freshest path wins.
    """
    stmt = (
        select(EventRecord.data)
        .where(EventRecord.session_id == session_id)
        .order_by(EventRecord.timestamp.desc())
        .limit(100)
    )
    rows = (await db.execute(stmt)).all()
    for row in rows:
        raw = row[0]
        if not isinstance(raw, dict):
            continue
        data = cast(dict[str, Any], raw)
        for key in ("working_dir", "project_dir", "cwd"):
            value = data.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def _find_workdir_from_jsonl(session_id: str) -> str | None:
    """Localiza o JSONL real da sessão em ``~/.claude/projects/`` e extrai
    o ``cwd`` registrado pelo próprio Claude Code.

    Essa é a fonte de verdade do CWD original — o JSONL fica num diretório
    cujo hash deriva do CWD onde o ``claude`` foi iniciado. Se o backend
    registrou ``project_root`` errado (ex: hook reportou um workspace que
    não bate com o CWD), usar o JSONL como fonte primária resolve o caso
    "No conversation found" que o ``claude --resume`` cospe quando o
    terminal abre na pasta errada.

    Returns ``None`` se nenhum JSONL com esse session_id for encontrado, ou
    se nenhum evento dentro dele tiver um ``cwd`` preenchido.
    """
    import json
    from pathlib import Path as _Path

    projects_dir = _Path.home() / ".claude" / "projects"
    if not projects_dir.is_dir():
        return None

    target_name = f"{session_id}.jsonl"
    try:
        candidates = list(projects_dir.glob(f"*/{target_name}"))
    except OSError:
        return None
    if not candidates:
        return None

    # Pega o mais recente — se houver mais de um (renomeio de projeto), o
    # último escrito é o mais provável de refletir o CWD ativo da sessão.
    jsonl_path = max(candidates, key=lambda p: p.stat().st_mtime)

    try:
        with jsonl_path.open("r", encoding="utf-8") as f:
            for _ in range(50):  # primeiros 50 eventos têm o cwd quase sempre
                line = f.readline()
                if not line:
                    break
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(obj, dict):
                    continue
                cwd = cast(dict[str, Any], obj).get("cwd")
                if isinstance(cwd, str) and cwd:
                    return cwd
    except OSError:
        return None

    return None


@router.post("/{session_id}/resume")
async def resume_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Open a fresh terminal at the session's working directory and run
    ``claude --resume <session_id>``.

    Uses ``last_cwd`` if available, falling back to ``project_root``. This is
    the post-reboot recovery action: even if the original terminal is gone,
    we relaunch in the same place and resume the Claude Code session.

    Args:
        session_id: Identifier for the session to resume.
        db: Database session dependency.

    Returns:
        A status payload confirming the launch.

    Raises:
        HTTPException: If the session is missing, has no known directory,
            or the platform is unsupported / the launcher is unavailable.
    """
    try:
        result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Fonte primária de verdade: o JSONL real escrito pelo Claude Code.
        # O hash do diretório onde ele vive deriva do CWD original — se a
        # gente não respeitar isso, `claude --resume` busca o transcript no
        # hash do CWD passado e devolve "No conversation found".
        jsonl_workdir = _find_workdir_from_jsonl(session_id)

        workdir = jsonl_workdir or session.last_cwd or session.project_root
        if not workdir:
            workdir = await _recover_workdir_from_events(db, session_id)
            if workdir:
                session.last_cwd = workdir
                await db.commit()
        if not workdir:
            raise HTTPException(
                status_code=400,
                detail="Session has no recorded working directory",
            )

        # Se o JSONL discordou do que está no DB, atualiza o registro pra
        # próxima chamada não precisar varrer o disco de novo.
        if jsonl_workdir and session.last_cwd != jsonl_workdir:
            session.last_cwd = jsonl_workdir
            await db.commit()

        cmd = _build_resume_command(workdir, session_id)
        if cmd is None:
            raise HTTPException(
                status_code=501,
                detail=f"Resume is not implemented for platform {sys.platform}",
            )

        # Fire-and-forget spawn. Usamos subprocess.Popen síncrono (não
        # asyncio.create_subprocess_exec) porque o event loop atual no Windows
        # pode não ser o ProactorEventLoop — Selector loops levantam
        # NotImplementedError em subprocess_exec. Popen não passa por asyncio.
        try:
            subprocess.Popen(  # noqa: S603
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
            )
        except FileNotFoundError as e:
            raise HTTPException(
                status_code=500,
                detail=f"Terminal launcher not found: {cmd[0]}",
            ) from e

        return {
            "status": "success",
            "message": f"Resuming session {session_id} at {workdir}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in resume_session: %s", e)
        raise HTTPException(status_code=500, detail="Failed to resume session") from e


@router.get("/{session_id}/replay")
async def get_session_replay(
    session_id: str, db: Annotated[AsyncSession, Depends(get_db)]
) -> list[ReplayEntry]:
    """Get all events and resulting states for session replay.

    Replays events through the state machine to reconstruct the state
    after each event, enabling frontend replay functionality.
    """
    try:
        stmt = (
            select(EventRecord)
            .where(EventRecord.session_id == session_id)
            .order_by(EventRecord.timestamp.asc())
        )
        result = await db.execute(stmt)
        events = result.scalars().all()

        from app.core.state_machine import StateMachine
        from app.models.events import Event, EventData, EventType

        sm = StateMachine()
        replay_data: list[ReplayEntry] = []

        for rec in events:
            evt = Event(
                event_type=EventType(rec.event_type),
                session_id=rec.session_id,
                timestamp=rec.timestamp,
                data=EventData.model_validate(rec.data),
            )
            sm.transition(evt)
            state = sm.to_game_state(session_id)

            ts_utc = (
                rec.timestamp.astimezone(UTC)
                if rec.timestamp.tzinfo
                else rec.timestamp.replace(tzinfo=UTC)
            )

            agent_id = rec.data.get("agent_id") if rec.data else "main"
            if not agent_id:
                agent_id = "main"
            replay_data.append(
                {
                    "event": {
                        "id": str(rec.timestamp.timestamp()),
                        "type": rec.event_type,
                        "agentId": str(agent_id),
                        "summary": event_processor.get_event_summary(evt),
                        "timestamp": ts_utc.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
                    },
                    "state": state.model_dump(mode="json", by_alias=True),
                }
            )

        return replay_data
    except Exception as e:
        logger.exception("Error in get_session_replay: %s", e)
        raise HTTPException(status_code=500, detail="Failed to generate replay") from e


@router.post("/simulate")
async def trigger_simulation() -> dict[str, str]:
    """Start the event simulation script in the background."""
    global _simulation_process

    if _simulation_process is not None and _simulation_process.poll() is None:
        kill_simulation()

    try:
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))
        script_path = os.path.join(project_root, "scripts/simulate_events.py")

        _simulation_process = subprocess.Popen(
            ["uv", "run", "python", script_path],
            cwd=project_root,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        return {"status": "success", "message": "Simulation started in background"}
    except Exception as e:
        logger.exception("Error in trigger_simulation: %s", e)
        raise HTTPException(status_code=500, detail="Failed to start simulation") from e


@router.get("/simulate/status")
async def get_simulation_status() -> dict[str, bool]:
    """Return whether the background simulation process is currently alive."""
    running = (
        _simulation_process is not None and _simulation_process.poll() is None
    )
    return {"running": running}


@router.delete("/simulate")
async def stop_simulation() -> dict[str, str | bool]:
    """Stop the background simulation process if it is running."""
    was_running = kill_simulation()
    return {
        "status": "success",
        "stopped": was_running,
        "message": "Simulation stopped" if was_running else "No simulation running",
    }


@router.delete("")
async def clear_database(db: Annotated[AsyncSession, Depends(get_db)]) -> dict[str, str]:
    """Clear all sessions and events from the database."""
    try:
        simulation_killed = kill_simulation()

        # Preserve building/floor configuration while clearing everything else.
        await db.execute(delete(UserPreference).where(UserPreference.key != "building_config"))
        await db.execute(delete(TaskRecord))
        await db.execute(delete(EventRecord))
        await db.execute(delete(SessionRecord))
        await db.commit()

        # Re-invalidate cached building config in case other preferences changed.
        from app.core.floor_config import invalidate_building_config

        invalidate_building_config()

        await event_processor.clear_all_sessions()
        git_service.clear()

        await manager.broadcast_all({"type": "reload", "timestamp": ""})

        message = "Database and memory cleared"
        if simulation_killed:
            message += " (simulation stopped)"
        return {"status": "success", "message": message}
    except Exception as e:
        await db.rollback()
        logger.exception("Error in clear_database: %s", e)
        raise HTTPException(status_code=500, detail="Failed to clear database") from e


@router.delete("/{session_id}")
async def delete_session(
    session_id: str, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    """Delete a single session, its events, and in-memory cache.

    Args:
        session_id: Identifier for the session to delete.
        db: Database session dependency.

    Returns:
        A status payload confirming deletion.

    Raises:
        HTTPException: If the session is not found or deletion fails.
    """
    try:
        result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        await db.execute(delete(TaskRecord).where(TaskRecord.session_id == session_id))
        await db.execute(delete(EventRecord).where(EventRecord.session_id == session_id))
        await db.execute(delete(SessionRecord).where(SessionRecord.id == session_id))
        await db.commit()

        await event_processor.remove_session(session_id)

        # Broadcast session deletion to all connected clients
        await manager.broadcast_all(
            {
                "type": "session_deleted",
                "session_id": session_id,
                "timestamp": "",
            }
        )

        return {"status": "success", "message": f"Session {session_id} deleted"}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Error in delete_session: %s", e)
        raise HTTPException(status_code=500, detail="Failed to delete session") from e
