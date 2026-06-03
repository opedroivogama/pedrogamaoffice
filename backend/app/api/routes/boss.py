"""Boss avatar control routes.

Endpoints that move the Claude/boss sprite around the office independently
of the lifecycle state machine. The boss's logical state (IDLE / WORKING /
DELEGATING / etc.) stays untouched — these endpoints only set a walk target,
broadcast it over WebSocket, and let the frontend animate the position.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.websocket import manager, validate_session_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/boss", tags=["boss"])


class BossWalkRequest(BaseModel):
    session_id: str = Field(..., description="Session whose clients should move the boss")
    x: float = Field(..., ge=0, le=8000, description="Target x in canvas pixels")
    y: float = Field(..., ge=0, le=8000, description="Target y in canvas pixels")


@router.post("/walk")
async def walk_boss(req: BossWalkRequest) -> dict[str, str]:
    """Tell every client watching *session_id* to walk the boss to (x, y).

    The frontend resolves the target through its navigation grid, so callers
    don't have to pre-validate walkability — blocked targets just slide.
    """
    if not validate_session_id(req.session_id):
        raise HTTPException(status_code=400, detail="Invalid session_id format")

    await manager.broadcast(
        {"type": "boss_walk_to", "x": req.x, "y": req.y},
        req.session_id,
    )
    return {"status": "ok"}


