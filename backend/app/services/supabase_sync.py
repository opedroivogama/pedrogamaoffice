"""One-way delta sync from the local SQLite DB to Supabase.

The Supabase ``escritorio_digital`` schema is a passive mirror of the saves
that matter — sessions, user preferences, tasks. Events are *not* synced
(too high volume; regenerable from Claude Code JSONL transcripts).

Direction is intentionally one-way: SQLite is the source of truth, Supabase
is a backup / cross-device view. Conflicts always resolve to local.

Sync cadence:
- Periodically by ``run_sync_loop`` (every ``SUPABASE_SYNC_INTERVAL_SECONDS``).
- Uses a cursor stored in ``user_preferences[supabase_last_sync_v1]`` so each
  pass only ships rows whose ``updated_at`` changed since the last success.

Disabled when ``SUPABASE_SYNC_ENABLED`` is false or credentials are missing.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import get_settings
from app.db.database import get_engine
from app.db.models import SessionRecord, TaskRecord, UserPreference

logger = logging.getLogger("claude-office.supabase-sync")

_CURSOR_KEY = "supabase_last_sync_v1"
_BATCH_SIZE = 500


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat()


def _session_payload(rec: SessionRecord) -> dict[str, Any]:
    return {
        "id": rec.id,
        "label": rec.label,
        "display_name": rec.display_name,
        "project_name": rec.project_name,
        "project_root": rec.project_root,
        "created_at": _iso(rec.created_at),
        "updated_at": _iso(rec.updated_at),
        "status": rec.status,
        "floor_id": rec.floor_id,
        "room_id": rec.room_id,
        "team_name": rec.team_name,
        "teammate_name": rec.teammate_name,
        "is_lead": rec.is_lead,
        "is_pinned": rec.is_pinned,
        "archived_at": _iso(rec.archived_at),
        "floor_pinned": rec.floor_pinned,
        "terminal_pid": rec.terminal_pid,
        "last_cwd": rec.last_cwd,
    }


def _preference_payload(rec: UserPreference) -> dict[str, Any]:
    return {
        "key": rec.key,
        "value": rec.value,
        "updated_at": _iso(rec.updated_at),
    }


def _task_payload(rec: TaskRecord) -> dict[str, Any]:
    return {
        "session_id": rec.session_id,
        "task_id": rec.task_id,
        "content": rec.content,
        "status": rec.status,
        "active_form": rec.active_form,
        "description": rec.description,
        "blocks": rec.blocks,
        "blocked_by": rec.blocked_by,
        "owner": rec.owner,
        "metadata_json": rec.metadata_json,
        "sort_order": rec.sort_order,
        "created_at": _iso(rec.created_at),
        "updated_at": _iso(rec.updated_at),
    }


class SupabaseSyncService:
    """Pushes delta rows to Supabase via PostgREST UPSERT."""

    def __init__(self) -> None:
        settings = get_settings()
        self.url = settings.SUPABASE_URL.rstrip("/")
        self.service_key = settings.SUPABASE_SERVICE_KEY
        self.schema = settings.SUPABASE_SYNC_SCHEMA
        self.enabled = bool(settings.SUPABASE_SYNC_ENABLED and self.url and self.service_key)
        self.interval = max(60, settings.SUPABASE_SYNC_INTERVAL_SECONDS)

    @property
    def _base_headers(self) -> dict[str, str]:
        return {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
            "Content-Profile": self.schema,
            "Accept-Profile": self.schema,
            "Prefer": "resolution=merge-duplicates,return=minimal",
        }

    async def _upsert(
        self,
        client: httpx.AsyncClient,
        table: str,
        rows: list[dict[str, Any]],
        *,
        on_conflict: str | None = None,
    ) -> None:
        if not rows:
            return
        url = f"{self.url}/rest/v1/{table}"
        params: dict[str, str] = {}
        if on_conflict is not None:
            params["on_conflict"] = on_conflict
        # Chunk to stay under reverse-proxy body limits.
        for i in range(0, len(rows), _BATCH_SIZE):
            batch = rows[i : i + _BATCH_SIZE]
            resp = await client.post(
                url, params=params, headers=self._base_headers, content=json.dumps(batch)
            )
            if resp.status_code >= 300:
                logger.warning(
                    "Supabase UPSERT %s failed [%s]: %s",
                    table,
                    resp.status_code,
                    resp.text[:300],
                )
                resp.raise_for_status()

    async def _read_cursor(self, db: AsyncSession) -> datetime:
        result = await db.execute(select(UserPreference).where(UserPreference.key == _CURSOR_KEY))
        pref = result.scalar_one_or_none()
        if pref and pref.value:
            try:
                return datetime.fromisoformat(pref.value)
            except ValueError:
                pass
        return datetime(2000, 1, 1, tzinfo=UTC)

    async def _write_cursor(self, db: AsyncSession, at: datetime) -> None:
        result = await db.execute(select(UserPreference).where(UserPreference.key == _CURSOR_KEY))
        pref = result.scalar_one_or_none()
        value = _iso(at) or ""
        if pref is None:
            db.add(UserPreference(key=_CURSOR_KEY, value=value))
        else:
            pref.value = value
        await db.commit()

    async def sync_once(self) -> dict[str, int]:
        """Push every row whose ``updated_at`` exceeds the saved cursor.

        Returns counts per table. Safe to call manually for ad-hoc sync.
        """
        if not self.enabled:
            return {"sessions": 0, "preferences": 0, "tasks": 0, "skipped": 1}

        session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
        async with session_factory() as db:
            cursor = await self._read_cursor(db)
            now = datetime.now(UTC)

            sessions_res = await db.execute(
                select(SessionRecord).where(SessionRecord.updated_at > cursor)
            )
            session_rows = [_session_payload(s) for s in sessions_res.scalars().all()]

            prefs_res = await db.execute(
                select(UserPreference)
                .where(UserPreference.updated_at > cursor)
                .where(UserPreference.key != _CURSOR_KEY)
            )
            preference_rows = [_preference_payload(p) for p in prefs_res.scalars().all()]

            tasks_res = await db.execute(select(TaskRecord).where(TaskRecord.updated_at > cursor))
            # Dedupe by (session_id, task_id) keeping the most recent row.
            # SQLite has no UNIQUE on those columns, but Supabase does, so
            # the UPSERT crashes if a batch contains two rows with the same
            # composite key.
            _task_by_key: dict[tuple[str, str], TaskRecord] = {}
            for t in tasks_res.scalars().all():
                key = (t.session_id, t.task_id)
                existing = _task_by_key.get(key)
                if existing is None or t.updated_at > existing.updated_at:
                    _task_by_key[key] = t
            task_rows = [_task_payload(t) for t in _task_by_key.values()]

        async with httpx.AsyncClient(timeout=30.0) as client:
            await self._upsert(client, "sessions", session_rows, on_conflict="id")
            await self._upsert(client, "user_preferences", preference_rows, on_conflict="key")
            await self._upsert(
                client,
                "tasks",
                task_rows,
                on_conflict="session_id,task_id",
            )

        async with session_factory() as db:
            await self._write_cursor(db, now)

        result = {
            "sessions": len(session_rows),
            "preferences": len(preference_rows),
            "tasks": len(task_rows),
        }
        if any(result.values()):
            logger.info(
                "Supabase sync: %d sessions, %d preferences, %d tasks pushed",
                result["sessions"],
                result["preferences"],
                result["tasks"],
            )
        return result


_singleton: SupabaseSyncService | None = None


def get_supabase_sync_service() -> SupabaseSyncService:
    global _singleton
    if _singleton is None:
        _singleton = SupabaseSyncService()
    return _singleton


async def run_sync_loop() -> None:
    """Background task — runs ``sync_once`` every ``interval`` seconds.

    Survives transient errors so a temporary VPS hiccup doesn't kill the
    loop. Cancellation (e.g. lifespan shutdown) ends it cleanly.
    """
    service = get_supabase_sync_service()
    if not service.enabled:
        logger.info("Supabase sync disabled — loop not started")
        return

    logger.info(
        "Supabase sync loop active — every %ds → %s.%s",
        service.interval,
        service.url,
        service.schema,
    )
    while True:
        try:
            await asyncio.sleep(service.interval)
            await service.sync_once()
        except asyncio.CancelledError:
            return
        except Exception as exc:  # noqa: BLE001 — keep the loop alive
            logger.warning("Supabase sync tick failed: %s", exc)
