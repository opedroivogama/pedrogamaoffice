"""Single-session display-name refresh helper.

Lives in ``app.core`` (not ``app.api.routes.sessions``) to avoid a circular
import — ``sessions.py`` already imports ``event_processor``, so the reverse
direction would deadlock at import time.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.websocket import manager
from app.config import get_settings
from app.core.jsonl_parser import get_session_ai_title
from app.db.models import SessionRecord

logger = logging.getLogger(__name__)


async def refresh_display_name_for_session(
    db: AsyncSession,
    session_id: str,
    transcript_path: str,
    *,
    broadcast: bool = True,
) -> bool:
    """Rescan a single session's JSONL and update ``display_name`` if changed.

    Cheap counterpart to ``refresh_display_names_from_transcripts`` — meant to
    run on hot paths (every ``stop``/``task_completed``/``session_start``
    event), so it touches exactly one row and reads exactly one transcript.

    Args:
        db: Async DB session. Committed here only if a change occurs.
        session_id: ID of the session whose name to refresh.
        transcript_path: Absolute path to the session's JSONL (as reported by
            the hook event).
        broadcast: When True (default), broadcast a ``sessions_renamed`` event
            on change so connected clients can refetch.

    Returns:
        True when the DB was updated, False otherwise.
    """
    settings = get_settings()
    translated_path = settings.translate_path(transcript_path)
    new_title = get_session_ai_title(translated_path)
    if not new_title:
        return False

    result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
    session = result.scalar_one_or_none()
    if not session or session.display_name == new_title:
        return False

    session.display_name = new_title
    await db.commit()

    if broadcast:
        await manager.broadcast_all(
            {
                "type": "sessions_renamed",
                "session_ids": [session_id],
                "timestamp": "",
            }
        )
    return True
