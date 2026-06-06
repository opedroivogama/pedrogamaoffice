"use client";

import { useAttentionStore } from "@/stores/attentionStore";

export type NotificationsTab = "history" | "commands";

/**
 * Barra de abas compartilhada entre `ToastHistoryModal` e `CommandBar`.
 * Clicar numa aba fecha o modal corrente e abre o outro — o usuário enxerga
 * como troca de aba dentro do mesmo modal porque ambos têm container/topo
 * idênticos.
 */
export function NotificationsTabs({
  active,
}: {
  active: NotificationsTab;
}): React.ReactNode {
  const openHistory = useAttentionStore((s) => s.openHistory);
  const openCommandBar = useAttentionStore((s) => s.openCommandBar);
  const closeHistory = useAttentionStore((s) => s.closeHistory);
  const closeCommandBar = useAttentionStore((s) => s.closeCommandBar);
  const historyCount = useAttentionStore((s) => s.toastHistory.length);

  function goto(tab: NotificationsTab) {
    if (tab === active) return;
    if (tab === "history") {
      closeCommandBar();
      openHistory();
    } else {
      closeHistory();
      openCommandBar();
    }
  }

  return (
    <div className="flex items-center gap-1 px-3 pt-2 border-b border-jp-divider-soft bg-jp-surface-1/60">
      <button
        type="button"
        onClick={() => goto("history")}
        className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-t border-b-2 transition-colors ${
          active === "history"
            ? "border-jp-gold text-jp-gold bg-jp-surface-2/40"
            : "border-transparent text-jp-fg-dim hover:text-jp-fg hover:bg-jp-surface-2/30"
        }`}
      >
        Histórico
        {historyCount > 0 && (
          <span className="ml-1.5 text-[9px] font-mono opacity-70">
            {historyCount > 99 ? "99+" : historyCount}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => goto("commands")}
        className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-t border-b-2 transition-colors ${
          active === "commands"
            ? "border-jp-gold text-jp-gold bg-jp-surface-2/40"
            : "border-transparent text-jp-fg-dim hover:text-jp-fg hover:bg-jp-surface-2/30"
        }`}
      >
        Comandos
      </button>
    </div>
  );
}
