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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAttentionStore, selectUnreadCount } from "@/stores/attentionStore";
import { useNavigationStore } from "@/stores/navigationStore";
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
    <div className="flex gap-2 items-center flex-shrink-0">
      {/* Reset — SEMPRE inline (movido pra fora do overflow per user) */}
      <button
        onClick={onReset}
        className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded text-xs font-bold transition-colors whitespace-nowrap"
      >
        <RefreshCw size={14} />
        {t("header.reset")}
      </button>

      {/* Clear DB / Debug agora moram só dentro do menu 3-pontinhos.
          Removidos daqui pra cumprir o pedido: só Reset/Restart/Settings
          ficam de forma constante no header. */}

      {/* REINICIAR — sempre visível na parte superior, em qualquer viewport. */}
      {onRestartBackend && (
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

      {unreadCount > 0 && (
        <button
          onClick={openCommandBar}
          className="relative flex items-center gap-2 px-3 py-1.5 bg-jp-gold/10 hover:bg-jp-gold/20 text-jp-gold border border-jp-gold/30 rounded text-xs font-bold transition-colors"
          title="Attention Queue"
        >
          <Bell className="w-3.5 h-3.5" />
          <span className="absolute -top-1 -right-1 bg-jp-gold text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        </button>
      )}

      {/* Settings — SEMPRE inline (movido pra fora do overflow per user) */}
      <button
        onClick={onOpenSettings}
        data-tour-id="settings-btn"
        className="flex items-center gap-2 px-3 py-1.5 bg-jp-surface-3/25 hover:bg-jp-surface-3/40 text-jp-fg-muted border border-jp-border-light/30 rounded text-xs font-bold transition-colors whitespace-nowrap"
      >
        <Settings size={14} />
        {t("header.settings")}
      </button>

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

      {/* Connection and AI status */}
      <div className="flex flex-col items-end border-l border-jp-divider-soft pl-4 whitespace-nowrap">
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
      </div>
    </div>
  );
}
