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

# State file (sobrevive a restart, evita reemissão).
STATE_FILE = Path(__file__).parent / ".jurischat_bridge_state.json"
STATE_VERSION = 2  # bump quando o shape mudar — força wipe ao carregar

# Default tuning.
POLL_INTERVAL_S = 10
MAX_SUBAGENTS = 5            # Cap visual: só os N mais recentes ficam na sala.
STALE_AFTER_S = 180          # 3min sem mensagem nova → subagente sai.
JURISCHAT_TIMEOUT_S = 15
VISUALIZER_TIMEOUT_S = 5

logger = logging.getLogger("jurischat_bridge")


# ---------------------------------------------------------------------------
# Channels — cada conversa do JurisChat é projetada em N salas do visualizer
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Channel:
    """Canal de saída no visualizer.

    Cada conversa ativa do JurisChat é projetada em N canais — cada um
    aterrissa numa sala diferente (definida em backend/floors.toml) e só faz
    spawn se o "atendente detectado" (IA, Gabriel, etc.) bater com o filtro.
    """

    session_id: str          # casa com `repos` da sala em floors.toml
    project_name: str        # idem (geralmente == session_id)
    agent_type: str
    handoff_message: str
    # Atendente exigido pra spawn. None = sempre (canal "clientes-ativos"),
    # senão tem que casar com o retorno de detect_attendant() — ex: "ia",
    # "gabriel". Se não bate, o canal emite stop pro subagente ativo (se
    # houver) e não cria novo.
    requires_attendant: str | None
    # (lead_label) -> agent_name visível
    name_template: str       # ex: "Recepção IA → {lead}" ou "{lead}"

    def agent_name(self, lead_label: str) -> str:
        return self.name_template.format(lead=lead_label)


CHANNELS: list[Channel] = [
    # Sala da IA Vanessa Recepção — só spawna se a IA realmente atende.
    Channel(
        session_id="comercial-recepcao-ia",
        project_name="comercial-recepcao-ia",
        agent_type="comercial_recepcao_ia",
        handoff_message="Passei para o time humano.",
        requires_attendant="ia",
        name_template="Recepção IA → {lead}",
    ),
    # Sala do Gabriel Carvalho — Head de Projetos/Performance (pós-venda).
    # Spawna quando a heurística identifica Gabriel atendendo o cliente.
    Channel(
        session_id="comercial-gabriel-projetos",
        project_name="comercial-gabriel-projetos",
        agent_type="comercial_gabriel_projetos",
        handoff_message="Conversa em standby.",
        requires_attendant="gabriel",
        name_template="Gabriel → {lead}",
    ),
    # Perspectiva "clientes" — quem está conversando agora, independente de
    # quem da empresa atende. Só sai quando a conversa fecha.
    Channel(
        session_id="clientes-ativos",
        project_name="clientes-ativos",
        agent_type="cliente_ativo",
        handoff_message="Conversa encerrada.",
        requires_attendant=None,
        name_template="{lead}",
    ),
]


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


def post_event(
    channel: Channel,
    event_type: str,
    data: dict[str, Any] | None = None,
    *,
    dry_run: bool = False,
) -> None:
    """POSTa um evento no /api/v1/events do backend do visualizer."""
    payload = {
        "event_type": event_type,
        "session_id": channel.session_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data or {},
    }
    if dry_run:
        logger.info(
            "[DRY %s] POST %s %s",
            channel.session_id,
            event_type,
            json.dumps(data or {}, ensure_ascii=False)[:200],
        )
        return
    try:
        r = requests.post(VISUALIZER_URL, json=payload, timeout=VISUALIZER_TIMEOUT_S)
        r.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Falha ao postar %s [%s]: %s", event_type, channel.session_id, exc)


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

# Personas humanas conhecidas — escaneamos o conteúdo das mensagens recentes
# em busca dessas assinaturas pra identificar QUEM está atendendo, não só
# "humano genérico". Ordem importa (mais específico primeiro). Adicionar
# Laura/Vanessa/Gabriela/Pedro aqui conforme as salas deles forem nascendo.
# Padrão: \b…\b pra evitar match parcial (ex: "Gabriel" não casar "Gabriela").
_NAMED_HANDLERS: list[tuple[str, re.Pattern[str]]] = [
    ("gabriel", re.compile(r"\bGabriel\s+Carvalho\b", re.IGNORECASE)),
]


def _identify_named_handler(messages: list[dict[str, Any]]) -> str | None:
    """Escaneia mensagens recentes em busca de assinatura de humano JP conhecido.

    Em grupos de WhatsApp, mensagens do time JP podem vir como `inbound` ou
    `outbound` dependendo de quem fala — então olhamos o conteúdo de TODAS as
    mensagens não-system das últimas 30. Retorna a persona key (ex: "gabriel")
    ou None se nenhum nome explícito for encontrado.
    """
    text_blob = "\n".join(
        (m.get("content") or "")
        for m in messages[-30:]
        if m.get("type") != "system"
    )
    for persona, pattern in _NAMED_HANDLERS:
        if pattern.search(text_blob):
            return persona
    return None


def detect_attendant(conv: dict[str, Any], messages: list[dict[str, Any]]) -> str:
    """Identifica quem está atendendo: 'ia', uma persona humana ('gabriel', …) ou 'human'.

    Ordem de prioridade:
      1. System messages explícitos de transferência (sinal mais forte).
      2. Metadado da conversa: `ai_agent_id` setado → IA.
      3. Conteúdo das mensagens recentes mencionando humano JP conhecido.
      4. Default conservador: se há outbound da empresa → IA (legado); senão → human.
    """
    # 1. Sinal mais forte: system messages
    for msg in reversed(messages):
        if msg.get("type") != "system":
            continue
        content = msg.get("content") or ""
        if _RE_TRANSFER_TO_HUMAN.search(content):
            return _identify_named_handler(messages) or "human"
        if _RE_TRANSFER_TO_IA.search(content):
            return "ia"

    # 2. Metadado: ai_agent_id setado significa IA configurada na conversa
    if conv.get("ai_agent_id"):
        return "ia"

    # 3. Sem IA atribuída — procurar nome humano conhecido no conteúdo
    named = _identify_named_handler(messages)
    if named:
        return named

    # 4. Default: se há outbound da empresa, mantém comportamento legado (IA);
    #    se a conversa é puramente inbound (grupo só de cliente falando), tratar
    #    como human pra NÃO encher a sala da IA com leads que ela nunca atendeu.
    has_outbound = any(m.get("direction") == "outbound" for m in messages)
    return "ia" if has_outbound else "human"


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
    """Estado por canal: { channel.session_id: { conv_id: ConvState } }."""

    by_channel: dict[str, dict[str, ConvState]] = field(default_factory=dict)

    def channel(self, channel: Channel) -> dict[str, ConvState]:
        return self.by_channel.setdefault(channel.session_id, {})

    def save(self) -> None:
        try:
            payload = {
                "version": STATE_VERSION,
                "channels": {
                    cid: {k: v.to_dict() for k, v in convs.items()}
                    for cid, convs in self.by_channel.items()
                },
            }
            STATE_FILE.write_text(
                json.dumps(payload, indent=2, ensure_ascii=False),
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
            if raw.get("version") != STATE_VERSION:
                logger.info(
                    "State em versão antiga (%s != %s) — começando do zero",
                    raw.get("version"),
                    STATE_VERSION,
                )
                return cls()
            return cls(
                by_channel={
                    cid: {k: ConvState.from_dict(d) for k, d in convs.items()}
                    for cid, convs in raw.get("channels", {}).items()
                }
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
    """Extrai um nome amigável pro lead/cliente a partir da conversa.

    JurisChat retorna `customer_name` no nível raiz (não num sub-objeto). Nomes
    de grupos do WhatsApp aparecem como "Grupo PRO", "Dr. Foo | Jurídico Pro" etc.
    Removemos sufixos comuns que o time adiciona pra ficar mais curto no balão.
    """
    name = conv.get("customer_name")
    if name:
        text = str(name).strip()
        for suffix in (" | Jurídico Pro", " | JurídicoPro", " | Juridico Pro", " | JP"):
            if text.endswith(suffix):
                text = text[: -len(suffix)].strip()
                break
        if text:
            return text

    phone = conv.get("customer_phone") or ""
    if "@g.us" in phone:
        # Grupo do WhatsApp — usa últimos 6 dígitos do ID pra diferenciar
        digits = phone.split("@", 1)[0]
        return f"Grupo {digits[-6:]}"
    if phone:
        return f"Lead {phone[-4:]}"
    return f"Conv {(conv.get('id') or '?')[:6]}"


def _process_channel(
    channel: Channel,
    state: BridgeState,
    conv_data: dict[str, dict[str, Any]],
    now: float,
    dry_run: bool,
) -> None:
    """Aplica a lógica de subagentes pra UM canal, dado o snapshot de conversas."""
    chan_state = state.channel(channel)
    active_now: set[str] = set()

    for conv_id, payload in conv_data.items():
        conv = payload["conv"]
        messages = payload["messages"]
        attendant = detect_attendant(conv, messages)

        cs = chan_state.get(conv_id)

        # Atendente não bate com o filtro do canal: encerra subagente ativo
        # (se houver) e pula. Canal "clientes-ativos" tem requires_attendant=None
        # e sempre passa adiante.
        if channel.requires_attendant and attendant != channel.requires_attendant:
            if cs and cs.agent_active:
                logger.info(
                    "[%s] atendente mudou (%s) em %s — encerrando",
                    channel.session_id, attendant, conv_id[:8],
                )
                post_event(
                    channel,
                    "subagent_stop",
                    {
                        "agent_id": conv_id,
                        "success": True,
                        "speech_content": {"agent": channel.handoff_message},
                    },
                    dry_run=dry_run,
                )
                cs.agent_active = False
                cs.last_activity_ts = now
            continue

        last_out = last_outbound_message(messages)
        last_in = last_inbound_message(messages)

        if cs is None:
            cs = chan_state.setdefault(conv_id, ConvState())
        cs.lead_label = _lead_label(conv)

        new_outbound = last_out and last_out.get("id") != cs.last_outbound_id
        new_inbound = last_in and last_in.get("id") != cs.last_inbound_id

        # Sem nenhuma mensagem ainda? Pula. Pro canal Clientes (sem filtro),
        # basta haver qualquer mensagem; pra canais com persona (IA, Gabriel),
        # exigimos um outbound (prova que o atendente disse algo).
        first_message = last_out or (last_in if channel.requires_attendant is None else None)
        if not cs.agent_active and not first_message:
            continue

        # Spawn subagente
        if not cs.agent_active:
            seed_msg = (last_out or last_in or {}).get("content")
            seed_role = "agent" if last_out else "boss"
            logger.info(
                "[%s] spawn %s (lead=%s, msg=%s)",
                channel.session_id, conv_id[:8], cs.lead_label,
                _truncate(seed_msg, 50),
            )
            post_event(
                channel,
                "subagent_start",
                {
                    "agent_id": conv_id,
                    "agent_name": channel.agent_name(cs.lead_label),
                    "agent_type": channel.agent_type,
                    "task_description": f"Atendendo {cs.lead_label}",
                    "speech_content": {seed_role: _truncate(seed_msg)},
                    "project_name": channel.project_name,
                    "preserve_agent_name": True,
                },
                dry_run=dry_run,
            )
            cs.agent_active = True
            if last_out:
                cs.last_outbound_id = last_out.get("id")
            if last_in:
                cs.last_inbound_id = last_in.get("id")
            cs.last_activity_ts = now
            active_now.add(conv_id)
            continue

        # Subagente já ativo — emitir balão a cada mensagem nova
        if new_outbound and last_out:
            post_event(
                channel,
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
                channel,
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

    # Cleanup desse canal: subagentes ativos que saíram da janela ou ficaram parados
    for conv_id, cs in list(chan_state.items()):
        if not cs.agent_active:
            continue
        stale = (now - cs.last_activity_ts) > STALE_AFTER_S
        dropped = conv_id not in active_now
        if stale or dropped:
            reason = "stale" if stale else "out-of-window"
            logger.info("[%s] encerra %s (%s)", channel.session_id, conv_id[:8], reason)
            post_event(
                channel,
                "subagent_stop",
                {
                    "agent_id": conv_id,
                    "success": True,
                    "speech_content": {"agent": "Conversa em standby."},
                },
                dry_run=dry_run,
            )
            cs.agent_active = False


def tick(state: BridgeState, *, max_subagents: int, dry_run: bool) -> None:
    """Um ciclo de polling — busca conversas uma vez, projeta em todos os canais."""
    try:
        convs = list_open_conversations(limit=max(20, max_subagents * 4))
    except JurisChatError as exc:
        logger.warning("Falha ao listar conversas: %s", exc)
        return

    now = time.time()
    convs_sorted = sorted(
        convs, key=lambda c: c.get("updated_at") or "", reverse=True
    )[:max_subagents]

    # Busca as mensagens uma vez por conversa, compartilha entre canais
    conv_data: dict[str, dict[str, Any]] = {}
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
        conv_data[conv_id] = {"conv": conv, "messages": messages}

    for channel in CHANNELS:
        _process_channel(channel, state, conv_data, now, dry_run)


def run(poll_interval: int, max_subagents: int, dry_run: bool) -> None:
    """Loop principal — emite em todos os CHANNELS."""
    state = BridgeState.load()

    for channel in CHANNELS:
        logger.info("session_start em %s", channel.session_id)
        post_event(
            channel,
            "session_start",
            {
                "project_name": channel.project_name,
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

    logger.info("Encerrando: session_end em cada canal")
    for channel in CHANNELS:
        post_event(channel, "session_end", dry_run=dry_run)
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
