"use client";

import { useMemo } from "react";

import {
  useLayoutStore,
  type PanelId,
  type SidebarId,
} from "@/stores/layoutStore";
import {
  PANEL_REGISTRY,
  type PanelDefinition,
} from "@/components/sidebar/panelRegistry";

/**
 * MenuPanel — icon-grid switchboard for toggling other panels on/off.
 *
 * Reads PANEL_REGISTRY to enumerate every panel (except itself), groups them
 * by sidebar, and shows a clickable icon for each. Active panels (currently
 * present in their sidebar's `order` array) render in JP gold; inactive ones
 * are dimmed. Clicking flips visibility via `setPanelVisibility`.
 */
export function MenuPanel(): React.ReactNode {
  const left = useLayoutStore((s) => s.left);
  const right = useLayoutStore((s) => s.right);
  const setPanelVisibility = useLayoutStore((s) => s.setPanelVisibility);

  const grouped = useMemo(() => {
    const acc: Record<SidebarId, PanelDefinition[]> = {
      left: [],
      right: [],
    };
    for (const def of Object.values(PANEL_REGISTRY)) {
      if (def.id === "menu") continue; // never list itself
      acc[def.sidebar].push(def);
    }
    return acc;
  }, []);

  const activeSet = useMemo(() => {
    const set = new Set<PanelId>();
    for (const id of left.order) set.add(id);
    for (const id of right.order) set.add(id);
    return set;
  }, [left.order, right.order]);

  return (
    <div className="flex flex-col gap-3 p-3">
      {(["left", "right"] as SidebarId[]).map((sidebar) => (
        <section key={sidebar} className="flex flex-col gap-2">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-jp-fg-dim">
            {sidebar === "left" ? "Esquerda" : "Direita"}
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {grouped[sidebar].map((def) => {
              const Icon = def.icon;
              const isActive = activeSet.has(def.id);
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() =>
                    setPanelVisibility(def.sidebar, def.id, !isActive)
                  }
                  className={`group flex flex-col items-center justify-center gap-1 rounded-md border p-2 transition-all ${
                    isActive
                      ? "border-jp-gold bg-jp-gold/10 text-jp-gold"
                      : "border-jp-divider-soft bg-jp-surface-2/40 text-jp-fg-dim hover:border-jp-gold/50 hover:text-jp-fg-muted"
                  }`}
                  title={`${isActive ? "Ocultar" : "Mostrar"} ${def.title}`}
                  aria-pressed={isActive}
                >
                  <Icon size={18} />
                  <span className="text-[9px] font-bold uppercase tracking-wide truncate w-full text-center">
                    {def.title}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
