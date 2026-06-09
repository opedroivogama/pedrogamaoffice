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
    // DEBUG temporário (Pedro 2026-06-08): diagnóstico de cobres invisíveis.
    // Remover quando o problema for confirmado.
    // eslint-disable-next-line no-console
    console.log(
      "[useSyncSessionAgents] tick · sessions=%d · active=%d · desired=",
      sessions.length,
      activeOthers.length,
      Array.from(desiredIds).map((id) => id.slice(-12)),
    );

    // Despawn session-agents whose sessions are gone.
    for (const existingId of agentMachineService.getActiveAgentIds()) {
      if (
        existingId.startsWith(SESSION_AGENT_PREFIX) &&
        !desiredIds.has(existingId)
      ) {
        agentMachineService.triggerDeparture(existingId);
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

    const AWAITING_TEXT = "🔔 te esperando";

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
        if (chosenIdx === -1) {
          // eslint-disable-next-line no-console
          console.warn(
            "[useSyncSessionAgents] sem mesa livre pra sessão",
            session.id.slice(0, 8),
          );
          continue;
        }
        occupied.add(chosenIdx);

        const chair = CHAIRS[chosenIdx];
        if (!chair) continue;

        const rawName =
          session.displayName ??
          session.projectName ??
          session.id.slice(0, 8);
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

        // eslint-disable-next-line no-console
        console.log(
          "[useSyncSessionAgents] SPAWN cobre · sessão=%s · mesa=%d · pos=(%d,%d)",
          session.id.slice(0, 8),
          chosenIdx,
          chair.x,
          spawnY,
        );

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

      // "🔔 te esperando" bubble shows on agents whose Claude is waiting
      // for user input (notification/waiting events). Only enqueue if
      // not already showing — avoids re-enqueueing every 5s poll tick.
      // Waiting tem precedência sobre o bubble de ferramenta corrente.
      if (session.awaitingInput) {
        if (!store.hasBubbleText(agentId, AWAITING_TEXT)) {
          store.enqueueBubble(
            agentId,
            { type: "thought", text: AWAITING_TEXT, persistent: true },
            { immediate: true },
          );
        }
        continue;
      }

      // Limpa o "te esperando" assim que a sessão sai do waiting.
      if (store.hasBubbleText(agentId, AWAITING_TEXT)) {
        store.clearBubbles(agentId);
      }

      // Ícone de operação em cima do cobre: o backend expõe o boss_bubble
      // da state machine de cada sessão no campo `currentBubble`. Aqui a
      // gente espelha esse balão no cobre correspondente — sem isso o
      // cobre fica mudo enquanto a sessão trabalha. Pedro 2026-06-08.
      const current = session.currentBubble;
      if (current && current.text) {
        if (!store.hasBubbleText(agentId, current.text)) {
          store.enqueueBubble(
            agentId,
            {
              type: current.type ?? "thought",
              text: current.text,
              icon: current.icon ?? undefined,
              // Persistente porque o poll é só a cada 5s; sem isso o balão
              // pisca e some entre ticks. Substituído na próxima mudança.
              persistent: true,
            },
            { immediate: true },
          );
        }
      }
    }
  }, [sessions]);
}
