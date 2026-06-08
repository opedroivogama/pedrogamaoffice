"use client";

import { create } from "zustand";

// ============================================================================
// TYPES
// ============================================================================

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  /** Cor da bolinha do card. Hex curto/longo. Vazio = dourado padrão. */
  color?: string;
  /** Emoji opcional pra dar identidade visual rápida (ex: "💼", "📊"). */
  emoji?: string;
}

interface QuickLinksState {
  links: QuickLink[];
  isLoaded: boolean;
  loadError: string | null;

  load: () => Promise<void>;
  add: (link: Omit<QuickLink, "id">) => Promise<void>;
  update: (id: string, patch: Omit<QuickLink, "id">) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (fromId: string, toId: string) => Promise<void>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE = "http://localhost:8000/api/v1";
const PREF_KEY = "quick_links";

// ============================================================================
// HELPERS
// ============================================================================

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ql_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

async function fetchLinks(): Promise<QuickLink[]> {
  try {
    const res = await fetch(`${API_BASE}/preferences/${PREF_KEY}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { value: string | null };
    if (!data.value) return [];
    const parsed = JSON.parse(data.value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is QuickLink =>
        typeof l === "object" &&
        l !== null &&
        typeof (l as QuickLink).id === "string" &&
        typeof (l as QuickLink).label === "string" &&
        typeof (l as QuickLink).url === "string",
    );
  } catch {
    return [];
  }
}

async function persistLinks(links: QuickLink[]): Promise<void> {
  await fetch(`${API_BASE}/preferences/${PREF_KEY}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: JSON.stringify(links) }),
  });
}

// ============================================================================
// STORE
// ============================================================================

export const useQuickLinksStore = create<QuickLinksState>()((set, get) => ({
  links: [],
  isLoaded: false,
  loadError: null,

  load: async () => {
    try {
      const links = await fetchLinks();
      set({ links, isLoaded: true, loadError: null });
    } catch (err) {
      set({ isLoaded: true, loadError: (err as Error).message });
    }
  },

  add: async (link) => {
    const next: QuickLink = {
      ...link,
      url: normalizeUrl(link.url),
      id: genId(),
    };
    const links = [...get().links, next];
    set({ links });
    await persistLinks(links);
  },

  update: async (id, patch) => {
    const links = get().links.map((l) =>
      l.id === id ? { ...l, ...patch, url: normalizeUrl(patch.url), id } : l,
    );
    set({ links });
    await persistLinks(links);
  },

  remove: async (id) => {
    const links = get().links.filter((l) => l.id !== id);
    set({ links });
    await persistLinks(links);
  },

  reorder: async (fromId, toId) => {
    if (fromId === toId) return;
    const links = [...get().links];
    const fromIdx = links.findIndex((l) => l.id === fromId);
    const toIdx = links.findIndex((l) => l.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = links.splice(fromIdx, 1);
    links.splice(toIdx, 0, moved);
    set({ links });
    await persistLinks(links);
  },
}));
