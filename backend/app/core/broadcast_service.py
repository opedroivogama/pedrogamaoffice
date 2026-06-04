"""WebSocket broadcasting helpers for the EventProcessor.

Provides standalone async functions that send state and event payloads to all
WebSocket connections for a given session.  Extracted from EventProcessor so
that handler modules can import just what they need without pulling in the
full EventProcessor class.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.api.websocket import manager
from app.core.state_machine import StateMachine
from app.models.sessions import GameState, HistoryEntry

if TYPE_CHECKING:
    from app.core.room_orchestrator import RoomOrchestrator

__all__ = [
    "broadcast_state",
    "broadcast_event",
    "broadcast_error",
    "broadcast_room_state",
    "broadcast_global_state",
]


async def broadcast_state(session_id: str, sm: StateMachine) -> None:
    """Broadcast the current GameState to all clients connected to *session_id*.

    Args:
        session_id: The session whose clients should receive the update.
        sm: The StateMachine holding current state.
    """
    game_state: GameState = sm.to_game_state(session_id)
    await manager.broadcast(
        {
            "type": "state_update",
            "timestamp": game_state.last_updated.isoformat(),
            "state": game_state.model_dump(mode="json", by_alias=True),
        },
        session_id,
    )
    # Sempre que alguém atualiza, também notifica o feed global pra que
    # painéis abertos em /ws/all vejam a mudança em tempo real.
    try:
        await broadcast_global_state()
    except Exception as e:  # noqa: BLE001
        # Erros no agregador não devem derrubar o broadcast principal.
        # Usamos exception() pra capturar stack trace completo — sem ele o
        # broadcast global pode falhar silenciosamente e nenhum sprite aparece
        # no painel.
        import logging
        logging.getLogger(__name__).exception(
            "broadcast_global_state falhou (não fatal): %s", e
        )


async def broadcast_event(
    session_id: str,
    event_dict: HistoryEntry,
) -> None:
    """Broadcast a single event payload to all clients connected to *session_id*.

    Args:
        session_id: The session whose clients should receive the event.
        event_dict: The history-entry TypedDict describing the event.
    """
    payload: dict[str, Any] = {
        "type": "event",
        "timestamp": event_dict["timestamp"],
        "event": dict(event_dict),
    }
    await manager.broadcast(payload, session_id)


async def broadcast_error(session_id: str, message: str, timestamp: str) -> None:
    """Broadcast an error message to all clients connected to *session_id*.

    Args:
        session_id: The session whose clients should receive the error.
        message: Human-readable error description.
        timestamp: ISO-format timestamp string for the error.
    """
    await manager.broadcast(
        {
            "type": "error",
            "message": message,
            "timestamp": timestamp,
        },
        session_id,
    )


async def broadcast_room_state(room_id: str, orchestrator: RoomOrchestrator) -> None:
    """Broadcast merged room state to all WebSocket clients subscribed to a room."""
    merged_state = orchestrator.merge()
    if merged_state is None:
        return
    await manager.broadcast_room(
        {
            "type": "state_update",
            "timestamp": merged_state.last_updated.isoformat(),
            "state": merged_state.model_dump(mode="json", by_alias=True),
        },
        room_id,
    )


async def broadcast_global_state() -> None:
    """Broadcast a state_update agregando agents de TODAS as sessões ativas.

    Vai pro feed /ws/all. Pedro usa isso pra ver subagentes de qualquer
    terminal Claude Code rodando ao mesmo tempo, no mesmo escritório
    virtual. O boss usado é o da PRIMEIRA sessão (geralmente sua),
    mas todos os agents/queues de todas as sessões aparecem.
    """
    # Import lazy pra evitar ciclo (event_processor importa este módulo).
    from app.core.event_processor import event_processor

    sessions = event_processor.sessions
    if not sessions:
        return

    # Pega o primeiro state como "host" (boss + office state).
    first_session_id, first_sm = next(iter(sessions.items()))
    merged = first_sm.to_game_state(first_session_id)

    # Une todos os agents de todas as sessões. IDs já são UUIDs (sem colisão).
    seen_ids: set[str] = {a.id for a in merged.agents}
    extra_arrival: list[str] = []
    extra_departure: list[str] = []
    for sid, sm in sessions.items():
        if sid == first_session_id:
            continue
        other = sm.to_game_state(sid)
        for agent in other.agents:
            if agent.id in seen_ids:
                continue
            seen_ids.add(agent.id)
            merged.agents.append(agent)
        # Concatena queues sem perder ordem.
        if other.arrival_queue:
            extra_arrival.extend(other.arrival_queue)
        if other.departure_queue:
            extra_departure.extend(other.departure_queue)
    if extra_arrival:
        merged.arrival_queue = (merged.arrival_queue or []) + extra_arrival
    if extra_departure:
        merged.departure_queue = (merged.departure_queue or []) + extra_departure

    # session_id no payload vira "global" pra o frontend tratar especial
    # (ele compara com currentSessionIdRef antes de aceitar o state).
    merged.session_id = "all"

    await manager.broadcast_global(
        {
            "type": "state_update",
            "timestamp": merged.last_updated.isoformat(),
            "state": merged.model_dump(mode="json", by_alias=True),
        }
    )
