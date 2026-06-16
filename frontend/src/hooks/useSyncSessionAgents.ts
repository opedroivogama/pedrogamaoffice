"use client";

import { useEffect } from "react";

import { CHAIRS } from "@/constants/chairs";
import type { Session } from "@/hooks/useSessions";
import { agentMachineService } from "@/machines/agentMachineService";
import { useGameStore } from "@/stores/gameStore";
import type { Agent as BackendAgent } from "@/types";

const SESSION_AGENT_PREFIX = "agent_session_";

// Chairs 0–7 are the open-floor desks; index 8 = Claudius (boss), 9 = Pedro.
// Session agents always sit in 0–7.
const SESSION_DESK_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];

/** Tamanho máximo de texto exibido no bubble do cobre. Acima disso vira
 *  parede de markdown e cobre o canvas inteiro (Pedro 2026-06-09). 40 é o
 *  ponto que cabe um nome de ferramenta MCP truncado, mas força respostas
 *  longas a virarem stub. */
const COBRE_BUBBLE_MAX_CHARS = 40;

/** Transforma o texto cru de `session.currentBubble` no formato compacto
 *  "terceira via": etiqueta técnica do que a sessão está fazendo, NÃO
 *  transcrição da fala do Claude. Tira markdown, colapsa whitespace,
 *  capa em N chars. Retorna `null` se sobrar string vazia (evita balão
 *  fantasma). */
function sanitizeCobreBubbleText(raw: string): string | null {
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, "") // blocos de código inteiros somem
    .replace(/^#+\s+/gm, "") // headers ## ###
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold**
    .replace(/\*([^*]+)\*/g, "$1") // *italic*
    .replace(/`([^`]+)`/g, "$1") // `inline code`
    .replace(/^\s*[-*+]\s+/gm, "") // bullets
    .replace(/^\s*\d+\.\s+/gm, "") // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links [text](url) -> text
    .replace(/\s+/g, " ") // colapsa whitespace + newlines
    .trim();
  if (!cleaned) return null;
  if (cleaned.length <= COBRE_BUBBLE_MAX_CHARS) return cleaned;
  return cleaned.slice(0, COBRE_BUBBLE_MAX_CHARS - 1) + "…";
}

/** Infere um emoji a partir do texto do bubble do cobre quando o backend
 *  não manda ícone explícito. Regra do Pedro (2026-06-09): cobre SEMPRE
 *  tem ícone, mesmo que esteja "falando prosa". Permite scan-rápido sem
 *  ler texto. Ordem importa — patterns mais específicos primeiro. */
function inferCobreBubbleIcon(text: string): string {
  // Tool calls específicos (case-insensitive, substring matching)
  const t = text.toLowerCase();
  if (/^mcp__|\bmcp__/i.test(text)) return "🔌"; // MCP server tool
  if (/\bedit\b|\beditar\b|\bediting\b/i.test(text)) return "✏️";
  if (/\bwrite\b|\bwriting\b|\bescrevend/i.test(text)) return "📝";
  if (/\bread\b|\breading\b|\blendo\b/i.test(text)) return "📖";
  if (/\bbash\b|\bshell\b|\bcommand\b|\$\s/i.test(text)) return "⌨️";
  if (/\bgrep\b|\bglob\b|\bsearch\b|\bbuscando\b/i.test(text)) return "🔍";
  if (/\bweb\s?fetch\b|\bweb\s?search\b|\bcurl\b|\bhttp/i.test(text))
    return "🌐";
  if (/\btask\b|\bagent\b|\bsubagent\b|\bdelegando\b/i.test(text)) return "🤝";
  if (/\bgit\b|\bcommit\b|\bbranch\b|\bpush\b/i.test(text)) return "🌿";
  if (/\btest\b|\bpytest\b|\bnpm\s+test\b/i.test(text)) return "🧪";
  if (/\bpensand|thinking|considerando/i.test(t)) return "💭";
  // Prosa: parece resposta natural (tem espaços, pontuação típica de fala)
  if (/[.!?…]\s|^\w+\s+\w+/.test(text)) return "💬";
  // Fallback genérico — algo está rolando
  return "⚙️";
}

/**
 * Spawn one copper sprite per active session — INCLUDING a sessão focada.
 *
 * Modelo de organograma (Pedro 2026-06-08): Pedro e Claudius são avatares
 * fixos de operação do painel. Cada terminal Claude vira um cobre sentado
 * mostrando seu estado. A sessão focada NÃO some — Claudius é quem fala
 * com Pedro por ela ("porta-voz da sessão atual"), e o cobre dela continua
 * sentado em silêncio mostrando o estado de execução.
 *
 * - Cada sessão ocupa a próxima mesa livre (0–7).
 * - Sprites sentados (isTyping=true → crop de cintura pra cima).
 * - Quando uma sessão sai do active list, o agente é removido.
 *
 * `currentSessionId` é mantido na assinatura porque outros sinks ainda usam,
 * mas aqui dentro NÃO filtra mais — todas as sessões ativas viram cobre.
 */
export function useSyncSessionAgents(
  sessions: Session[],
  _currentSessionId: string,
): void {
  useEffect(() => {
    const activeOthers = sessions.filter(
      (s) => s.status === "active" && !s.archivedAt,
    );
    const desiredIds = new Set(
      activeOthers.map((s) => `${SESSION_AGENT_PREFIX}${s.id}`),
    );

    // Despawn session-agents whose sessions are gone.
    // Pedro 2026-06-09: ANTES chamávamos triggerDeparture, que inicia a
    // animação de "andar até o elevador". Pra cobre de sessão essa
    // animação não faz sentido (não é boss real) e várias vezes travava
    // — o cobre ficava plantado mesmo depois da sessão ser desativada.
    // Agora: REMOVE imediato no actor XState + removeAgent direto no
    // gameStore. O canvas atualiza no próximo frame.
    const storeForDespawn = useGameStore.getState();
    for (const existingId of agentMachineService.getActiveAgentIds()) {
      if (
        existingId.startsWith(SESSION_AGENT_PREFIX) &&
        !desiredIds.has(existingId)
      ) {
        agentMachineService.triggerDeparture(existingId);
        storeForDespawn.removeAgent(existingId);
      }
    }

    // Snapshot of which desks are already occupied by *someone* (Pedro,
    // Claudius, other session-agents). Indexes 0–7 only.
    const store = useGameStore.getState();
    const occupied = new Set<number>();
    for (const seat of store.entitySeats.values()) {
      for (const idx of SESSION_DESK_INDICES) {
        const c = CHAIRS[idx];
        if (
          c &&
          Math.abs(c.x - seat.x) < 2 &&
          Math.abs(c.y - seat.y) < 2
        ) {
          occupied.add(idx);
          break;
        }
      }
    }
    // Also mark desks already held by existing session-agents this tick.
    for (const agent of store.agents.values()) {
      if (agent.desk !== null && agent.desk !== undefined) {
        occupied.add(agent.desk - 1);
      }
    }

    for (const session of activeOthers) {
      const agentId = `${SESSION_AGENT_PREFIX}${session.id}`;
      const alreadyExists = agentMachineService.hasAgent(agentId);

      if (!alreadyExists) {
        // Find the next free desk in 0–7.
        let chosenIdx = -1;
        for (const idx of SESSION_DESK_INDICES) {
          if (!occupied.has(idx)) {
            chosenIdx = idx;
            break;
          }
        }
        if (chosenIdx === -1) continue;
        occupied.add(chosenIdx);

        const chair = CHAIRS[chosenIdx];
        if (!chair) continue;

        // Derivação do nome legível (Pedro 2026-06-09): se a sessão não
        // tem displayName e projectName veio do path codificado ("C--Users-
        // Pedro-..."), preferimos extrair a última pasta de projectRoot.
        // Cobre sem displayName mas em pasta `casa-de-maquinas/` vira
        // "casa-de-maquinas" em vez de "C--Users-Pedro-...".
        let rawName: string;
        if (session.displayName) {
          rawName = session.displayName;
        } else if (session.projectRoot) {
          const parts = session.projectRoot
            .replace(/\\/g, "/")
            .split("/")
            .filter(Boolean);
          rawName = parts[parts.length - 1] ?? session.projectName ?? session.id.slice(0, 8);
        } else {
          rawName = session.projectName ?? session.id.slice(0, 8);
        }
        // Trunca em 15 chars + "…" pra não poluir o canvas — nomes longos
        // tipo "Add new view to display radio screen content" viravam
        // banners enormes em cima de cada mesa (Pedro 2026-06-08).
        const name = rawName.length > 15 ? rawName.slice(0, 15) + "…" : rawName;

        // Spawn EM PÉ atrás da mesa (Pedro 2026-06-08: "atrás da mesa e
        // na frente da cadeira"). Posição na cadeira mesmo (chair.y) — o
        // sprite 240px alto se estende pra CIMA do anchor, então o tronco
        // e a cabeça aparecem acima da mesa enquanto o tampo cobre só os
        // pés/canela. O zIndex (definido em OfficeGame) cai entre cadeira
        // (desk.y+90) e tampo (desk.y+95) pra mesa cobrir as pernas e a
        // cadeira ficar atrás. [[sprite_sem_perna_so_em_cadeira]]
        const spawnY = chair.y + 30;

        // CRÍTICO: precisa rodar `addAgent` ANTES do `spawnAgent` do XState
        // service. O `updateAgentPosition` que o service chama internamente é
        // no-op se o agente não estiver no map do gameStore. Sem essa linha,
        // o actor existe internamente mas nada renderiza no canvas.
        const fakeAgent: BackendAgent = {
          id: agentId,
          name,
          color: "#B8972A", // dourado JP — apenas fallback; sprite cobre cobre
          number: chosenIdx,
          state: "working",
          desk: chosenIdx + 1,
        };
        store.addAgent(fakeAgent, { x: chair.x, y: spawnY });

        agentMachineService.spawnAgent(
          agentId,
          name,
          chosenIdx + 1, // service uses 1-based desk numbers
          { x: chair.x, y: spawnY },
          { skipArrival: true, backendState: "working" },
        );

        // spawnAtDesk dentro do service chama updateAgentPosition com
        // getDeskPosition(desk) — y≈432 pra row 0 — sobrescrevendo nosso
        // spawnY de chair.y+80. Forçamos de volta aqui pra o cobre nascer
        // EM PÉ na frente da mesa, não na cadeira. Pedro 2026-06-08.
        store.updateAgentPosition(agentId, { x: chair.x, y: spawnY });
        store.updateAgentTarget(agentId, { x: chair.x, y: spawnY });
      }

      // Status badge persistente acima da cabeça (Pedro 2026-06-09).
      // Antes o "🔔 te esperando" era um bubble — quando Claude falava algo
      // novo, o bubble da fala sobrescrevia o badge e Pedro não via mais o
      // sinal de "preciso da sua atenção". Agora vive numa layer dedicada
      // (statusIcon) que NÃO é mexida pelo sistema de bubble.
      //
      // 2 origens de status:
      //   🔔 = backend disse `awaitingInput=true` (notification/waiting/stop)
      //   ⚠️ = heurística stale: sessão não recebeu evento novo há > 30s e
      //        tem bubble congelada. Pega casos onde o hook nunca disparou
      //        notification (network, timing, versão velha do Claude Code).
      const STALE_THRESHOLD_MS = 30_000;
      const updatedMs = new Date(session.updatedAt).getTime();
      const isStale =
        !Number.isNaN(updatedMs) &&
        Date.now() - updatedMs > STALE_THRESHOLD_MS &&
        !!session.currentBubble?.text;
      const statusIcon: string | null = session.awaitingInput
        ? "🔔"
        : isStale
          ? "⚠️"
          : null;
      store.setAgentStatusIcon(agentId, statusIcon);

      // 🔔 (awaitingInput): tenta silenciar a bubble — sinal exclusivo.
      // Mas se bubble "furar" o clear (race entre poll do backend e
      // clearBubbles local), o badge ainda sobrescreve visualmente porque
      // o render do badge no OfficeGame fica posicionado SOBRE a bubble
      // (y=-90, mesma faixa do bubble) e DEPOIS no DOM (z-order vence).
      // ⚠️ stale: NÃO silencia — bubble ali é evidência útil do contexto.
      if (session.awaitingInput) {
        store.clearBubbles(agentId);
        continue;
      }

      // Terceira via (Pedro 2026-06-09): o cobre não "fala" — ele exibe uma
      // ETIQUETA TÉCNICA curta do que está fazendo. O backend manda o texto
      // cru do boss_bubble da sessão (pode ser tool call OU resposta longa
      // do assistant). A gente sanitiza + capa em 40 chars antes de mostrar:
      // tool names ficam legíveis ("mcp__notion__create-page"), respostas
      // longas viram stub ("Beleza, vou começar pelo…"). NÃO é pra ler a
      // conversa pelo painel — é pra ter scan rápido de "o que tá rolando".
      const current = session.currentBubble;
      const compactText = current?.text
        ? sanitizeCobreBubbleText(current.text)
        : null;
      if (compactText) {
        if (!store.hasBubbleText(agentId, compactText)) {
          // Sempre tem ícone: usa o do backend se vier, senão infere do texto.
          // Regra: cobre nunca aparece "nu" (Pedro 2026-06-09).
          const icon = current!.icon ?? inferCobreBubbleIcon(compactText);
          store.enqueueBubble(
            agentId,
            {
              type: current!.type ?? "thought",
              text: compactText,
              icon,
              // Persistente porque o poll é só a cada 5s; sem isso o balão
              // pisca e some entre ticks. Substituído na próxima mudança.
              persistent: true,
            },
            { immediate: true },
          );
        }
      } else if (store.agents.get(agentId)?.bubble.content) {
        // Sem texto novo (sessão idle ou backend não mandou bubble): limpa
        // o balão anterior pra cobre não ficar congelado com label antiga.
        store.clearBubbles(agentId);
      }
    }
  }, [sessions]);
}
