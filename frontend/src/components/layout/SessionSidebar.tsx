"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import type { Session } from "@/hooks/useSessions";
import { useDragResize } from "@/hooks/useDragResize";
import { useTranslation } from "@/hooks/useTranslation";
import { SidebarStack } from "@/components/sidebar/SidebarStack";
import { SessionsPanelProvider } from "@/components/sidebar/panels/SessionsPanelContext";

// ============================================================================
// CONSTANTS
// ============================================================================

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_DEFAULT_WIDTH = 288;

// ============================================================================
// TYPES
// ============================================================================

interface SessionSidebarProps {
  sessions: Session[];
  sessionsLoading: boolean;
  sessionId: string;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onSessionSelect: (id: string) => Promise<void>;
  onDeleteSession: (session: Session) => void;
  onRenameSession: (sessionId: string, newName: string) => Promise<void>;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Desktop left sidebar. Now a thin shell around <SidebarStack sidebarId="left">.
 * The Sessions browser and GitStatus are registered panels in panelRegistry.
 */
export function SessionSidebar({
  sessions,
  sessionsLoading,
  sessionId,
  isCollapsed,
  onToggleCollapsed,
  onSessionSelect,
  onDeleteSession,
  onRenameSession,
}: SessionSidebarProps): React.ReactNode {
  const { t } = useTranslation();

  const {
    size: sidebarWidth,
    isDragging,
    handleDragStart,
  } = useDragResize({
    initialSize: SIDEBAR_DEFAULT_WIDTH,
    minSize: SIDEBAR_MIN_WIDTH,
    maxSize: SIDEBAR_MAX_WIDTH,
    direction: "horizontal",
    edge: "right",
  });

  return (
    <SessionsPanelProvider
      value={{
        sessions,
        sessionsLoading,
        sessionId,
        onSessionSelect,
        onDeleteSession,
        onRenameSession,
      }}
    >
      <aside
        className={`relative flex flex-col gap-1.5 flex-shrink-0 overflow-hidden ${
          isDragging ? "select-none" : "transition-all duration-300"
        }`}
        style={{ width: isCollapsed ? 40 : sidebarWidth }}
      >
        {/* Collapse Toggle */}
        <button
          onClick={onToggleCollapsed}
          className="flex items-center justify-center p-2 bg-jp-surface-1 hover:bg-jp-surface-2 border border-jp-divider-soft rounded-lg text-jp-fg-muted hover:text-white transition-colors flex-shrink-0"
          title={
            isCollapsed
              ? t("sessions.expandSidebar")
              : t("sessions.collapseSidebar")
          }
        >
          {isCollapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
        </button>

        {!isCollapsed && (
          <>
            <SidebarStack sidebarId="left" />

            {/* Horizontal Resize Handle (right edge) */}
            <div
              className="absolute right-0 top-0 w-1.5 h-full cursor-ew-resize z-10 hover:bg-purple-500/40 active:bg-purple-500/60 transition-colors"
              onMouseDown={handleDragStart}
              title={t("sessions.dragToResize")}
            />
          </>
        )}
      </aside>
    </SessionsPanelProvider>
  );
}
