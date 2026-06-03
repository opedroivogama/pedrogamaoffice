"""Endpoints CRUD pra feature de Notas do painel.

Tudo via Supabase self-hosted (PostgREST). A escrita também regenera o
mirror local `./notas.md` na raiz do projeto — ver `notes_service`.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import notes_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notes", tags=["notes"])


# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------


class NoteCreate(BaseModel):
    title: str = Field(default="Sem título", max_length=200)
    body: str = Field(default="", max_length=200_000)


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=200_000)


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------


@router.get("")
async def list_notes() -> list[dict]:
    """Lista todas as notas, mais recentemente editadas primeiro."""
    return await notes_service.list_notes()


@router.post("", status_code=201)
async def create_note(payload: NoteCreate) -> dict:
    note = await notes_service.create_note(payload.title, payload.body)
    if note is None:
        raise HTTPException(status_code=502, detail="Supabase rejeitou o insert")
    return note


@router.patch("/{note_id}")
async def update_note(note_id: str, payload: NoteUpdate) -> dict:
    if payload.title is None and payload.body is None:
        raise HTTPException(status_code=400, detail="Nada pra atualizar")
    note = await notes_service.update_note(note_id, payload.title, payload.body)
    if note is None:
        raise HTTPException(status_code=404, detail="Nota não encontrada")
    return note


@router.delete("/{note_id}", status_code=204)
async def delete_note(note_id: str) -> None:
    ok = await notes_service.delete_note(note_id)
    if not ok:
        raise HTTPException(status_code=502, detail="Falha ao deletar")
