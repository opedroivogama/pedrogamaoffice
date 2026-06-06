"use client";

import { useEffect } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { useDragResize } from "@/hooks/useDragResize";
import { useTranslation } from "@/hooks/useTranslation";
import { SidebarStack } from "@/components/sidebar/SidebarStack";
import {
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
  useSidebarWidthStore,
} from "@/stores/sidebarWidthStore";

// ============================================================================
// CONSTANTS
// ============================================================================

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = RIGHT_SIDEBAR_DEFAULT_WIDTH; // 320 = w-80

// ============================================================================
// COMPONENT
// ============================================================================

interface RightSidebarProps {
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}

/**
 * Desktop right sidebar. Now a thin shell around <SidebarStack sidebarId="right">.
 * Individual panels (AgentStatus, EventLog, ConversationHistory, AmbientRadio,
 * SessionHistoryPanel) are registered in panelRegistry and rendered as
 * draggable accordions.
 */
export function RightSidebar({
  isCollapsed,
  onToggleCollapsed,
}: RightSidebarProps): React.ReactNode {
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
    edge: "left",
  });

  // Mirror width + collapsed into the shared store so HeaderControls can
  // size the STATUS block to match (one continuous vertical column).
  const setRightWidth = useSidebarWidthStore((s) => s.setRightWidth);
  const setRightCollapsed = useSidebarWidthStore((s) => s.setRightCollapsed);
  useEffect(() => {
    setRightWidth(sidebarWidth);
  }, [sidebarWidth, setRightWidth]);
  useEffect(() => {
    setRightCollapsed(isCollapsed);
  }, [isCollapsed, setRightCollapsed]);

  return (
    <aside
      className={`relative flex flex-col gap-2 flex-shrink-0 overflow-hidden ${
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
          <PanelRightOpen size={16} />
        ) : (
          <PanelRightClose size={16} />
        )}
      </button>

      {!isCollapsed && (
        <>
          {/* Horizontal Resize Handle (left edge) */}
          <div
            className="absolute left-0 top-0 w-1.5 h-full cursor-ew-resize z-10 hover:bg-purple-500/40 active:bg-purple-500/60 transition-colors"
            onMouseDown={handleDragStart}
            title={t("sessions.dragToResize")}
          />

          <SidebarStack sidebarId="right" />
        </>
      )}
    </aside>
  );
}
