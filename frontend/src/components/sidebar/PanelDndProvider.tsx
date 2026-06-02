"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { type ReactNode } from "react";

import {
  useLayoutStore,
  type PanelId,
  type SidebarId,
} from "@/stores/layoutStore";

/** Wraps both SidebarStacks so panels can be dragged across sidebars. */
export function PanelDndProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactNode {
  const reorderPanel = useLayoutStore((s) => s.reorderPanel);
  const movePanel = useLayoutStore((s) => s.movePanel);
  const findSidebar = useLayoutStore((s) => s.findSidebar);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function resolveSidebarFromId(
    id: string,
  ): { sidebar: SidebarId; index?: number } | null {
    if (id === "sidebar-left-empty") return { sidebar: "left" };
    if (id === "sidebar-right-empty") return { sidebar: "right" };
    const sb = findSidebar(id as PanelId);
    if (!sb) return null;
    const order = useLayoutStore.getState()[sb].order;
    return { sidebar: sb, index: order.indexOf(id as PanelId) };
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;

    const activeId = active.id as PanelId;
    const sourceSidebar = findSidebar(activeId);
    if (!sourceSidebar) return;

    const target = resolveSidebarFromId(String(over.id));
    if (!target) return;

    if (target.sidebar === sourceSidebar) {
      // Same sidebar reorder. Only do it when over is another panel id.
      if (over.id !== active.id) {
        reorderPanel(sourceSidebar, activeId, over.id as PanelId);
      }
    } else {
      movePanel(activeId, target.sidebar, target.index);
    }
  }

  function handleDragOver(_event: DragOverEvent) {
    // Reserved for future live preview across sidebars. No-op for MVP.
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
    >
      {children}
    </DndContext>
  );
}
