#!/usr/bin/env python3
"""Bridge JurisChat → escritório online (visualizer).

Faz polling na API HTTP do JurisChat e POSTa eventos no visualizer pra que a
IA "Vanessa - Recepção" (persona da recepção automatizada do WhatsApp) apareça
no chão Comercial trabalhando em tempo real.

⚠️ Atenção ao conflito de nomes: a IA chama "Vanessa - Recepção", mas existe
TAMBÉM uma Vanessa humana no time comercial (vendedora de tráfego). Por isso o
agent_name aqui é "Recepção IA", não "Vanessa". Ver memory/time_comercial.

Mapeamento conceitual:
  - Sessão fixa "comercial-recepcao-ia" = sala da IA no andar Comercial.
  - Cada conversa aberta com IA atendendo vira um subagente vivo.
  - Mensagem nova da IA = subagente "trabalha" (balão de fala com a mensagem).
  - Mensagem nova do lead = balão atualiza com a fala do lead.
  - Transferência pra humano = subagente "sai" (subagent_stop). Roteamento pra
    sala da pessoa que assumiu (Laura/Vanessa/Gabriela/Pedro) é trabalho futuro.
  - Conversa sem atividade por > STALE_AFTER_S = subagente "sai" também.

Uso:
  python scripts/bridges/jurischat_bridge.py
  python scripts/bridges/jurischat_bridge.py --poll 5 --max-subagents 8
  python scripts/bridges/jurischat_bridge.py --dry-run  # só loga, não posta
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import signal
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

VISUALIZER_URL = "http://localhost:8000/api/v1/events"

JURISCHAT_URL = "https://igwuaumcyjppnwlvfdoj.supabase.co/functions/v1/mcp-server"
JURISCHAT_TOKEN = "jcp_live_2dc1ccf89acd39d6b32bccc71afb42e7c8be4d2bbdc0e3b2"

# Source ID que casa com a sala "comercial-recepcao-ia" no andar Comercial
# (ver backend/floors.toml). Persona = IA "Vanessa - Recepção" no JurisChat —
# NÃO confundir com Vanessa humana (vendedora de tráfego); ver
# memory/time_comercial_juridicopro.md.
SESSION_ID = "comercial-recepcao-ia"
PROJECT_NAME = "comercial-recepcao-ia"

# State file (sobrevive a restart, evita reemissão).
STATE_FILE = Path(__file__).parent / ".jurischat_bridge_state.json"

# Default tuning.
POLL_INTERVAL_S = 10
MAX_SUBAGENTS = 5            # Cap visual: só os N mais recentes ficam na sala.
STALE_AFTER_S = 180          # 3min sem mensagem nova → subagente sai.
JURISCHAT_TIMEOUT_S = 15
VISUALIZER_TIMEOUT_S = 5

logger = logging.getLogger("jurischat_bridge")


# ---------------------------------------------------------------------------
# JurisChat client (JSON-RPC sobre HTTP)
# ---------------------------------------------------------------------------


class JurisChatError(RuntimeError):
    pass


def jurischat_call(tool: str, arguments: dict[str, Any]) -> Any:
    """Chama uma tool do MCP server do JurisChat.

    O response do server vem com `result.content[0].text` sendo uma string JSON
    encadeada — precisa de dois json.loads.
    """
    payload = {
        "jsonrpc": "2.0",
        "id": int(time.time() * 1000),
        "method": "tools/call",
        "params": {"name": tool, "arguments": arguments},
    }
    headers = {
        "Authorization": f"Bearer {JURISCHAT_TOKEN}",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(
            JURISCHAT_URL, json=payload, headers=headers, timeout=JURISCHAT_TIMEOUT_S
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise JurisChatError(f"HTTP error calling {tool}: {exc}") from exc

    body = resp.json()
    if "error" in body:
        raise JurisChatError(f"JSON-RPC error from {tool}: {body['error']}")

    try:
        text = body["result"]["content"][0]["text"]
        return json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        raise JurisChatError(f"Unexpected response shape from {tool}: {exc}") from exc


def list_open_conversations(limit: int = 20) -> list[dict[str, Any]]:
    data = jurischat_call("list_conversations", {"status": "open", "limit": limit})
    return data.get("conversations", [])


def get_conversation_messages(conv_id: str, limit: int = 10) -> dict[str, Any]:
    return jurischat_call(
        "get_conversation", {"conversation_id": conv_id, "message_limit": limit}
    )


# ---------------------------------------------------------------------------
# Visualizer client
# ---------------------------------------------------------------------------


def post_event(event_type: str, data: dict[str, Any] | None = None, *, dry_run: bool = False) -> None:
    """POSTa um evento no /api/v1/events do backend do visualizer."""
    payload = {
        "event_type": event_type,
        "session_id": SESSION_ID,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data or {},
    }
    if dry_run:
        logger.info("[DRY] POST %s %s", event_type, json.dumps(data or {}, ensure_ascii=False)[:200])
        return
    try:
        r = requests.post(VISUALIZER_URL, json=payload, timeout=VISUALIZER_TIMEOUT_S)
        r.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Falha ao postar %s: %s", event_type, exc)


# ---------------------------------------------------------------------------
# Detecção de atendente (IA vs. humano)
# ---------------------------------------------------------------------------

# Padrões pra reconhecer transferências nos system messages do JurisChat.
_RE_TRANSFER_TO_IA = re.compile(
    r"transferid[oa]\s+para.*\b(ia|vanessa|recep[cç][aã]o)", re.IGNORECASE
)
_RE_TRANSFER_TO_HUMAN = re.compile(
    r"transferid[oa]\s+para\s+(?!.*\b(ia|vanessa|recep[cç][aã]o)\b)", re.IGNORECASE
)


def detect_attendant(messages: list[dict[str, Any]]) -> str:
    """Retorna 'ia', 'human' ou 'unknown' baseado no último system event de transferência.

    Default = 'ia' (conversas costumam começar na IA Vanessa antes de qualquer
    transferência explícita).
    """
    for msg in reversed(messages):
        if msg.get("type") != "system":
            continue
        content = msg.get("content") or ""
        if _RE_TRANSFER_TO_HUMAN.search(content):
            return "human"
        if _RE_TRANSFER_TO_IA.search(content):
            return "ia"
    return "ia"


def last_outbound_message(messages: list[dict[str, Any]]) -> dict[str, Any] | None:
    for msg in reversed(messages):
        if msg.get("direction") == "outbound" and msg.get("type") != "system":
            return msg
    return None


def last_inbound_message(messages: list[dict[str, Any]]) -> dict[str, Any] | None:
    for msg in reversed(messages):
        if msg.get("direction") == "inbound" and msg.get("type") != "system":
            return msg
    return None


# ---------------------------------------------------------------------------
# State persistence
# ---------------------------------------------------------------------------


@dataclass
class ConvState:
    last_outbound_id: str | None = None
    last_inbound_id: str | None = None
    last_activity_ts: float = 0.0
    agent_active: bool = False
    lead_label: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "last_outbound_id": self.last_outbound_id,
            "last_inbound_id": self.last_inbound_id,
            "last_activity_ts": self.last_activity_ts,
            "agent_active": self.agent_active,
            "lead_label": self.lead_label,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "ConvState":
        return cls(
            last_outbound_id=d.get("last_outbound_id"),
            last_inbound_id=d.get("last_inbound_id"),
            last_activity_ts=float(d.get("last_activity_ts", 0.0)),
            agent_active=bool(d.get("agent_active", False)),
            lead_label=str(d.get("lead_label", "")),
        )


@dataclass
class BridgeState:
    conversations: dict[str, ConvState] = field(default_factory=dict)

    def save(self) -> None:
        try:
            STATE_FILE.write_text(
                json.dumps(
                    {cid: cs.to_dict() for cid, cs in self.conversations.items()},
                    indent=2,
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
        except OSError as exc:
            logger.warning("Falha ao salvar state: %s", exc)

    @classmethod
    def load(cls) -> "BridgeState":
        if not STATE_FILE.exists():
            return cls()
        try:
            raw = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            return cls(
                conversations={cid: ConvState.from_dict(d) for cid, d in raw.items()}
            )
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("State corrompido (%s) — começando do zero.", exc)
            return cls()


# ---------------------------------------------------------------------------
# Bridge principal
# ---------------------------------------------------------------------------


def _truncate(s: str | None, n: int = 140) -> str:
    if not s:
        return ""
    s = s.strip().replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"


def _lead_label(conv: dict[str, Any]) -> str:
    """Tenta extrair um nome/telefone amigável da conversa."""
    customer = conv.get("customer") or {}
    name = customer.get("name") or customer.get("display_name")
    phone = customer.get("phone") or conv.get("customer_phone")
    if name and phone:
        return f"{name} ({phone[-4:]})"
    if name:
        return str(name)
    if phone:
        return f"Lead {phone[-4:]}"
    return f"Conv {conv.get('id', '?')[:6]}"


def tick(state: BridgeState, *, max_subagents: int, dry_run: bool) -> None:
    """Um ciclo de polling."""
    try:
        convs = list_open_conversations(limit=max(20, max_subagents * 4))
    except JurisChatError as exc:
        logger.warning("Falha ao listar conversas: %s", exc)
        return

    now = time.time()
    active_now: set[str] = set()

    # Ordena por updated_at desc, pega só max_subagents
    convs_sorted = sorted(
        convs, key=lambda c: c.get("updated_at") or "", reverse=True
    )[:max_subagents]

    for conv in convs_sorted:
        conv_id = conv.get("id")
        if not conv_id:
            continue

        try:
            full = get_conversation_messages(conv_id, limit=10)
        except JurisChatError as exc:
            logger.warning("Falha ao buscar conv %s: %s", conv_id[:8], exc)
            continue

        messages = full.get("messages", [])
        if not messages:
            continue

        attendant = detect_attendant(messages)
        if attendant == "human":
            # Se estava com IA e virou humano, encerra subagente
            cs = state.conversations.get(conv_id)
            if cs and cs.agent_active:
                logger.info("Handoff humano em %s — encerrando subagente", conv_id[:8])
                post_event(
                    "subagent_stop",
                    {
                        "agent_id": conv_id,
                        "success": True,
                        "speech_content": {
                            "agent": "Passei para o time humano.",
                        },
                    },
                    dry_run=dry_run,
                )
                cs.agent_active = False
                cs.last_activity_ts = now
            continue

        last_out = last_outbound_message(messages)
        last_in = last_inbound_message(messages)

        cs = state.conversations.setdefault(conv_id, ConvState())
        cs.lead_label = _lead_label(conv)

        new_outbound = last_out and last_out.get("id") != cs.last_outbound_id
        new_inbound = last_in and last_in.get("id") != cs.last_inbound_id

        # Sem mensagem da IA ainda → conversa não vira subagente
        # (lead esperando resposta; nada pra mostrar na sala)
        if not cs.agent_active and not last_out:
            continue

        # Inicia subagente: primeira mensagem da IA detectada
        if not cs.agent_active and last_out:
            logger.info(
                "Spawn subagente %s (lead=%s, msg=%s)",
                conv_id[:8],
                cs.lead_label,
                _truncate(last_out.get("content"), 50),
            )
            post_event(
                "subagent_start",
                {
                    "agent_id": conv_id,
                    "agent_name": f"Recepção IA → {cs.lead_label}",
                    "agent_type": "comercial_recepcao_ia",
                    "task_description": f"Atendendo {cs.lead_label}",
                    "speech_content": {
                        "agent": _truncate(last_out.get("content")),
                    },
                    "project_name": PROJECT_NAME,
                },
                dry_run=dry_run,
            )
            cs.agent_active = True
            cs.last_outbound_id = last_out.get("id")
            if last_in:
                cs.last_inbound_id = last_in.get("id")
            cs.last_activity_ts = now
            active_now.add(conv_id)
            continue

        # Já ativo: emitir notification quando há mensagem nova (lead ou IA)
        if new_outbound and last_out:
            post_event(
                "notification",
                {
                    "agent_id": conv_id,
                    "notification_type": "ia_message",
                    "message": _truncate(last_out.get("content")),
                    "speech_content": {"agent": _truncate(last_out.get("content"))},
                },
                dry_run=dry_run,
            )
            cs.last_outbound_id = last_out.get("id")
            cs.last_activity_ts = now

        if new_inbound and last_in:
            post_event(
                "notification",
                {
                    "agent_id": conv_id,
                    "notification_type": "lead_message",
                    "message": _truncate(last_in.get("content")),
                    "speech_content": {"boss": _truncate(last_in.get("content"))},
                },
                dry_run=dry_run,
            )
            cs.last_inbound_id = last_in.get("id")
            cs.last_activity_ts = now

        active_now.add(conv_id)

    # Cleanup: subagentes ativos que sumiram da lista ou ficaram parados
    for conv_id, cs in list(state.conversations.items()):
        if not cs.agent_active:
            continue
        stale = (now - cs.last_activity_ts) > STALE_AFTER_S
        dropped = conv_id not in active_now
        if stale or dropped:
            reason = "stale" if stale else "out-of-window"
            logger.info("Encerra subagente %s (%s)", conv_id[:8], reason)
            post_event(
                "subagent_stop",
                {
                    "agent_id": conv_id,
                    "success": True,
                    "speech_content": {"agent": "Conversa em standby."},
                },
                dry_run=dry_run,
            )
            cs.agent_active = False


def run(poll_interval: int, max_subagents: int, dry_run: bool) -> None:
    """Loop principal."""
    state = BridgeState.load()

    logger.info("Iniciando session_start session=%s", SESSION_ID)
    post_event(
        "session_start",
        {
            "project_name": PROJECT_NAME,
            "working_dir": str(Path.cwd()),
        },
        dry_run=dry_run,
    )

    stop = {"flag": False}

    def _sig(_signum: int, _frame: Any) -> None:
        logger.info("Sinal recebido — encerrando")
        stop["flag"] = True

    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    while not stop["flag"]:
        try:
            tick(state, max_subagents=max_subagents, dry_run=dry_run)
            state.save()
        except Exception:
            logger.exception("Erro inesperado no tick — continuando")

        for _ in range(poll_interval):
            if stop["flag"]:
                break
            time.sleep(1)

    logger.info("Encerrando: enviando session_end")
    post_event("session_end", dry_run=dry_run)
    state.save()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--poll", type=int, default=POLL_INTERVAL_S, help="Intervalo de poll em segundos")
    parser.add_argument("--max-subagents", type=int, default=MAX_SUBAGENTS, help="Cap de subagentes simultâneos")
    parser.add_argument("--dry-run", action="store_true", help="Só loga, não posta no visualizer")
    parser.add_argument("--verbose", "-v", action="store_true", help="Log debug")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    try:
        run(poll_interval=args.poll, max_subagents=args.max_subagents, dry_run=args.dry_run)
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
