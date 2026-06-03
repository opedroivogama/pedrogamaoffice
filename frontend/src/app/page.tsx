/**
 * Claude Office Visualizer - Main Page
 *
 * Uses the unified Zustand store, XState machines, and OfficeGame component.
 * Layout and logic are delegated to extracted components and custom hooks.
 *
 * Navigation modes:
 * - "single" (default): the original flat layout with sidebar + canvas + sidebar
 * - "building": cross-section building view (when user configures floors)
 * - "floor": floor-level view wrapping the office canvas
 */

"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useWebSocketEvents } from "@/hooks/useWebSocketEvents";
import { useSessions } from "@/hooks/useSessions";
import { useSessionSwitch } from "@/hooks/useSessionSwitch";
import { useFloorConfig } from "@/hooks/useFloorConfig";
import {
  useGameStore,
  selectIsConnected,
  selectDebugMode,
  selectAgents,
  selectBoss,
} from "@/stores/gameStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useTourStore } from "@/stores/tourStore";
import { useShallow } from "zustand/react/shallow";
import { Menu, X } from "lucide-react";
import { SessionSidebar } from "@/components/layout/SessionSidebar";
import { MobileDrawer } from "@/components/layout/MobileDrawer";
import { MobileAgentActivity } from "@/components/layout/MobileAgentActivity";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { HeaderControls } from "@/components/layout/HeaderControls";
import { restartBackend } from "@/lib/api/restartBackend";
import {
  StatusToast,
  type StatusMessage,
} from "@/components/layout/StatusToast";
import Modal from "@/components/overlay/Modal";
import SettingsModal from "@/components/overlay/SettingsModal";
import NotesModal from "@/components/notes/NotesModal";
import { Breadcrumb } from "@/components/navigation/Breadcrumb";
import { ViewTransition } from "@/components/navigation/ViewTransition";
import { BuildingView } from "@/components/views/BuildingView";
import { FloorView } from "@/components/views/FloorView";
import { TourOverlay } from "@/components/tour/TourOverlay";
import CommandBar from "@/components/attention/CommandBar";
import ToastHistoryModal from "@/components/attention/ToastHistoryModal";
import AttentionToasts from "@/components/attention/AttentionToasts";
import AgentPopup from "@/components/attention/AgentPopup";
import ControlBanner from "@/components/attention/ControlBanner";
import { usePlayerControl } from "@/hooks/usePlayerControl";
import { useBossAutoWalk } from "@/hooks/useBossAutoWalk";
import { useAttentionStore } from "@/stores/attentionStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useNotesStore } from "@/stores/notesStore";
import { PanelDndProvider } from "@/components/sidebar/PanelDndProvider";
import { useTranslation } from "@/hooks/useTranslation";
import { useSimulationStatus } from "@/hooks/useSimulationStatus";
import type { Session } from "@/hooks/useSessions";
import { shouldIgnoreShortcut } from "@/utils/shortcutGate";
import { ModelSelect } from "@/components/header/ModelSelect";

// ============================================================================
// DYNAMIC IMPORT
// ============================================================================

function LoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="w-full h-full bg-jp-surface-1 animate-pulse flex items-center justify-center text-white font-mono text-center">
      {t("app.initializingSystems")}
    </div>
  );
}

const OfficeGame = dynamic(
  () =>
    import("@/components/game/OfficeGame").then((m) => ({
      default: m.OfficeGame,
    })),
  {
    ssr: false,
    loading: () => <LoadingFallback />,
  },
);

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function V2TestPage(): React.ReactNode {
  // ------------------------------------------------------------------
  // i18n
  // ------------------------------------------------------------------
  const { t, language } = useTranslation();

  // ------------------------------------------------------------------
  // UI-only state
  // ------------------------------------------------------------------
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    "general" | "building"
  >("general");
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
    null,
  );
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState<boolean | null>(
    null,
  );

  // Session pending delete drives the delete-confirmation modal
  const [sessionPendingDelete, setSessionPendingDelete] =
    useState<Session | null>(null);

  // ------------------------------------------------------------------
  // Status toast helper (stable reference via useCallback)
  // ------------------------------------------------------------------
  const showStatus = useCallback(
    (text: string, type: "info" | "error" | "success" = "info") => {
      setStatusMessage({ text, type });
      setTimeout(() => setStatusMessage(null), 3000);
    },
    [],
  );

  // ------------------------------------------------------------------
  // Session management hooks
  // ------------------------------------------------------------------
  const { sessions, sessionsLoading, sessionId, setSessionId, fetchSessions } =
    useSessions(showStatus);

  // ChatPanel (Pergunte ao Claude) chama `requestSessionSwitch(thread.id)`
  // sempre que a thread ativa muda — assim o WebSocket do painel passa a
  // ouvir os hooks daquela conversa e o balão do Pedro reflete a mensagem
  // enviada pelo painel "Pergunte ao Claude". Quando o pedido é aplicado,
  // limpamos o campo pra evitar re-disparo em re-renders.
  const pendingSessionSwitch = useGameStore((s) => s.pendingSessionSwitch);
  const requestSessionSwitch = useGameStore((s) => s.requestSessionSwitch);
  useEffect(() => {
    if (pendingSessionSwitch && pendingSessionSwitch !== sessionId) {
      setSessionId(pendingSessionSwitch);
    }
    if (pendingSessionSwitch) {
      requestSessionSwitch(null);
    }
  }, [pendingSessionSwitch, sessionId, setSessionId, requestSessionSwitch]);

  // Drives WASD/arrow movement for the currently controlled entity (if any).
  usePlayerControl();

  // Drives autonomous boss walking (set via backend POST /api/v1/boss/walk
  // or /boss/wander). Independent from player control.
  useBossAutoWalk();

  const {
    handleSessionSelect,
    handleDeleteSession,
    handleClearDB,
    handleSimulate,
    handleStopSimulation,
    handleReset,
    handleRenameSession,
  } = useSessionSwitch({ sessionId, setSessionId, fetchSessions, showStatus });

  const { running: simulationRunning, refresh: refreshSimulationStatus } =
    useSimulationStatus();
  const handleSimulateAndRefresh = useCallback(async () => {
    await handleSimulate();
    await refreshSimulationStatus();
  }, [handleSimulate, refreshSimulationStatus]);
  const handleStopAndRefresh = useCallback(async () => {
    await handleStopSimulation();
    await refreshSimulationStatus();
  }, [handleStopSimulation, refreshSimulationStatus]);

  // ------------------------------------------------------------------
  // Backend restart (botão no menu superior)
  // ------------------------------------------------------------------
  const [restartingBackend, setRestartingBackend] = useState(false);
  const handleRestartBackend = useCallback(async () => {
    if (restartingBackend) return;
    if (!window.confirm("Reiniciar o backend? Pode levar uns 5 segundos.")) {
      return;
    }
    setRestartingBackend(true);
    const result = await restartBackend();
    if (!result.ok) {
      window.alert(`Falha ao reiniciar: ${result.error}`);
      setRestartingBackend(false);
      return;
    }
    // 3s sleep do .bat + ~2s startup + folga.
    window.setTimeout(() => setRestartingBackend(false), 6000);
  }, [restartingBackend]);

  // ------------------------------------------------------------------
  // Store subscriptions
  // ------------------------------------------------------------------
  const isConnected = useGameStore(selectIsConnected);
  const debugMode = useGameStore(selectDebugMode);
  const agents = useGameStore(useShallow(selectAgents));
  const boss = useGameStore(selectBoss);
  const loadPersistedDebugSettings = useGameStore(
    (state) => state.loadPersistedDebugSettings,
  );
  const loadUserAvatarPositions = useGameStore(
    (state) => state.loadUserAvatarPositions,
  );
  const loadPreferences = usePreferencesStore((s) => s.loadPreferences);
  const hydrateLayout = useLayoutStore((s) => s.hydrate);

  // Navigation store
  const view = useNavigationStore((s) => s.view);

  // ------------------------------------------------------------------
  // Floor config + tour initialization
  // ------------------------------------------------------------------
  useFloorConfig();

  // Watch for edit-building requests from BuildingView
  const consumeEditBuilding = useNavigationStore((s) => s.consumeEditBuilding);
  useEffect(() => {
    const interval = setInterval(() => {
      if (consumeEditBuilding()) {
        setSettingsInitialTab("building");
        setIsSettingsModalOpen(true);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [consumeEditBuilding]);

  const loadTourSeen = useTourStore((s) => s.loadTourSeen);
  useEffect(() => {
    loadTourSeen();
  }, [loadTourSeen]);

  // ------------------------------------------------------------------
  // WebSocket connection — reconnects when sessionId changes
  // ------------------------------------------------------------------
  // Resolve um rótulo curto pra sessão atual: displayName > label > id-curto.
  // Usado pelos toasts pra dizer QUAL sessão disparou o evento.
  const sessionLabel = useMemo(() => {
    const s = sessions.find((x) => x.id === sessionId);
    return s?.displayName ?? s?.label ?? sessionId.slice(0, 8);
  }, [sessions, sessionId]);
  useWebSocketEvents({ sessionId, sessionLabel });

  // ------------------------------------------------------------------
  // One-time initialization effects
  // ------------------------------------------------------------------
  useEffect(() => {
    fetch("http://localhost:8000/api/v1/status")
      .then((res) => res.json())
      .then((data: { aiSummaryEnabled: boolean }) =>
        setAiSummaryEnabled(data.aiSummaryEnabled),
      )
      .catch(() => setAiSummaryEnabled(false));
  }, []);

  useEffect(() => {
    loadPersistedDebugSettings();
  }, [loadPersistedDebugSettings]);

  useEffect(() => {
    void loadUserAvatarPositions();
  }, [loadUserAvatarPositions]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    void hydrateLayout();
  }, [hydrateLayout]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // ------------------------------------------------------------------
  // Mobile breakpoint detection
  // ------------------------------------------------------------------
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // ------------------------------------------------------------------
  // Cmd+K / Ctrl+K command bar toggle, Ctrl+Shift+N notas
  // ------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e)) return;

      // Ctrl+Shift+N abre/fecha Notas. Funciona mesmo com modal aberto pra
      // permitir fechar pelo atalho.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const { isOpen, open, close } = useNotesStore.getState();
        if (isOpen) close();
        else open();
        return;
      }

      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const prefs = usePreferencesStore.getState();
        if (!prefs.commandBarEnabled) return;
        const { isCommandBarOpen, closeCommandBar, openCommandBar } =
          useAttentionStore.getState();
        if (isCommandBarOpen) {
          closeCommandBar();
        } else {
          openCommandBar();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ------------------------------------------------------------------
  // Derived handlers
  // ------------------------------------------------------------------
  const handleToggleDebug = () =>
    useGameStore.getState().setDebugMode(!debugMode);

  const handleConfirmClearDB = async () => {
    setIsClearModalOpen(false);
    await handleClearDB();
  };

  const handleConfirmDeleteSession = async () => {
    if (!sessionPendingDelete) return;
    const pending = sessionPendingDelete;
    setSessionPendingDelete(null);
    await handleDeleteSession(pending);
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <main className="flex h-screen flex-col bg-jp-ink p-2 overflow-hidden relative">
      {/* ----------------------------------------------------------------
          Modals
      ---------------------------------------------------------------- */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title={t("modal.confirmDbWipe")}
        footer={
          <>
            <button
              onClick={() => setIsClearModalOpen(false)}
              className="px-4 py-2 text-jp-fg-muted hover:text-white text-sm font-bold transition-colors"
            >
              {t("modal.cancel")}
            </button>
            <button
              onClick={handleConfirmClearDB}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-rose-900/20"
            >
              {t("modal.wipeAllData")}
            </button>
          </>
        }
      >
        <p>{t("modal.wipeWarning")}</p>
      </Modal>

      <Modal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title={t("modal.keyboardShortcuts")}
        footer={
          <button
            onClick={() => setIsHelpModalOpen(false)}
            className="px-4 py-2 bg-jp-surface-3 hover:bg-jp-surface-3 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {t("modal.close")}
          </button>
        }
      >
        <div className="space-y-3 font-mono text-sm">
          <div className="flex justify-between items-center py-2 border-b border-jp-divider">
            <kbd className="px-2 py-1 bg-jp-surface-2 rounded text-white font-bold">
              D
            </kbd>
            <span className="text-jp-fg">{t("modal.toggleDebug")}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-jp-divider">
            <kbd className="px-2 py-1 bg-jp-surface-2 rounded text-white font-bold">
              P
            </kbd>
            <span className="text-jp-fg">{t("modal.showAgentPaths")}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-jp-divider">
            <kbd className="px-2 py-1 bg-jp-surface-2 rounded text-white font-bold">
              Q
            </kbd>
            <span className="text-jp-fg">{t("modal.showQueueSlots")}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <kbd className="px-2 py-1 bg-jp-surface-2 rounded text-white font-bold">
              L
            </kbd>
            <span className="text-jp-fg">{t("modal.showPhaseLabels")}</span>
          </div>
        </div>
      </Modal>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        initialTab={settingsInitialTab}
      />

      <Modal
        isOpen={sessionPendingDelete !== null}
        onClose={() => setSessionPendingDelete(null)}
        title={t("modal.deleteSession")}
        footer={
          <>
            <button
              onClick={() => setSessionPendingDelete(null)}
              className="px-4 py-2 text-jp-fg-muted hover:text-white text-sm font-bold transition-colors"
            >
              {t("modal.cancel")}
            </button>
            <button
              onClick={handleConfirmDeleteSession}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-rose-900/20"
            >
              {t("modal.delete")}
            </button>
          </>
        }
      >
        <p>
          {t("modal.deleteSessionConfirm")}{" "}
          <span className="font-mono text-purple-400">
            {sessionPendingDelete?.projectName ||
              sessionPendingDelete?.id.slice(0, 8)}
          </span>
          ?
        </p>
        <p className="text-jp-fg-muted text-sm mt-2">
          {t("modal.deleteSessionWarning")}{" "}
          {sessionPendingDelete?.eventCount ?? 0} {t("modal.events")}.{" "}
          {t("modal.cannotBeUndone")}
        </p>
      </Modal>

      {/* ----------------------------------------------------------------
          Header
      ---------------------------------------------------------------- */}
      <header className="flex justify-between items-center mb-2 px-1 relative h-12 gap-4 min-w-0">
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? t("modal.close") : t("mobile.menu")}
              aria-expanded={mobileMenuOpen}
              className="p-2 bg-jp-surface-2 hover:bg-jp-surface-3 rounded-lg text-white transition-colors"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}
          <h1
            className={`font-bold text-white tracking-tight flex items-center gap-2 whitespace-nowrap ${
              isMobile ? "text-lg" : "text-2xl"
            }`}
          >
            <span className="text-jp-gold">Claude</span>
            {!isMobile && (
              <span className="hidden lg:inline">{t("app.title")}</span>
            )}
            {!isMobile && (
              <span className="text-xs font-mono font-normal px-2 py-0.5 bg-jp-surface-2 rounded text-jp-fg-muted border border-jp-divider">
                v0.17.0
              </span>
            )}
            {!isMobile && <ModelSelect />}
          </h1>

          {/* Breadcrumb — only when in building/floor view */}
          {!isMobile && <Breadcrumb />}
        </div>

        {/* Status toast — floats below the header, centered, doesn't collide with buttons */}
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center pointer-events-none">
          <StatusToast message={statusMessage} />
        </div>

        {!isMobile && (
          <HeaderControls
            isConnected={isConnected}
            debugMode={debugMode}
            aiSummaryEnabled={aiSummaryEnabled}
            simulationRunning={simulationRunning}
            onSimulate={handleSimulateAndRefresh}
            onStopSimulation={handleStopAndRefresh}
            onReset={handleReset}
            onClearDB={() => setIsClearModalOpen(true)}
            onToggleDebug={handleToggleDebug}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onOpenHelp={() => setIsHelpModalOpen(true)}
            onRestartBackend={handleRestartBackend}
            restartingBackend={restartingBackend}
          />
        )}

        {isMobile && (
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
              }`}
            />
            <span className="text-xs text-jp-fg-muted font-mono">
              {agents.size} {t("header.agents")}
            </span>
          </div>
        )}
      </header>

      {/* ----------------------------------------------------------------
          Mobile Drawer
      ---------------------------------------------------------------- */}
      <MobileDrawer
        isOpen={isMobile && mobileMenuOpen}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        sessionId={sessionId}
        onClose={() => setMobileMenuOpen(false)}
        onSessionSelect={handleSessionSelect}
        onSimulate={handleSimulate}
        onReset={handleReset}
        onClearDB={() => {
          setIsClearModalOpen(true);
          setMobileMenuOpen(false);
        }}
      />

      {/* ----------------------------------------------------------------
          Main Content
      ---------------------------------------------------------------- */}
      {isMobile ? (
        <div className="flex-grow flex flex-col gap-1.5 overflow-hidden min-h-0">
          <div className="flex-[3] border border-jp-divider-soft rounded-lg shadow-2xl bg-jp-surface-1 overflow-hidden relative min-h-0">
            <OfficeGame />
          </div>
          <MobileAgentActivity agents={agents} boss={boss} />
        </div>
      ) : view === "single" ? (
        /* ----------------------------------------------------------------
            Single View (default, original layout)
        ---------------------------------------------------------------- */
        <PanelDndProvider>
        <div className="flex-grow flex gap-2 overflow-hidden min-h-0">
          <SessionSidebar
            sessions={sessions}
            sessionsLoading={sessionsLoading}
            sessionId={sessionId}
            isCollapsed={leftSidebarCollapsed}
            onToggleCollapsed={() =>
              setLeftSidebarCollapsed(!leftSidebarCollapsed)
            }
            onSessionSelect={handleSessionSelect}
            onDeleteSession={setSessionPendingDelete}
            onRenameSession={handleRenameSession}
          />

          <div
            data-tour-id="game-canvas"
            className="flex-grow border border-jp-divider-soft rounded-lg shadow-2xl bg-jp-surface-1 overflow-hidden relative"
          >
            <OfficeGame />
          </div>

          <RightSidebar
            isCollapsed={rightSidebarCollapsed}
            onToggleCollapsed={() =>
              setRightSidebarCollapsed(!rightSidebarCollapsed)
            }
          />
        </div>
        </PanelDndProvider>
      ) : (
        /* ----------------------------------------------------------------
            Building / Floor View (animated transitions)
        ---------------------------------------------------------------- */
        <ViewTransition
          view={view}
          buildingView={<BuildingView sessions={sessions} />}
          floorView={
            <FloorView
              sessions={sessions}
              sessionsLoading={sessionsLoading}
              sessionId={sessionId}
              isCollapsed={leftSidebarCollapsed}
              onToggleCollapsed={() =>
                setLeftSidebarCollapsed(!leftSidebarCollapsed)
              }
              rightSidebarCollapsed={rightSidebarCollapsed}
              onToggleRightSidebar={() =>
                setRightSidebarCollapsed(!rightSidebarCollapsed)
              }
              onSessionSelect={handleSessionSelect}
              onDeleteSession={setSessionPendingDelete}
              onRenameSession={handleRenameSession}
            />
          }
        />
      )}

      {/* ----------------------------------------------------------------
          Attention System
      ---------------------------------------------------------------- */}
      <CommandBar />
      <ToastHistoryModal />
      <AttentionToasts />
      <AgentPopup />
      <ControlBanner />

      {/* ----------------------------------------------------------------
          Tour Overlay
      ---------------------------------------------------------------- */}
      <TourOverlay />

      {/* ----------------------------------------------------------------
          Notas (modal grande, atalho Ctrl+Shift+N)
      ---------------------------------------------------------------- */}
      <NotesModal />
    </main>
  );
}
