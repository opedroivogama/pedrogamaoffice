"use client";

import { create } from "zustand";

/**
 * Transient state for the right sidebar's actual rendered width, so the
 * header status block can mirror it pixel-for-pixel and form a single
 * vertical column. RightSidebar writes through useDragResize → this store;
 * HeaderControls reads from it.
 *
 * Not persisted — useDragResize already starts fresh each reload, so the
 * store seed matches the sidebar's initial render.
 */

export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 320;
export const RIGHT_SIDEBAR_COLLAPSED_WIDTH = 40;

interface SidebarWidthState {
  rightWidth: number;
  rightCollapsed: boolean;
  setRightWidth: (width: number) => void;
  setRightCollapsed: (collapsed: boolean) => void;
}

export const useSidebarWidthStore = create<SidebarWidthState>()((set) => ({
  rightWidth: RIGHT_SIDEBAR_DEFAULT_WIDTH,
  rightCollapsed: false,
  setRightWidth: (rightWidth) => set({ rightWidth }),
  setRightCollapsed: (rightCollapsed) => set({ rightCollapsed }),
}));

/** Effective rendered width — collapsed overrides the resizable width. */
export const selectRightSidebarEffectiveWidth = (s: SidebarWidthState) =>
  s.rightCollapsed ? RIGHT_SIDEBAR_COLLAPSED_WIDTH : s.rightWidth;
