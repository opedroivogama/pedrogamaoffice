"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  useLayoutStore,
  type PanelId,
  type SidebarId,
} from "@/stores/layoutStore";
import { AccordionPanel } from "@/components/sidebar/AccordionPanel";
import { PANEL_REGISTRY } from "@/components/sidebar/panelRegistry";

interface SortablePanelProps {
  panelId: PanelId;
  isCollapsed: boolean;
  height: number | undefined;
  onToggle: () => void;
  onResize: (height: number) => void;
  onResizeReset: () => void;
}

function SortablePanel({
  panelId,
  isCollapsed,
  height,
  onToggle,
  onResize,
  onResizeReset,
}: SortablePanelProps): React.ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: panelId });

  const panel = PANEL_REGISTRY[panelId];
  if (!panel) return null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <AccordionPanel
      ref={setNodeRef}
      style={style}
      title={panel.title}
      Icon={panel.icon}
      isCollapsed={isCollapsed}
      alwaysMounted={panel.alwaysMounted ?? false}
      isDragging={isDragging}
      onToggle={onToggle}
      dragListeners={listeners}
      dragAttributes={attributes}
      height={height}
      onResize={onResize}
      onResizeReset={onResizeReset}
    >
      {panel.render()}
    </AccordionPanel>
  );
}

interface SidebarStackProps {
  sidebarId: SidebarId;
}

/**
 * Renders all panels of a single sidebar as a vertical sortable list. Lives
 * inside a `<PanelDndProvider>` ancestor which owns the shared DndContext —
 * that's what makes cross-sidebar dragging work.
 */
export function SidebarStack({
  sidebarId,
}: SidebarStackProps): React.ReactNode {
  const layout = useLayoutStore((s) => s[sidebarId]);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const setPanelHeight = useLayoutStore((s) => s.setPanelHeight);
  const clearPanelHeight = useLayoutStore((s) => s.clearPanelHeight);

  // Drop zone for the tail of the sidebar — receives panels dragged in from
  // the other sidebar, or dropped after the last panel.
  const { setNodeRef: setEmptyZoneRef, isOver: isEmptyZoneOver } = useDroppable(
    {
      id: `sidebar-${sidebarId}-empty`,
    },
  );

  return (
    <SortableContext
      items={layout.order}
      strategy={verticalListSortingStrategy}
    >
      <div className="flex flex-col gap-2 min-h-0 flex-grow overflow-y-auto">
        {layout.order.map((panelId) => (
          <SortablePanel
            key={panelId}
            panelId={panelId}
            isCollapsed={layout.collapsed[panelId] ?? false}
            height={layout.heights[panelId]}
            onToggle={() => togglePanel(sidebarId, panelId)}
            onResize={(h) => setPanelHeight(sidebarId, panelId, h)}
            onResizeReset={() => clearPanelHeight(sidebarId, panelId)}
          />
        ))}
        <div
          ref={setEmptyZoneRef}
          className={`min-h-[44px] flex-shrink-0 rounded-lg border border-dashed transition-colors ${
            isEmptyZoneOver
              ? "border-jp-gold/60 bg-jp-gold/5"
              : layout.order.length === 0
                ? "border-jp-border-light/30 flex items-center justify-center text-[10px] italic text-jp-fg-dim"
                : "border-transparent"
          }`}
        >
          {layout.order.length === 0 && !isEmptyZoneOver
            ? "Arraste painéis pra cá"
            : null}
        </div>
      </div>
    </SortableContext>
  );
}
