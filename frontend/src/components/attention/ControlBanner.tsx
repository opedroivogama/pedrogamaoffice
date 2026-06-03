"use client";

import type { ReactNode } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Floating banner shown while the user is driving an entity with WASD/arrows.
 * Renders nothing when no one is being controlled.
 */
export default function ControlBanner(): ReactNode {
  const controlledEntityId = useGameStore((s) => s.controlledEntityId);
  const setControlledEntity = useGameStore((s) => s.setControlledEntity);
  const agents = useGameStore((s) => s.agents);
  const { t } = useTranslation();

  if (!controlledEntityId) return null;

  const labelById: Record<string, string> = {
    boss: "Claudius",
    pedro: "Pedro",
    estagiario: "Estagiário",
    "chrome-dummy": "Chrome Dummy",
  };
  const name =
    labelById[controlledEntityId] ??
    agents.get(controlledEntityId)?.name ??
    controlledEntityId;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-jp-surface-1/95 border border-jp-gold/60 rounded-lg shadow-2xl px-4 py-2 flex items-center gap-3 backdrop-blur-sm">
      <span className="text-xs text-jp-fg font-mono">
        {t("attention.control.banner", { name })}
      </span>
      <button
        type="button"
        onClick={() => setControlledEntity(null)}
        className="bg-jp-gold hover:bg-jp-gold-soft text-jp-surface-1 text-[10px] font-bold py-1 px-2 rounded transition-colors"
      >
        {t("attention.control.release")}
      </button>
    </div>
  );
}
