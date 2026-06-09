"use client";

import { useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAttentionStore, selectFocusPopup } from "@/stores/attentionStore";
import { useGameStore, selectSessionId } from "@/stores/gameStore";
import { useTranslation } from "@/hooks/useTranslation";
import type { AgentAnimationState } from "@/stores/gameStore";

const POPUP_WIDTH = 260;
const POPUP_MARGIN = 16;

export default function AgentPopup(): ReactNode {
  const focusPopup = useAttentionStore(selectFocusPopup);
  const closeFocusPopup = useAttentionStore((s) => s.closeFocusPopup);
  const focusAgentTerminal = useAttentionStore((s) => s.focusAgentTerminal);
  const agents = useGameStore((s) => s.agents);
  const boss = useGameStore((s) => s.boss);
  const sessionId = useGameStore(selectSessionId);
  const setControlledEntity = useGameStore((s) => s.setControlledEntity);
  const { t } = useTranslation();

  const handleFocusTerminal = useCallback(() => {
    if (!focusPopup) return;
    // Cobres (agent_session_<sid>) precisam focar o TERMINAL DA SUA PRÓPRIA
    // sessão, não da sessão atualmente selecionada no painel. Sem isso o
    // botão tentava POST /sessions/{currentSessionId}/focus que pode ser
    // sim_session_123 ou outra sessão inexistente no DB → 404. Pedro
    // 2026-06-08.
    const isCopperAgent =
      focusPopup.agentId.startsWith("agent_session_");
    const targetSessionId = isCopperAgent
      ? focusPopup.agentId.slice("agent_session_".length)
      : sessionId;
    if (!targetSessionId) return;
    focusAgentTerminal(targetSessionId, focusPopup.agentId);
  }, [sessionId, focusAgentTerminal, focusPopup]);

  const handleTakeControl = useCallback(() => {
    if (!focusPopup) return;
    setControlledEntity(focusPopup.agentId);
    closeFocusPopup();
  }, [focusPopup, setControlledEntity, closeFocusPopup]);

  // Sessão Claude — encerra via archive (preserva .jsonl no
  // ~/.claude/projects/, mas o backend marca como archived e o painel
  // remove o cobre da mesa).
  const handleEndSession = useCallback(async () => {
    if (!focusPopup) return;
    const id = focusPopup.agentId;
    if (!id.startsWith("agent_session_")) return;
    const sid = id.slice("agent_session_".length);
    if (
      !window.confirm(
        `Finalizar sessão "${sid.slice(0, 8)}…"? O cobre vai sair da mesa. (O histórico em ~/.claude/projects/ é preservado.)`,
      )
    )
      return;
    try {
      await fetch(
        `http://localhost:8000/api/v1/sessions/${sid}/archive`,
        { method: "POST" },
      );
      window.dispatchEvent(new CustomEvent("sessions-refresh"));
    } catch {
      // Silent — botão Users do SessionsPanel é fallback.
    }
    closeFocusPopup();
  }, [focusPopup, closeFocusPopup]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeFocusPopup();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        // Cobres: Enter foca terminal. Outros: Enter assume controle.
        if (focusPopup?.agentId.startsWith("agent_session_")) {
          handleFocusTerminal();
        } else {
          handleTakeControl();
        }
      }
    },
    [closeFocusPopup, focusPopup, handleFocusTerminal, handleTakeControl],
  );

  useEffect(() => {
    if (focusPopup) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [focusPopup, handleKeyDown]);

  if (!focusPopup) return null;

  const isBoss = focusPopup.agentId === "boss";
  const isCopper = focusPopup.agentId.startsWith("agent_session_");
  const agent: AgentAnimationState | null = isBoss
    ? null
    : (agents.get(focusPopup.agentId) ?? null);

  // Viewport-clamped positioning
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = focusPopup.screenX + 20;
  let y = focusPopup.screenY - 60;
  if (x + POPUP_WIDTH > vw - POPUP_MARGIN)
    x = focusPopup.screenX - POPUP_WIDTH - 20;
  if (y + 200 > vh - POPUP_MARGIN) y = vh - 200 - POPUP_MARGIN;
  if (y < POPUP_MARGIN) y = POPUP_MARGIN;

  const displayName = isBoss ? "Boss" : (agent?.name ?? focusPopup.agentId);
  const displayColor = isBoss ? "#f59e0b" : (agent?.color ?? "#888");
  const displayState = isBoss
    ? boss.backendState
    : (agent?.backendState ?? "unknown");
  const displayTask = isBoss ? boss.currentTask : agent?.currentTask;
  const displayType = isBoss ? "lead" : (agent?.characterType ?? "subagent");
  const displayDesk = isBoss ? null : agent?.desk;

  const popup = (
    <div
      className="fixed inset-0 z-[90]"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeFocusPopup();
      }}
    >
      <div className="absolute inset-0" />
      <div
        className="absolute bg-jp-surface-1 border border-neutral-700 rounded-xl shadow-2xl p-4"
        style={{ left: x, top: y, width: POPUP_WIDTH }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: displayColor }}
          />
          <span className="text-white font-bold text-sm truncate flex-1">
            {displayName}
          </span>
          {displayDesk !== null && (
            <span className="text-neutral-500 text-[11px]">
              {t("attention.popup.desk")} #{displayDesk}
            </span>
          )}
        </div>

        <div className="text-[12px] text-neutral-400 space-y-1 mb-3">
          <div>
            <span className="text-neutral-600">
              {t("attention.popup.state")}:
            </span>{" "}
            {displayState}
          </div>
          {displayTask && (
            <div className="truncate">
              <span className="text-neutral-600">
                {t("attention.popup.task")}:
              </span>{" "}
              {displayTask}
            </div>
          )}
          <div>
            <span className="text-neutral-600">
              {t("attention.popup.type")}:
            </span>{" "}
            {displayType}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {isCopper ? (
            // Cobre = sessão Claude. Não dá pra controlar (não é um avatar
            // do painel). Opções: focar terminal nativo OU finalizar sessão.
            <>
              <button
                onClick={handleFocusTerminal}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
              >
                {t("attention.popup.focusTerminal")}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleEndSession}
                  className="flex-1 bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
                >
                  Finalizar sessão
                </button>
                <button
                  onClick={closeFocusPopup}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
                >
                  {t("attention.popup.close")}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={handleTakeControl}
                className="w-full bg-jp-gold hover:bg-jp-gold-soft text-jp-surface-1 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
              >
                {t("attention.popup.takeControl")}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleFocusTerminal}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
                >
                  {t("attention.popup.focusTerminal")}
                </button>
                <button
                  onClick={closeFocusPopup}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
                >
                  {t("attention.popup.close")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(popup, document.body);
}
