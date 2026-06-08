"use client";

import { create } from "zustand";

// ============================================================================
// TYPES
// ============================================================================

export type PanelId =
  | "menu"
  | "sessions"
  | "pinned-folders"
  | "quick-links"
  | "git-status"
  | "chat-claude"
  | "agent-status"
  | "events"
  | "conversation"
  | "radio"
  | "history";

export type SidebarId = "left" | "right";

export interface SidebarLayout {
  /** Order of panels rendered top-to-bottom in this sidebar. */
  order: PanelId[];
  /** Overrides for collapsed state. Missing keys fall back to registry default. */
  collapsed: Partial<Record<PanelId, boolean>>;
  /** Pinned heights in px. Panels with an entry render at that fixed height
   *  (flex-shrink-0); panels without keep flex-grow and share leftover space. */
  heights: Partial<Record<PanelId, number>>;
}

interface PersistedLayout {
  version: number;
  left: SidebarLayout;
  right: SidebarLayout;
}

interface LayoutState {
  left: SidebarLayout;
  right: SidebarLayout;
  isLoaded: boolean;

  hydrate: () => Promise<void>;
  togglePanel: (sidebar: SidebarId, panelId: PanelId) => void;
  /** Add/remove a panel from a sidebar's `order` array. Used by the menu
   *  panel to make panels appear/disappear from the sidebar stack. */
  setPanelVisibility: (
    sidebar: SidebarId,
    panelId: PanelId,
    visible: boolean,
  ) => void;
  reorderPanel: (
    sidebar: SidebarId,
    activeId: PanelId,
    overId: PanelId,
  ) => void;
  /** Move a panel from its current sidebar to a different one, inserting at
   *  `targetIndex` (or appending if undefined / out of range). */
  movePanel: (
    activeId: PanelId,
    targetSidebar: SidebarId,
    targetIndex?: number,
  ) => void;
  /** Return the sidebar the panel currently lives in, or null. */
  findSidebar: (panelId: PanelId) => SidebarId | null;
  /** Pin a panel to an explicit height (px). Other expanded panels keep flex-grow. */
  setPanelHeight: (
    sidebar: SidebarId,
    panelId: PanelId,
    height: number,
  ) => void;
  /** Remove a panel's pinned height so it goes back to flex-grow sharing. */
  clearPanelHeight: (sidebar: SidebarId, panelId: PanelId) => void;
  resetToDefaults: (sidebar?: SidebarId) => void;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const LAYOUT_VERSION = 1;
const PREF_KEY = "panel_layout";
const PREF_API = `http://localhost:8000/api/v1/preferences/${PREF_KEY}`;
const CACHE_KEY = "panel_layout_cache_v1";

const DEFAULT_LAYOUT: { left: SidebarLayout; right: SidebarLayout } = {
  left: {
    order: ["menu", "sessions", "pinned-folders", "quick-links", "git-status"],
    collapsed: {},
    heights: {},
  },
  right: {
    order: ["chat-claude", "agent-status", "events", "conversation", "radio", "history"],
    collapsed: {
      conversation: true,
      radio: true,
      history: true,
    },
    heights: {},
  },
};

const ALL_VALID_IDS: PanelId[] = [
  "menu",
  "sessions",
  "pinned-folders",
  "quick-links",
  "git-status",
  "chat-claude",
  "agent-status",
  "events",
  "conversation",
  "radio",
  "history",
];

const LEFT_IDS: PanelId[] = [
  "menu",
  "sessions",
  "pinned-folders",
  "quick-links",
  "git-status",
];
const RIGHT_IDS: PanelId[] = [
  "chat-claude",
  "agent-status",
  "events",
  "conversation",
  "radio",
  "history",
];

// ============================================================================
// HELPERS
// ============================================================================

function readCache(): { left: SidebarLayout; right: SidebarLayout } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedLayout;
    if (parsed.version !== LAYOUT_VERSION) return null;
    return sanitize(parsed);
  } catch {
    return null;
  }
}

function writeCache(state: { left: SidebarLayout; right: SidebarLayout }) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedLayout = {
      version: LAYOUT_VERSION,
      left: state.left,
      right: state.right,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function sanitize(input: PersistedLayout): {
  left: SidebarLayout;
  right: SidebarLayout;
} {
  return {
    left: sanitizeSide(input.left, LEFT_IDS, DEFAULT_LAYOUT.left),
    right: sanitizeSide(input.right, RIGHT_IDS, DEFAULT_LAYOUT.right),
  };
}

function sanitizeSide(
  saved: SidebarLayout | undefined,
  validIds: PanelId[],
  defaults: SidebarLayout,
): SidebarLayout {
  const knownSet = new Set<PanelId>(validIds);
  const savedOrder = saved?.order ?? [];
  const filtered: PanelId[] = savedOrder.filter(
    (id): id is PanelId =>
      ALL_VALID_IDS.includes(id as PanelId) && knownSet.has(id as PanelId),
  );
  // Append any new panels from defaults that weren't in saved state
  for (const id of defaults.order) {
    if (!filtered.includes(id)) filtered.push(id);
  }
  return {
    order: filtered,
    collapsed: { ...saved?.collapsed },
    heights: { ...saved?.heights },
  };
}

// Debounced save
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(state: { left: SidebarLayout; right: SidebarLayout }) {
  writeCache(state);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void persistToBackend(state);
  }, 400);
}

async function persistToBackend(state: {
  left: SidebarLayout;
  right: SidebarLayout;
}): Promise<void> {
  const payload: PersistedLayout = {
    version: LAYOUT_VERSION,
    left: state.left,
    right: state.right,
  };
  try {
    await fetch(PREF_API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: JSON.stringify(payload) }),
    });
  } catch {
    /* offline — localStorage still has the latest */
  }
}

// ============================================================================
// STORE
// ============================================================================

// Always seed the store with DEFAULT_LAYOUT so SSR and the first client render
// agree. The cached layout from localStorage and the backend copy are both
// loaded later in `hydrate()`, which runs from a `useEffect` after mount.
// Reading localStorage at module-init time would diverge from the server's
// HTML and trigger React hydration errors.

export const useLayoutStore = create<LayoutState>()((set, get) => ({
  left: DEFAULT_LAYOUT.left,
  right: DEFAULT_LAYOUT.right,
  isLoaded: false,

  hydrate: async () => {
    if (get().isLoaded) return;
    // Fast path: pull the last cached layout from localStorage so the UI snaps
    // back to the user's saved arrangement before the backend fetch resolves.
    const cached = readCache();
    if (cached) {
      set({ left: cached.left, right: cached.right });
    }
    try {
      const res = await fetch(PREF_API);
      if (res.ok) {
        const data = (await res.json()) as { value: string | null };
        if (data.value) {
          const parsed = JSON.parse(data.value) as PersistedLayout;
          if (parsed.version === LAYOUT_VERSION) {
            const clean = sanitize(parsed);
            set({ left: clean.left, right: clean.right, isLoaded: true });
            writeCache(clean);
            return;
          }
        }
      }
    } catch {
      /* offline — keep current (cache or defaults) */
    }
    set({ isLoaded: true });
  },

  togglePanel: (sidebar, panelId) => {
    const cur = get()[sidebar];
    const currentlyCollapsed = cur.collapsed[panelId] ?? false;
    const next: SidebarLayout = {
      ...cur,
      collapsed: { ...cur.collapsed, [panelId]: !currentlyCollapsed },
    };
    set({ [sidebar]: next } as Partial<LayoutState>);
    scheduleSave({ ...get(), [sidebar]: next });
  },

  setPanelVisibility: (sidebar, panelId, visible) => {
    // The menu panel itself is always visible — otherwise the user can hide
    // it and lose the only way back. Ignore attempts to hide it.
    if (panelId === "menu" && !visible) return;

    const cur = get()[sidebar];
    const isPresent = cur.order.includes(panelId);
    if (visible === isPresent) return; // no-op

    let order = [...cur.order];
    if (visible) {
      // Restore at the position it had in DEFAULT_LAYOUT for this sidebar
      // (so the layout feels familiar). Append if no default position.
      const defaultIdx = DEFAULT_LAYOUT[sidebar].order.indexOf(panelId);
      if (defaultIdx === -1) {
        order.push(panelId);
      } else {
        // Insert keeping relative order among already-present default panels.
        let insertAt = order.length;
        for (let i = 0; i < order.length; i++) {
          const candIdx = DEFAULT_LAYOUT[sidebar].order.indexOf(order[i]);
          if (candIdx > defaultIdx) {
            insertAt = i;
            break;
          }
        }
        order.splice(insertAt, 0, panelId);
      }
    } else {
      order = order.filter((id) => id !== panelId);
    }

    const next: SidebarLayout = { ...cur, order };
    set({ [sidebar]: next } as Partial<LayoutState>);
    scheduleSave({ ...get(), [sidebar]: next });
  },

  reorderPanel: (sidebar, activeId, overId) => {
    if (activeId === overId) return;
    const cur = get()[sidebar];
    const order = [...cur.order];
    const fromIdx = order.indexOf(activeId);
    const toIdx = order.indexOf(overId);
    if (fromIdx === -1 || toIdx === -1) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, activeId);
    const next: SidebarLayout = { ...cur, order };
    set({ [sidebar]: next } as Partial<LayoutState>);
    scheduleSave({ ...get(), [sidebar]: next });
  },

  movePanel: (activeId, targetSidebar, targetIndex) => {
    const state = get();
    const sourceSidebar: SidebarId = state.left.order.includes(activeId)
      ? "left"
      : state.right.order.includes(activeId)
        ? "right"
        : "right";
    if (sourceSidebar === targetSidebar) return;

    const source = state[sourceSidebar];
    const target = state[targetSidebar];
    const sourceOrder = source.order.filter((id) => id !== activeId);
    const targetOrder = [...target.order];
    const insertAt =
      targetIndex !== undefined &&
      targetIndex >= 0 &&
      targetIndex <= targetOrder.length
        ? targetIndex
        : targetOrder.length;
    targetOrder.splice(insertAt, 0, activeId);

    // Carry the pinned height (if any) with the panel across sidebars.
    const sourceHeights = { ...source.heights };
    const targetHeights = { ...target.heights };
    if (sourceHeights[activeId] !== undefined) {
      targetHeights[activeId] = sourceHeights[activeId];
      delete sourceHeights[activeId];
    }

    const nextState = {
      ...state,
      [sourceSidebar]: {
        ...source,
        order: sourceOrder,
        heights: sourceHeights,
      },
      [targetSidebar]: {
        ...target,
        order: targetOrder,
        heights: targetHeights,
      },
    };
    set({
      [sourceSidebar]: nextState[sourceSidebar],
      [targetSidebar]: nextState[targetSidebar],
    } as Partial<LayoutState>);
    scheduleSave(nextState);
  },

  findSidebar: (panelId) => {
    const state = get();
    if (state.left.order.includes(panelId)) return "left";
    if (state.right.order.includes(panelId)) return "right";
    return null;
  },

  setPanelHeight: (sidebar, panelId, height) => {
    const cur = get()[sidebar];
    const clamped = Math.max(80, Math.round(height));
    if (cur.heights[panelId] === clamped) return;
    const next: SidebarLayout = {
      ...cur,
      heights: { ...cur.heights, [panelId]: clamped },
    };
    set({ [sidebar]: next } as Partial<LayoutState>);
    scheduleSave({ ...get(), [sidebar]: next });
  },

  clearPanelHeight: (sidebar, panelId) => {
    const cur = get()[sidebar];
    if (cur.heights[panelId] === undefined) return;
    const heights = { ...cur.heights };
    delete heights[panelId];
    const next: SidebarLayout = { ...cur, heights };
    set({ [sidebar]: next } as Partial<LayoutState>);
    scheduleSave({ ...get(), [sidebar]: next });
  },

  resetToDefaults: (sidebar) => {
    if (sidebar) {
      set({ [sidebar]: DEFAULT_LAYOUT[sidebar] } as Partial<LayoutState>);
      scheduleSave({ ...get(), [sidebar]: DEFAULT_LAYOUT[sidebar] });
    } else {
      set({ left: DEFAULT_LAYOUT.left, right: DEFAULT_LAYOUT.right });
      scheduleSave(DEFAULT_LAYOUT);
    }
  },
}));

// Re-export for callers that want raw defaults (e.g., a "reset" button)
export const PANEL_LAYOUT_DEFAULTS = DEFAULT_LAYOUT;
