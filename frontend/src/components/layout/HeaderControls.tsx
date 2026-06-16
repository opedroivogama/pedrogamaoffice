"use client";

import {
  Activity,
  RefreshCw,
  Bug,
  Power,
  Trash2,
  HelpCircle,
  Settings,
  Bell,
  Map,
  Play,
  Square,
  MoreVertical,
  StickyNote,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAttentionStore, selectUnreadCount } from "@/stores/attentionStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useNotesStore } from "@/stores/notesStore";
import {
  selectRightSidebarEffectiveWidth,
  useSidebarWidthStore,
} from "@/stores/sidebarWidthStore";
import { useTourStore } from "@/stores/tourStore";
import { MenuPanel } from "@/components/sidebar/panels/MenuPanel";

// ============================================================================
// TYPES
// ============================================================================

interface HeaderControlsProps {
  isConnected: boolean;
  debugMode: boolean;
  aiSummaryEnabled: boolean | null;
  simulationRunning: boolean;
  onSimulate: () => Promise<void>;
  onStopSimulation: () => Promise<void>;
  onReset: () => void;
  onClearDB: () => void;
  onToggleDebug: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onRestartBackend?: () => Promise<void>;
  restartingBackend?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Desktop-only header controls. Buttons collapse progressively into an
 * overflow menu as the viewport narrows:
 *   • Help      below 2xl (1536)
 *   • Reset     below xl  (1280)
 *   • Clear DB  below xl  (1280)
 *   • Debug     below lg  (1024)
 *   • Settings  below lg  (1024)
 * Simulate (and conditional Bell/Tour) stay inline at all widths.
 */
export function HeaderControls({
  isConnected,
  debugMode,
  aiSummaryEnabled,
  simulationRunning,
  onSimulate,
  onStopSimulation,
  onReset,
  onClearDB,
  onToggleDebug,
  onOpenSettings,
  onOpenHelp,
  onRestartBackend,
  restartingBackend,
}: HeaderControlsProps): React.ReactNode {
  const { t } = useTranslation();
  const unreadCount = useAttentionStore(selectUnreadCount);
  const openCommandBar = useAttentionStore((s) => s.openCommandBar);
  const openHistory = useAttentionStore((s) => s.openHistory);
  const historyCount = useAttentionStore((s) => s.toastHistory.length);
  const openNotes = useNotesStore((s) => s.open);
  // Tour: mesma heurística da versão cca48b2 — modo "building" só se
  // estamos numa view multi-andar E há buildingConfig carregado; senão
  // "single". `startTour` é a action do tourStore (ficou órfã quando o
  // botão sumiu do header — agora volta via menu ⋮).
  const view = useNavigationStore((s) => s.view);
  const buildingConfig = useNavigationStore((s) => s.buildingConfig);
  const startTour = useTourStore((s) => s.startTour);
  const hasBuildingConfig =
    buildingConfig !== null && (buildingConfig?.floors.length ?? 0) > 0;
  const tourMode: "single" | "building" =
    view !== "single" && hasBuildingConfig ? "building" : "single";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Colapso responsivo: à medida que o header aperta, esconde botões
  // inline na ordem (Notas → Reset → Reiniciar → Settings) e empurra eles
  // pro menu de 3-pontinhos. Mede o "slack" — quanto espaço sobra entre
  // a coluna esquerda (título + breadcrumb) e a coluna direita
  // (botões + status). Se o slack ficar abaixo de SAFETY_MARGIN, colapsa
  // um botão. NÃO mede header.scrollWidth porque a coluna esquerda tem
  // `min-w-0 overflow-hidden`, que faz o header NUNCA overflowar — em
  // vez disso, o conteúdo esquerdo é clipado silenciosamente e os blocos
  // visualmente se "encostam". Histerese (48px) evita oscilação.
  const containerRef = useRef<HTMLDivElement>(null);
  const [collapseLevel, setCollapseLevel] = useState(0);
  const MAX_COLLAPSE = 4;
  const SAFETY_MARGIN = 24; // px mínimos de respiro entre as colunas
  // Histerese precisa ser MAIOR que o botão mais largo (REINICIAR ~120px),
  // senão oscila: colapsa → liberou 120px de slack → re-expande → encavala
  // de novo → colapsa de novo...
  const EXPAND_MARGIN = SAFETY_MARGIN + 130;

  // Mirror the right sidebar's actual rendered width so the STATUS block
  // forms one continuous vertical column with the sidebar below it. When
  // the sidebar is collapsed, the status block shrinks to match (40px).
  // Declarado ANTES do useLayoutEffect porque o effect depende de
  // rightColumnWidth na sua dep list.
  const rightColumnWidth = useSidebarWidthStore(
    selectRightSidebarEffectiveWidth,
  );
  const rightCollapsed = useSidebarWidthStore((s) => s.rightCollapsed);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const header = el?.parentElement;
    if (!el || !header) return;

    let rafId: number | null = null;
    const measure = () => {
      // Debounce via rAF: ResizeObserver pode disparar várias vezes
      // por frame quando muitos elementos mudam ao mesmo tempo (ex:
      // sidebar abrindo). Pedro 2026-06-09: sem isso, o setCollapseLevel
      // disparava em cadeia e batia no MAX update depth do React.
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const left = header.firstElementChild as HTMLElement | null;
        if (!left) return;
        // gap-4 do header = 16px entre LEFT e RIGHT (StatusToast é fixed,
        // não participa do fluxo). Largura máxima que a coluna esquerda
        // pode ocupar = headerWidth - gap - larguraNaturalDaDireita.
        const HEADER_GAP = 16;
        const maxLeftWidth = header.clientWidth - HEADER_GAP - el.scrollWidth;
        const slack = maxLeftWidth - left.scrollWidth;
        if (slack < SAFETY_MARGIN) {
          setCollapseLevel((l) => Math.min(l + 1, MAX_COLLAPSE));
        } else if (slack > EXPAND_MARGIN) {
          setCollapseLevel((l) => Math.max(l - 1, 0));
        }
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    ro.observe(el);
    const left = header.firstElementChild;
    if (left instanceof Element) ro.observe(left);
    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // collapseLevel REMOVIDO do dep list (Pedro 2026-06-09): re-rodar o
    // effect a cada set causava ciclo infinito com o ResizeObserver. O
    // setter funcional já lê o valor atual, não precisa de re-mount.
    // rightColumnWidth: mantém — quando a sidebar resize, re-mede.
  }, [rightColumnWidth]);

  const hideNotes = collapseLevel >= 1;
  const hideReset = collapseLevel >= 2;
  const hideRestart = collapseLevel >= 3;
  const hideSettings = collapseLevel >= 4;

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [menuOpen]);

  return (
    <div ref={containerRef} className="flex gap-2 items-center flex-shrink-0">
      {/* Notas — abre modal grande (Ctrl+Shift+N). Primeiro a colapsar. */}
      {!hideNotes && (
        <button
          onClick={openNotes}
          title="Notas (Ctrl+Shift+N)"
          className="flex items-center gap-2 px-3 py-1.5 bg-jp-gold/10 hover:bg-jp-gold/20 text-jp-gold border border-jp-gold/30 rounded text-xs font-bold transition-colors whitespace-nowrap"
        >
          <StickyNote size={14} />
          Notas
        </button>
      )}

      {/* Reset — colapsa no nível 2. */}
      {!hideReset && (
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded text-xs font-bold transition-colors whitespace-nowrap"
        >
          <RefreshCw size={14} />
          {t("header.reset")}
        </button>
      )}

      {/* REINICIAR — colapsa no nível 3. */}
      {onRestartBackend && !hideRestart && (
        <button
          onClick={() => void onRestartBackend()}
          disabled={restartingBackend}
          title="Reiniciar backend"
          className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-xs font-bold transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-wait"
        >
          <Power
            size={14}
            className={restartingBackend ? "animate-spin" : ""}
          />
          {restartingBackend ? "REINICIANDO..." : "REINICIAR"}
        </button>
      )}

      {/* Botão unificado: abre o modal de notificações na aba "Histórico".
          O modal tem uma segunda aba "Comandos" (Command Palette com busca
          fuzzy) — alternar é por clique nas abas. Shift+clique abre direto
          na aba Comandos. Badge dourado = pendências ao vivo; cinza =
          contador do histórico. */}
      <button
        onClick={(e) => {
          if (e.shiftKey) openCommandBar();
          else openHistory();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openCommandBar();
        }}
        title={
          unreadCount > 0
            ? `${unreadCount} pendência${unreadCount === 1 ? "" : "s"} — clique abre histórico, troque pra aba "Comandos" se preferir (Shift+clique = direto em Comandos)`
            : `Notificações — histórico + comandos (Shift+clique = aba Comandos${historyCount > 0 ? `, ${historyCount} entrada${historyCount === 1 ? "" : "s"} no histórico` : ""})`
        }
        aria-label="Notificações e comandos"
        className={`relative flex items-center justify-center w-8 h-8 rounded border transition-colors ${
          unreadCount > 0
            ? "bg-jp-gold/15 hover:bg-jp-gold/25 text-jp-gold border-jp-gold/40"
            : "bg-jp-surface-3/25 hover:bg-jp-surface-3/40 text-jp-fg-muted border-jp-border-light/30"
        }`}
      >
        <Bell size={14} />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 bg-jp-gold text-black text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : historyCount > 0 ? (
          <span className="absolute -top-1 -right-1 bg-jp-surface-2 text-jp-fg-dim text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center border border-jp-divider-soft">
            {historyCount > 99 ? "99+" : historyCount}
          </span>
        ) : null}
      </button>

      {/* Settings — último a colapsar (nível 4). */}
      {!hideSettings && (
        <button
          onClick={onOpenSettings}
          data-tour-id="settings-btn"
          className="flex items-center gap-2 px-3 py-1.5 bg-jp-surface-3/25 hover:bg-jp-surface-3/40 text-jp-fg-muted border border-jp-border-light/30 rounded text-xs font-bold transition-colors whitespace-nowrap"
        >
          <Settings size={14} />
          {t("header.settings")}
        </button>
      )}

      {/* Help/Debug/ClearDB foram pro menu 3-pontinhos abaixo. */}

      {/* Overflow menu — SEMPRE visível. Contém panel toggles (todos os
          painéis dos sidebars) + Debug, Clear DB, Help. Reset/Restart/
          Settings ficam inline sempre. */}
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Mais ações e painéis"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center justify-center w-8 h-8 bg-jp-surface-3/25 hover:bg-jp-surface-3/40 text-jp-fg-muted border border-jp-border-light/30 rounded transition-colors"
          title="Mais ações e painéis"
        >
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-[320px] max-h-[80vh] overflow-y-auto bg-jp-surface-1 border border-jp-border-light/40 rounded shadow-lg z-50"
          >
            {/* Panel toggles section — embeds the MenuPanel content. */}
            <div className="border-b border-jp-divider-soft">
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-jp-fg-dim bg-jp-surface-2/50">
                Painéis
              </div>
              <MenuPanel />
            </div>

            {/* Other actions */}
            <div className="py-1">
              {/* Botões inline colapsados pelo overflow responsivo
                  reaparecem aqui em ordem (Notas → Reset → Reiniciar →
                  Settings). Quando o header está largo, esta seção fica
                  vazia. */}
              {hideNotes && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    openNotes();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-jp-gold hover:bg-jp-surface-2 text-xs font-bold transition-colors whitespace-nowrap"
                >
                  <StickyNote size={14} />
                  Notas
                </button>
              )}
              {hideReset && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onReset();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-amber-500 hover:bg-jp-surface-2 text-xs font-bold transition-colors whitespace-nowrap"
                >
                  <RefreshCw size={14} />
                  {t("header.reset")}
                </button>
              )}
              {hideRestart && onRestartBackend && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void onRestartBackend();
                  }}
                  disabled={restartingBackend}
                  className="w-full flex items-center gap-2 px-3 py-2 text-amber-400 hover:bg-jp-surface-2 text-xs font-bold transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-wait"
                >
                  <Power
                    size={14}
                    className={restartingBackend ? "animate-spin" : ""}
                  />
                  {restartingBackend ? "REINICIANDO..." : "REINICIAR"}
                </button>
              )}
              {hideSettings && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-jp-fg-muted hover:bg-jp-surface-2 text-xs font-bold transition-colors whitespace-nowrap"
                >
                  <Settings size={14} />
                  {t("header.settings")}
                </button>
              )}

              {/* Simular / Parar simulação — toggle baseado em
                  simulationRunning. Resgatado da versão cca48b2 onde era
                  inline; agora vive no menu ⋮. */}
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  if (simulationRunning) {
                    void onStopSimulation();
                  } else {
                    void onSimulate();
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-jp-surface-2 text-xs font-bold transition-colors whitespace-nowrap ${
                  simulationRunning ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {simulationRunning ? (
                  <Square size={14} fill="currentColor" />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
                {simulationRunning
                  ? t("header.simulateStop")
                  : t("header.simulate")}
              </button>
              {/* Iniciar tour — resgatado da versão cca48b2; sumira
                  completamente. Modo (single/building) deriva da view. */}
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  startTour(tourMode);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-jp-gold hover:bg-jp-surface-2 text-xs font-bold transition-colors whitespace-nowrap"
              >
                <Map size={14} />
                {t("header.tour")}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onToggleDebug();
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-jp-surface-2 text-xs font-bold transition-colors whitespace-nowrap ${
                  debugMode ? "text-green-400" : "text-jp-fg-muted"
                }`}
              >
                <Bug size={14} />
                {debugMode ? t("header.debugOn") : t("header.debugOff")}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onClearDB();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-rose-500 hover:bg-jp-surface-2 text-xs font-bold transition-colors whitespace-nowrap"
              >
                <Trash2 size={14} />
                {t("header.clearDb")}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenHelp();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-jp-fg-muted hover:bg-jp-surface-2 text-xs font-bold transition-colors whitespace-nowrap"
              >
                <HelpCircle size={14} />
                {t("header.help")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Connection and AI status — width mirrors the RightSidebar's actual
          rendered width (via useSidebarWidthStore), so resizing or
          collapsing the sidebar keeps the header status block and the
          panels below it as a single continuous vertical column. */}
      <div
        className={`flex flex-col items-end border-l border-jp-divider-soft whitespace-nowrap flex-shrink-0 overflow-hidden ${
          rightCollapsed ? "pl-0" : "pl-4"
        }`}
        style={{ width: rightColumnWidth }}
      >
        {!rightCollapsed && (
          <>
            <span className="text-[10px] uppercase font-bold text-jp-fg-dim tracking-widest leading-none mb-1">
              {t("header.status")}
            </span>
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center gap-1.5 font-mono text-xs ${
                  isConnected ? "text-emerald-400" : "text-rose-500"
                }`}
              >
                <Activity
                  size={12}
                  className={isConnected ? "animate-pulse" : ""}
                />
                {isConnected ? t("header.connected") : t("header.disconnected")}
              </div>
              <div
                className={`flex items-center gap-1.5 font-mono text-xs ${
                  aiSummaryEnabled ? "text-violet-400" : "text-jp-fg-dim"
                }`}
              >
                <span className="text-[10px]">AI</span>
                {aiSummaryEnabled ? t("header.aiOn") : t("header.aiOff")}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
