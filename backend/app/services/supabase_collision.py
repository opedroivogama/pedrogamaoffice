"""Cliente leve pro Supabase self-hosted — persistência dos overrides do
collision editor (paredes pintadas tile a tile pelo Pedro).

Mantemos a interface mínima: listar overrides por floor, upsert batch,
delete tile específico, clear all do floor. Tudo via PostgREST com
`service_role` — só roda no backend.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import get_settings

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


async def list_overrides(floor_id: str) -> list[dict[str, Any]]:
    """Retorna todos overrides do floor."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            _rest_url(
                f"collision_overrides?floor_id=eq.{floor_id}&select=gx,gy,tile_type"
            ),
            headers=_headers(),
        )
        if r.status_code != 200:
            logger.error("list_overrides failed: %s %s", r.status_code, r.text)
            return []
        data = r.json()
        return data if isinstance(data, list) else []


async def upsert_overrides_batch(
    floor_id: str, tiles: list[dict[str, Any]]
) -> bool:
    """Upsert em batch de tiles {gx, gy, tile_type} pro floor.

    Usa `on_conflict=floor_id,gx,gy` + Prefer=merge-duplicates pra fazer
    UPSERT atômico — se já existe um tile naquela posição, sobrescreve
    tile_type e updated_at.
    """
    if not tiles:
        return True

    rows = [
        {
            "floor_id": floor_id,
            "gx": int(t["gx"]),
            "gy": int(t["gy"]),
            "tile_type": str(t["tile_type"]),
        }
        for t in tiles
    ]

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            _rest_url(
                "collision_overrides?on_conflict=floor_id,gx,gy"
            ),
            headers={
                **_headers(),
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=rows,
        )
        if r.status_code not in (200, 201, 204):
            logger.error(
                "upsert_overrides_batch failed: %s %s", r.status_code, r.text
            )
            return False
        return True


async def delete_override(floor_id: str, gx: int, gy: int) -> bool:
    """Remove o override de um tile específico (volta a ser FLOOR padrão)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.delete(
            _rest_url(
                f"collision_overrides?floor_id=eq.{floor_id}&gx=eq.{gx}&gy=eq.{gy}"
            ),
            headers=_headers(),
        )
        if r.status_code not in (200, 204):
            logger.error("delete_override failed: %s %s", r.status_code, r.text)
            return False
        return True


async def clear_floor(floor_id: str) -> bool:
    """Remove todos os overrides do floor (reset)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.delete(
            _rest_url(f"collision_overrides?floor_id=eq.{floor_id}"),
            headers=_headers(),
        )
        if r.status_code not in (200, 204):
            logger.error("clear_floor failed: %s %s", r.status_code, r.text)
            return False
        return True
