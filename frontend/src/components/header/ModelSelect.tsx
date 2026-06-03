"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import {
  CLAUDE_MODEL_OPTIONS,
  usePreferencesStore,
  type ClaudeModelId,
} from "@/stores/preferencesStore";

/**
 * Replaces the static "Opus 4.7" badge in the header with a dropdown that
 * lets Pedro pick which Claude model the panel is currently driving. The
 * selection is persisted via `preferencesStore` (localStorage + backend
 * prefs API), so it survives reloads and other panes can read the choice.
 */
export function ModelSelect(): ReactNode {
  const claudeModel = usePreferencesStore((s) => s.claudeModel);
  const setClaudeModel = usePreferencesStore((s) => s.setClaudeModel);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — same UX as the other header menus.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current =
    CLAUDE_MODEL_OPTIONS.find((m) => m.id === claudeModel) ??
    CLAUDE_MODEL_OPTIONS[0];

  const onPick = (id: ClaudeModelId) => {
    if (id !== claudeModel) {
      void setClaudeModel(id);
    }
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Selecionar modelo do Claude"
        className="text-xs font-mono font-normal px-2 py-0.5 bg-jp-surface-2 rounded text-jp-gold border border-jp-gold/40 hover:bg-jp-surface-3 hover:border-jp-gold/70 transition-colors inline-flex items-center gap-1"
      >
        {current.shortLabel}
        <ChevronDown
          size={11}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Modelos do Claude"
          className="absolute right-0 mt-1 z-50 min-w-[140px] bg-jp-surface-1 border border-jp-gold/40 rounded shadow-xl py-1 text-xs font-mono"
        >
          {CLAUDE_MODEL_OPTIONS.map((m) => {
            const selected = m.id === claudeModel;
            return (
              <li key={m.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => onPick(m.id)}
                  className={`w-full text-left px-3 py-1.5 hover:bg-jp-surface-2 transition-colors ${
                    selected ? "text-jp-gold font-bold" : "text-jp-fg-muted"
                  }`}
                >
                  {m.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
