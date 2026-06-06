"""Endpoints pra persistência dos overrides do collision editor.

Storage no Supabase (tabela public.collision_overrides) — substitui o
localStorage do frontend pra que paredes pintadas persistam entre devices /
sessões / users.

Schema da request:
- GET  /api/v1/collision/{floor_id} → lista de tiles
- POST /api/v1/collision/{floor_id} → upsert batch (substitui ou adiciona)
- DELETE /api/v1/collision/{floor_id}/{gx}/{gy} → remove um tile
- DELETE /api/v1/collision/{floor_id} → limpa tudo do floor
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import supabase_collision

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/collision", tags=["collision"])


class CollisionTile(BaseModel):
    gx: int = Field(..., ge=0, le=10000)
    gy: int = Field(..., ge=0, le=10000)
    tile_type: Literal["wall", "floor", "above", "below"]


class UpsertBatchRequest(BaseModel):
    tiles: list[CollisionTile]


@router.get("/{floor_id}")
async def list_overrides(floor_id: str) -> dict:
    """Lista todos overrides do floor — usado no boot do CollisionEditor."""
    tiles = await supabase_collision.list_overrides(floor_id)
    return {"floor_id": floor_id, "tiles": tiles}


@router.post("/{floor_id}")
async def upsert_overrides(
    floor_id: str, body: UpsertBatchRequest
) -> dict:
    """Upsert em batch de tiles do floor — chamado ao final de cada stroke."""
    ok = await supabase_collision.upsert_overrides_batch(
        floor_id, [t.model_dump() for t in body.tiles]
    )
    if not ok:
        raise HTTPException(500, detail="Supabase upsert failed")
    return {"floor_id": floor_id, "upserted": len(body.tiles)}


@router.delete("/{floor_id}/{gx}/{gy}")
async def delete_override(floor_id: str, gx: int, gy: int) -> dict:
    """Remove um tile específico do floor (volta a ser walkable)."""
    ok = await supabase_collision.delete_override(floor_id, gx, gy)
    if not ok:
        raise HTTPException(500, detail="Supabase delete failed")
    return {"floor_id": floor_id, "deleted": {"gx": gx, "gy": gy}}


@router.delete("/{floor_id}")
async def clear_floor(floor_id: str) -> dict:
    """Limpa TODOS os overrides do floor — usado pelo botão Reset."""
    ok = await supabase_collision.clear_floor(floor_id)
    if not ok:
        raise HTTPException(500, detail="Supabase clear failed")
    return {"floor_id": floor_id, "cleared": True}
