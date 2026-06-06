/**
 * WebSocket Event Handler
 *
 * Connects to the backend WebSocket and dispatches events to the state machine.
 * Handles agent additions/removals and state reconciliation.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAttentionStore } from "@/stores/attentionStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { agentMachineService } from "@/machines/agentMachineService";
import {
  getNextSpawnPosition,
  getDeskPosition,
  getQueuePosition,
  resetSpawnIndex,
} from "@/systems/queuePositions";
import type { GameState, WebSocketMessage, Position, EventType } from "@/types";

// ============================================================================
// TYPES
// ============================================================================

interface UseWebSocketEventsOptions {
  sessionId: string;
  /** Display name da sessão atual — usado nos toasts pra identificar de onde
   *  veio o evento ("Claude terminou · <sessionLabel>"). */
  sessionLabel?: string | null;
  enabled?: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function useWebSocketEvents({
  sessionId,
  sessionLabel,
  enabled = true,
}: UseWebSocketEventsOptions): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const processedAgentsRef = useRef<Set<string>>(new Set());

  // Connection ID to track which connection is current (prevents stale onclose handlers)
  const connectionIdRef = useRef(0);

  // Track typing start times and pending timeouts for minimum typing duration (500ms)
  const typingStartTimesRef = useRef<Map<string, number>>(new Map());
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const MIN_TYPING_DURATION_MS = 500;

  // Store actions - use getState() for stable references
  const setConnected = useGameStore.getState().setConnected;
  const setSessionId = useGameStore.getState().setSessionId;
  const setGitStatus = useGameStore.getState().setGitStatus;
  const addEventLog = useGameStore.getState().addEventLog;
  const enqueueBubble = useGameStore.getState().enqueueBubble;

  // Track the current session ID for message validation
  const currentSessionIdRef = useRef(sessionId);
  currentSessionIdRef.current = sessionId;
  // Mantém o display name corrente pro toast saber QUAL sessão terminou.
  const currentSessionLabelRef = useRef(sessionLabel ?? null);
  currentSessionLabelRef.current = sessionLabel ?? null;

  // Track whether initial queue sync has been done for this session
  // (prevents backend queue state from overwriting frontend's animated queue)
  const initialQueueSyncDoneRef = useRef<string | null>(null);

  // Track last seen bubble text from backend per entity to prevent re-enqueueing
  // after bubble clears from display
  const lastSeenBubbleTextRef = useRef<Map<string, string>>(new Map());

  // Handle incoming state update
  const handleStateUpdate = useCallback(
    (state: GameState) => {
      // Global feed (/ws/all) sempre passa, regardless of session ref.
      // Antes era um filtro estrito por sessionId — quebrava a agregação.
      if (
        state.sessionId !== "all" &&
        state.sessionId !== currentSessionIdRef.current
      ) {
        return;
      }

      const store = useGameStore.getState();
      const currentAgentIds = new Set(store.agents.keys());
      const backendAgentIds = new Set(state.agents.map((a) => a.id));

      // Detect new agents (arrivals)
      for (const backendAgent of state.agents) {
        if (
          !currentAgentIds.has(backendAgent.id) &&
          !processedAgentsRef.current.has(backendAgent.id)
        ) {
          processedAgentsRef.current.add(backendAgent.id);

          // Determine agent's location for mid-session join
          // There are three cases:
          // 1. Agent in arrival_queue with ARRIVING state → still arriving (spawn from elevator)
          // 2. Agent in departure_queue with WAITING state → at departure queue position
          // 3. Agent with WORKING state, not in queues → at their desk
          const isInArrivalQueue =
            state.arrivalQueue?.includes(backendAgent.id) ?? false;
          const isInDepartureQueue =
            state.departureQueue?.includes(backendAgent.id) ?? false;
          const arrivalQueueIndex =
            state.arrivalQueue?.indexOf(backendAgent.id) ?? -1;
          const departureQueueIndex =
            state.departureQueue?.indexOf(backendAgent.id) ?? -1;

          let spawnPosition: Position;
          let skipArrival = false;

          // Determine spawn options based on queue/desk state
          let queueType: "arrival" | "departure" | undefined;
          let queueIndex: number | undefined;

          if (backendAgent.state === "arriving") {
            // Agent is still arriving - spawn from elevator
            spawnPosition = getNextSpawnPosition();
          } else if (isInArrivalQueue) {
            // Agent is in arrival queue (not arriving) - spawn at their queue position
            // Queue position 0 = ready spot (A0), position 1+ = waiting spots
            const queuePosition = getQueuePosition(
              "arrival",
              arrivalQueueIndex + 1,
            );
            spawnPosition = queuePosition ?? getNextSpawnPosition();
            skipArrival = true;
            queueType = "arrival";
            queueIndex = arrivalQueueIndex;
          } else if (isInDepartureQueue) {
            // Agent is in departure queue - spawn at their queue position
            // Queue position 0 = ready spot (D0), position 1+ = waiting spots
            const queuePosition = getQueuePosition(
              "departure",
              departureQueueIndex + 1,
            );
            spawnPosition =
              queuePosition ?? getDeskPosition(backendAgent.desk ?? 1);
            skipArrival = true;
            queueType = "departure";
            queueIndex = departureQueueIndex;
          } else if (backendAgent.desk) {
            // Agent is at their desk working
            spawnPosition = getDeskPosition(backendAgent.desk);
            skipArrival = true;
          } else {
            // Fallback - spawn from elevator
            spawnPosition = getNextSpawnPosition();
          }

          // Add to store first
          store.addAgent(backendAgent, spawnPosition);

          // Spawn state machine with backend state for mid-session handling
          agentMachineService.spawnAgent(
            backendAgent.id,
            backendAgent.name ?? null,
            backendAgent.desk ?? null,
            spawnPosition,
            {
              backendState: backendAgent.state,
              skipArrival,
              queueType,
              queueIndex,
            },
          );

          // If agent has a bubble and is at desk/queue, enqueue it immediately
          if (skipArrival && backendAgent.bubble) {
            enqueueBubble(backendAgent.id, backendAgent.bubble);
          }
        } else if (currentAgentIds.has(backendAgent.id)) {
          // Update existing agent's backend state, name, and task
          // (name and task may have been enriched by AI after initial spawn)
          store.updateAgentMeta(backendAgent.id, {
            backendState: backendAgent.state,
            name: backendAgent.name ?? null,
            currentTask: backendAgent.currentTask ?? null,
          });

          // Enqueue bubbles for agents who are at their desk working
          // Only show bubbles when agent is at desk (phase === "idle")
          // This prevents showing tool calls during arrival/departure animations
          const agent = store.agents.get(backendAgent.id);
          const isAtDesk = agent?.phase === "idle";

          if (backendAgent.bubble && isAtDesk) {
            const bubbleText = backendAgent.bubble.text;
            const lastSeen = lastSeenBubbleTextRef.current.get(backendAgent.id);
            // Only enqueue if backend sent a NEW bubble text (not the same as last time)
            if (bubbleText !== lastSeen) {
              lastSeenBubbleTextRef.current.set(backendAgent.id, bubbleText);
              if (!store.hasBubbleText(backendAgent.id, bubbleText)) {
                enqueueBubble(backendAgent.id, backendAgent.bubble);
              }
            }
          }
        }
      }

      // Detect removed agents (departures)
      for (const agentId of currentAgentIds) {
        if (!backendAgentIds.has(agentId)) {
          const agent = store.agents.get(agentId);
          if (!agent) continue;

          if (agent.phase === "idle") {
            agentMachineService.triggerDeparture(agentId);
          } else {
            // Backend removed the agent before its arrival animation reached
            // the desk. Queue the departure so it fires once the agent is
            // idle, instead of waiting for the next state-update.
            agentMachineService.markPendingDeparture(agentId);
          }
        }
      }

      // Update boss state
      store.updateBossBackendState(state.boss.state);
      store.updateBossTask(state.boss.currentTask ?? null);

      // Enqueue boss bubble if present.
      // Eco-killer: se o texto bater com o último balão do Pedro (= o
      // prompt que ele acabou de mandar), ignora. Claude não precisa
      // repetir o que Pedro acabou de falar ao vivo — bug visual antigo
      // onde a fala do user vazava na boca do Claude.
      if (state.boss.bubble) {
        const bubbleText = state.boss.bubble.text;
        const pedroBubble = store.userAvatarBubbles.get("pedro") ?? "";
        const isPedroEcho =
          pedroBubble.length > 0 &&
          (bubbleText === pedroBubble ||
            bubbleText.startsWith(pedroBubble.slice(0, 80)) ||
            pedroBubble.startsWith(bubbleText.slice(0, 80)));
        if (isPedroEcho) {
          lastSeenBubbleTextRef.current.set("boss", bubbleText);
        } else {
          const lastSeen = lastSeenBubbleTextRef.current.get("boss");
          if (bubbleText !== lastSeen) {
            lastSeenBubbleTextRef.current.set("boss", bubbleText);
            const alreadyHas = store.hasBubbleText("boss", bubbleText);
            if (!alreadyHas) {
              enqueueBubble("boss", state.boss.bubble);
            }
          }
        }
      }

      // Update office state
      store.setSessionId(state.sessionId);
      store.setDeskCount(state.office.deskCount ?? 8);
      // NOTE: elevatorState is NOT synced from backend - it's controlled by
      // the frontend's agent state machine for smooth animations
      store.setPhoneState(state.office.phoneState ?? "idle");

      // Sync queue state from backend (only on initial connection for mid-session joins)
      // After initial sync, frontend manages queue state based on agent state machine events
      if (
        (state.arrivalQueue || state.departureQueue) &&
        initialQueueSyncDoneRef.current !== state.sessionId
      ) {
        store.syncQueues(state.arrivalQueue ?? [], state.departureQueue ?? []);
        initialQueueSyncDoneRef.current = state.sessionId;
      }
      // Only update context utilization if explicitly provided (not null/undefined)
      // This prevents flip-flopping between actual values and 0
      if (
        state.office.contextUtilization !== null &&
        state.office.contextUtilization !== undefined
      ) {
        store.setContextUtilization(state.office.contextUtilization);
      }
      // Update safety sign counter
      if (
        state.office.toolUsesSinceCompaction !== null &&
        state.office.toolUsesSinceCompaction !== undefined
      ) {
        store.setToolUsesSinceCompaction(state.office.toolUsesSinceCompaction);
      }
      store.setTodos(state.todos ?? []);
      // Sync print report flag (triggers printer animation)
      store.setPrintReport(state.office.printReport ?? false);
      // Sync whiteboard data for multi-mode display
      if (state.whiteboardData) {
        store.setWhiteboardData(state.whiteboardData);
      }
      // Sync conversation history (user prompts + Claude responses)
      if (state.conversation) {
        store.setConversation(state.conversation);
      }
    },
    [enqueueBubble],
  );

  // Handle WebSocket messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        // Validate session ID for messages that include it (except session_deleted and global feed)
        if (
          message.type !== "session_deleted" &&
          message.type !== "reload" &&
          message.state?.sessionId &&
          message.state.sessionId !== "all" &&
          message.state.sessionId !== currentSessionIdRef.current
        ) {
          return;
        }

        switch (message.type) {
          case "state_update":
            if (message.state) {
              handleStateUpdate(message.state);
            }
            break;

          case "event":
            if (message.event) {
              addEventLog(message.event);

              // User submitted a prompt in the terminal — show it as Pedro
              // speaking to Claude. The bubble appears over the Pedro avatar
              // (see UserAvatar in OfficeGame), so the user sees themselves
              // giving the command before Claude's normal response animation
              // (phone ringing → working) kicks in.
              if (message.event.type === "user_prompt_submit") {
                const prompt =
                  message.event.detail?.prompt ??
                  message.event.summary.replace(/^User:\s*/, "");
                const text = prompt.trim();
                if (text) {
                  // Soft-cap so a wall of text doesn't render as a giant bubble.
                  // The UserAvatar bubble renders with its own larger maxChars
                  // override (see OfficeGame.tsx) so this 300 ceiling sticks.
                  const truncated =
                    text.length > 300 ? text.slice(0, 297) + "..." : text;
                  useGameStore
                    .getState()
                    .setUserAvatarBubble("pedro", truncated);
                }
              }

              // Clear processed agents on session_start to allow re-detection
              // This is needed when simulation re-runs with the same session ID and agent IDs
              if (message.event.type === "session_start") {
                processedAgentsRef.current.clear();
                lastSeenBubbleTextRef.current.clear();
                resetSpawnIndex();
              }

              // Toggle typing animation on tool use events with minimum duration
              if (
                message.event.type === "pre_tool_use" ||
                message.event.type === "post_tool_use"
              ) {
                const agentId = message.event.agentId;
                const typingKey = agentId || "boss";

                const setTyping = (typing: boolean) => {
                  // "main" is the main Claude agent (boss), not a subagent
                  if (!agentId || agentId === "boss" || agentId === "main") {
                    useGameStore.getState().setBossTyping(typing);
                  } else {
                    useGameStore.getState().setAgentTyping(agentId, typing);
                  }
                };

                if (message.event.type === "pre_tool_use") {
                  // Clear any pending typing-off timeout
                  const existingTimeout =
                    typingTimeoutsRef.current.get(typingKey);
                  if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    typingTimeoutsRef.current.delete(typingKey);
                  }
                  // Record start time and start typing
                  typingStartTimesRef.current.set(typingKey, Date.now());
                  setTyping(true);
                } else {
                  // post_tool_use - ensure minimum typing duration
                  const startTime = typingStartTimesRef.current.get(typingKey);
                  const elapsed = startTime
                    ? Date.now() - startTime
                    : MIN_TYPING_DURATION_MS;
                  const remaining = MIN_TYPING_DURATION_MS - elapsed;

                  if (remaining > 0) {
                    // Delay turning off typing to meet minimum duration
                    const timeout = setTimeout(() => {
                      setTyping(false);
                      typingTimeoutsRef.current.delete(typingKey);
                      typingStartTimesRef.current.delete(typingKey);
                    }, remaining);
                    typingTimeoutsRef.current.set(typingKey, timeout);
                  } else {
                    // Minimum duration already met, turn off immediately
                    setTyping(false);
                    typingStartTimesRef.current.delete(typingKey);
                  }
                }
              }

              // Trigger compaction animation on context_compaction event
              if (message.event.type === "context_compaction") {
                useGameStore.getState().triggerCompaction();
              }

              // Attention toasts - wire event processing into attention store
              // Check toast filter preferences before generating toasts
              const attentionEventTypes = new Set<EventType>([
                "permission_request",
                "error",
                "stop",
                "task_completed",
                "subagent_start",
                "background_task_notification",
              ]);
              if (attentionEventTypes.has(message.event.type as EventType)) {
                const prefs = usePreferencesStore.getState();
                const filterMap: Record<string, boolean> = {
                  permission_request: prefs.toastFilterPermission,
                  error: prefs.toastFilterError,
                  stop: prefs.toastFilterError,
                  task_completed: prefs.toastFilterTaskComplete,
                  subagent_start: prefs.toastFilterArrival,
                  background_task_notification: prefs.toastFilterArrival,
                };
                if (filterMap[message.event.type as string] !== false) {
                  useAttentionStore.getState().processEvent({
                    type: message.event.type as EventType,
                    agentId: message.event.agentId ?? null,
                    agentName: message.event.detail?.agentName ?? null,
                    sessionId: currentSessionIdRef.current,
                    sessionLabel: currentSessionLabelRef.current,
                    taskDescription:
                      message.event.detail?.taskDescription ?? null,
                    errorType: message.event.detail?.errorType ?? null,
                    message: message.event.detail?.message ?? null,
                  });
                }
              }
            }
            break;

          case "git_status":
            if (message.gitStatus) {
              setGitStatus(message.gitStatus);
            }
            break;

          case "boss_walk_to":
            if (typeof message.x === "number" && typeof message.y === "number") {
              useGameStore
                .getState()
                .setBossWalkTarget({ x: message.x, y: message.y });
            }
            break;

          case "reload":
            window.location.reload();
            break;

          case "session_deleted":
            // Session was deleted (possibly by another client)
            // Emit custom event for session list components to refetch
            window.dispatchEvent(
              new CustomEvent("session-deleted", {
                detail: { sessionId: message.session_id },
              }),
            );
            break;

          case "sessions_renamed":
            // Backend escaneou JSONL e detectou title novo (ex: /rename).
            // Dispara o mesmo refetch que o botão manual usa.
            window.dispatchEvent(new CustomEvent("sessions-refresh"));
            break;
        }
      } catch (error) {
        console.error("[WS] Failed to parse message:", error);
      }
    },
    [handleStateUpdate, addEventLog, setGitStatus],
  );

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!sessionId || useGameStore.getState().isReplaying) return;

    // Increment connection ID to invalidate any pending onclose handlers
    connectionIdRef.current++;
    const thisConnectionId = connectionIdRef.current;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear any pending reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL || `ws://${window.location.hostname}:8000`;
    // Sempre conecta no feed global: vê subagentes de TODAS as sessões
    // Claude Code rodando ao mesmo tempo (terminais, ChatPanel, etc.).
    // O sessionId continua sendo usado pra outras coisas (display name,
    // session-specific stores), mas o WS agora é unificado.
    const ws = new WebSocket(`${wsUrl}/ws/all`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Check if this connection is still current
      if (connectionIdRef.current !== thisConnectionId) {
        ws.close();
        return;
      }

      setConnected(true);
      setSessionId(sessionId);

      // Clear processed agents, bubble tracking, and reset spawn positions on reconnect
      processedAgentsRef.current.clear();
      lastSeenBubbleTextRef.current.clear();
      resetSpawnIndex();
    };

    ws.onmessage = (event) => {
      // Check if this connection is still current
      if (connectionIdRef.current !== thisConnectionId) {
        return;
      }
      handleMessage(event);
    };

    ws.onerror = () => {
      // Check if this connection is still current
      if (connectionIdRef.current !== thisConnectionId) {
        return;
      }
      // `WebSocket.onerror` always fires a blank Event — no useful fields.
      // The real cause shows up on `onclose` (code/reason) below, so we just
      // log the URL + readyState here for context and let onclose explain why.
      console.error(
        `[WS] Error connecting to ${ws.url} (readyState=${ws.readyState})`,
      );
    };

    ws.onclose = (event) => {
      // Check if this connection is still current - prevents stale handlers
      if (connectionIdRef.current !== thisConnectionId) {
        return;
      }

      // Surface the close code/reason. 1000 = clean close; 1006 = abnormal
      // (server unreachable, dropped, etc.); 1011 = backend exception;
      // 4xxx = app-defined (e.g. unknown sessionId from the WS handler).
      if (event.code !== 1000) {
        console.warn(
          `[WS] Closed code=${event.code} reason=${event.reason || "(none)"} wasClean=${event.wasClean}`,
        );
      }

      setConnected(false);

      // Attempt reconnection after 2 seconds if still enabled and same session
      if (enabled && sessionId === currentSessionIdRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          // Double-check we're still on the same session before reconnecting
          if (sessionId === currentSessionIdRef.current) {
            connect();
          }
        }, 2000);
      }
    };
  }, [sessionId, enabled, handleMessage, setConnected, setSessionId]);

  // Stabilize connect via ref: a re-rendered `connect` was triggering this
  // effect to tear down the WS before it finished opening, dropping the
  // /ws/all subscription and leaving the painel sprite-less. We still want
  // the latest `connect` to run, but only re-fire the effect when sessionId
  // or enabled actually change.
  const connectRef = useRef(connect);
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    const isReplaying = useGameStore.getState().isReplaying;
    if (!enabled || !sessionId || isReplaying) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    connectRef.current();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [sessionId, enabled]);
}

// ============================================================================
// FULL RESET HANDLER
// ============================================================================

/**
 * Perform a full reset of frontend state.
 * Called on reconnection or when switching sessions.
 */
export function resetFrontendState(): void {
  // Reset store (use resetForSessionSwitch to allow WebSocket reconnection)
  useGameStore.getState().resetForSessionSwitch();

  // Reset machine service
  agentMachineService.reset();

  // Reset spawn positions
  resetSpawnIndex();
}
