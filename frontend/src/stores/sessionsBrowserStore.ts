"use client";

import { create } from "zustand";

// ============================================================================
// TYPES
// ============================================================================

export type StatusFilter = "all" | "active" | "completed";
export type PeriodFilter = "all" | "24h" | "7d";

interface PersistedFilters {
  version: number;
  status: StatusFilter;
  period: PeriodFilter;
  floor: string; // "all" or a floor_id
}

interface SessionsBrowserState {
  // Persisted (status / period / floor)
  status: StatusFilter;
  period: PeriodFilter;
  floor: string;
  // Transient
  search: string;
  isOpen: boolean;
  isHydrated: boolean;

  hydrate: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  setStatus: (v: StatusFilter) => void;
  setPeriod: (v: PeriodFilter) => void;
  setFloor: (v: string) => void;
  setSearch: (v: string) => void;
  resetFilters: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FILTERS_VERSION = 1;
const PREF_KEY = "sessions_browser_filters";
const PREF_API = `http://localhost:8000/api/v1/preferences/${PREF_KEY}`;

const DEFAULTS: PersistedFilters = {
  version: FILTERS_VERSION,
  status: "all",
  period: "all",
  floor: "all",
};

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

function sanitize(input: unknown): PersistedFilters {
  if (!input || typeof input !== "object") return DEFAULTS;
  const raw = input as Record<string, unknown>;
  const status: StatusFilter =
    raw.status === "active" || raw.status === "completed" ? raw.status : "all";
  const period: PeriodFilter =
    raw.period === "24h" || raw.period === "7d" ? raw.period : "all";
  const floor =
    typeof raw.floor === "string" && raw.floor.length > 0 ? raw.floor : "all";
  return { version: FILTERS_VERSION, status, period, floor };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(payload: PersistedFilters) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void persistToBackend(payload);
  }, 500);
}

async function persistToBackend(payload: PersistedFilters): Promise<void> {
  try {
    await fetch(PREF_API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: JSON.stringify(payload) }),
    });
  } catch {
    /* offline — state stays in memory until next successful PUT */
  }
}

// ============================================================================
// STORE
// ============================================================================

export const useSessionsBrowserStore = create<SessionsBrowserState>()(
  (set, get) => ({
    status: DEFAULTS.status,
    period: DEFAULTS.period,
    floor: DEFAULTS.floor,
    search: "",
    isOpen: false,
    isHydrated: false,

    hydrate: async () => {
      if (get().isHydrated) return;
      try {
        const res = await fetch(PREF_API);
        if (res.ok) {
          const data = (await res.json()) as { value: string | null };
          if (data.value) {
            const parsed = sanitize(JSON.parse(data.value));
            set({
              status: parsed.status,
              period: parsed.period,
              floor: parsed.floor,
              isHydrated: true,
            });
            return;
          }
        }
      } catch {
        /* offline — keep defaults */
      }
      set({ isHydrated: true });
    },

    openModal: () => set({ isOpen: true }),
    closeModal: () => set({ isOpen: false }),

    setStatus: (v) => {
      set({ status: v });
      const s = get();
      schedulePersist({
        version: FILTERS_VERSION,
        status: v,
        period: s.period,
        floor: s.floor,
      });
    },
    setPeriod: (v) => {
      set({ period: v });
      const s = get();
      schedulePersist({
        version: FILTERS_VERSION,
        status: s.status,
        period: v,
        floor: s.floor,
      });
    },
    setFloor: (v) => {
      set({ floor: v });
      const s = get();
      schedulePersist({
        version: FILTERS_VERSION,
        status: s.status,
        period: s.period,
        floor: v,
      });
    },
    setSearch: (v) => set({ search: v }),

    resetFilters: () => {
      set({
        status: DEFAULTS.status,
        period: DEFAULTS.period,
        floor: DEFAULTS.floor,
        search: "",
      });
      schedulePersist({ ...DEFAULTS });
    },
  }),
);
