"use client";

import { useEffect } from "react";
import { Trash2, X } from "lucide-react";
import { useAttentionStore, type AttentionToast } from "@/stores/attentionStore";
import { NotificationsTabs } from "./NotificationsTabs";

const LEVEL_COLOR: Record<
  AttentionToast["urgencyLevel"],
  { border: string; text: string; bg: string }
> = {
  critical: {
    border: "border-rose-500/50",
    text: "text-rose-300",
    bg: "bg-rose-500/10",
  },
  high: {
    border: "border-amber-500/50",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
  },
  low: {
    border: "border-emerald-500/40",
    text: "text-emerald-300",
    bg: "bg-emerald-500/5",
  },
  info: {
    border: "border-jp-divider-soft",
    text: "text-jp-fg-dim",
    bg: "bg-jp-surface-2/40",
  },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diffMs = now - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}m atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ToastHistoryModal(): React.ReactNode {
  const isOpen = useAttentionStore((s) => s.isHistoryOpen);
  const close = useAttentionStore((s) => s.closeHistory);
  const clear = useAttentionStore((s) => s.clearHistory);
  const history = useAttentionStore((s) => s.toastHistory);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 p-4 pt-16"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-full max-w-xl max-h-[80vh] flex flex-col rounded-lg border border-jp-gold/40 bg-jp-surface-1 shadow-2xl">
        {/* Abas */}
        <NotificationsTabs active="history" />
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-jp-divider-soft">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-jp-fg-dim uppercase tracking-wide">
              {history.length} {history.length === 1 ? "entrada" : "entradas"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm("Limpar histórico de notificações?")
                  ) {
                    clear();
                  }
                }}
                title="Limpar histórico"
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
              >
                <Trash2 size={12} />
                Limpar
              </button>
            )}
            <button
              type="button"
              onClick={close}
              title="Fechar (Esc)"
              className="p-1 text-jp-fg-dim hover:text-jp-fg rounded transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-grow overflow-y-auto">
          {history.length === 0 ? (
            <div className="p-8 text-center text-jp-fg-dim text-sm italic">
              Nenhuma notificação ainda. Conforme eventos chegarem, eles vão
              aparecer aqui.
            </div>
          ) : (
            <ul className="divide-y divide-jp-divider-soft">
              {history.map((t) => {
                const color =
                  LEVEL_COLOR[t.urgencyLevel] ?? LEVEL_COLOR.info;
                return (
                  <li
                    key={t.id}
                    className={`flex items-start gap-3 px-4 py-2.5 border-l-2 ${color.border} ${color.bg}`}
                  >
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className={`text-xs font-bold ${color.text} truncate`}
                        >
                          {t.title}
                        </span>
                        {t.agentName && (
                          <span className="text-[10px] text-jp-fg-dim truncate">
                            · {t.agentName}
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-[11px] text-jp-fg-muted truncate">
                          {t.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-jp-fg-dim font-mono">
                        <span>{formatTime(t.createdAt)}</span>
                        {t.sessionLabel && (
                          <>
                            <span>·</span>
                            <span className="truncate" title={t.sessionLabel}>
                              {t.sessionLabel}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
