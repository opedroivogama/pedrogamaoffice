"use client";

import { useEffect } from "react";

import { CHAIRS } from "@/constants/chairs";
import type { Session } from "@/hooks/useSessions";
import { agentMachineService } from "@/machines/agentMachineService";
import { useGameStore } from "@/stores/gameStore";

const SESSION_AGENT_PREFIX = "agent_session_";

// Chairs 0–7 are the open-floor desks; index 8 = Claudius (boss), 9 = Pedro.
// Session agents always sit in 0–7.
const SESSION_DESK_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Spawn one AI_SILVER sprite per active session (except the one the user
 * is currently focused on, which is represented by their own avatar).
 *
 * - Each session occupies the next free desk (0–7).
 * - Sprites sit (isTyping=true triggers the seated crop in AgentSprite).
 * - When a session leaves the active list, its agent is removed.
 *
 * Filtering by floor (so only sessions of the current floor render) is
 * intentionally NOT done here — that's the job of the render layer in
 * OfficeGame. This hook just keeps the agent set in sync with sessions.
 */
export function useSyncSessionAgents(
  sessions: Session[],
  currentSessionId: string,
): void {
  useEffect(() => {
    const activeOthers = sessions.filter(
      (s) =>
        s.status === "active" && s.id !== currentSessionId && !s.archivedAt,
    );
    const desiredIds = new Set(
      activeOthers.map((s) => `${SESSION_AGENT_PREFIX}${s.id}`),
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

    for (const session of activeOthers) {
      const agentId = `${SESSION_AGENT_PREFIX}${session.id}`;
      if (agentMachineService.hasAgent(agentId)) continue;

      // Find the next free desk in 0–7.
      let chosenIdx = -1;
      for (const idx of SESSION_DESK_INDICES) {
        if (!occupied.has(idx)) {
          chosenIdx = idx;
          break;
        }
      }
      if (chosenIdx === -1) {
        // All 8 desks taken — skip this session for now. (Volume 4-8 is
        // expected, but pathological 9+ active gets visually dropped.)
        continue;
      }
      occupied.add(chosenIdx);

      const chair = CHAIRS[chosenIdx];
      if (!chair) continue;

      const name =
        session.displayName ??
        session.projectName ??
        session.id.slice(0, 8);

      agentMachineService.spawnAgent(
        agentId,
        name,
        chosenIdx + 1, // service uses 1-based desk numbers
        { x: chair.x, y: chair.y },
        { skipArrival: true, backendState: "working" },
      );

      // Trigger the seated crop in AgentSprite. isTyping is the visual
      // trigger that crops to waist-up. Strict semantics are loose here —
      // it just means "sitting at the desk doing work".
      store.setAgentTyping(agentId, true);
    }
  }, [sessions, currentSessionId]);
}
