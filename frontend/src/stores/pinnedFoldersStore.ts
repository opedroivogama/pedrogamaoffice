"use client";

import { create } from "zustand";

// ============================================================================
// TYPES
// ============================================================================

export interface PinnedFolder {
  id: string;
  label: string;
  path: string;
  /** ID do andar associado — usado pra herdar a cor (accent) na bolinha do
   *  card. Vazio ou ausente = bolinha cinza neutra. */
  floorId?: string;
  /** Se true, o filtro de sessões trata esta pasta como "pasta-mãe" e
   *  varre os project_root das sessões pra gerar chips por subpasta
   *  automaticamente (além do chip da pasta-mãe que cobre tudo dentro). */
  includeChildren?: boolean;
}

interface PinnedFoldersState {
  folders: PinnedFolder[];
  isLoaded: boolean;
  loadError: string | null;

  load: () => Promise<void>;
  add: (folder: Omit<PinnedFolder, "id">) => Promise<void>;
  remove: (id: string) => Promise<void>;
  launch: (path: string) => Promise<{ ok: boolean; error?: string }>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE = "http://localhost:8000/api/v1";
const PREF_KEY = "pinned_folders";

// ============================================================================
// HELPERS
// ============================================================================

function genId(): string {
  // crypto.randomUUID está disponível em todos os browsers que o Next.js
  // suporta atualmente; fallback simples só por segurança.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchFolders(): Promise<PinnedFolder[]> {
  try {
    const res = await fetch(`${API_BASE}/preferences/${PREF_KEY}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { value: string | null };
    if (!data.value) return [];
    const parsed = JSON.parse(data.value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is PinnedFolder =>
        typeof f === "object" &&
        f !== null &&
        typeof (f as PinnedFolder).id === "string" &&
        typeof (f as PinnedFolder).label === "string" &&
        typeof (f as PinnedFolder).path === "string",
    );
  } catch {
    return [];
  }
}

async function persistFolders(folders: PinnedFolder[]): Promise<void> {
  await fetch(`${API_BASE}/preferences/${PREF_KEY}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: JSON.stringify(folders) }),
  });
}

// ============================================================================
// STORE
// ============================================================================

export const usePinnedFoldersStore = create<PinnedFoldersState>()((set, get) => ({
  folders: [],
  isLoaded: false,
  loadError: null,

  load: async () => {
    try {
      const folders = await fetchFolders();
      set({ folders, isLoaded: true, loadError: null });
    } catch (err) {
      set({ isLoaded: true, loadError: (err as Error).message });
    }
  },

  add: async (folder) => {
    const next: PinnedFolder = { ...folder, id: genId() };
    const folders = [...get().folders, next];
    set({ folders });
    await persistFolders(folders);
  },

  remove: async (id) => {
    const folders = get().folders.filter((f) => f.id !== id);
    set({ folders });
    await persistFolders(folders);
  },

  launch: async (path) => {
    try {
      const res = await fetch(`${API_BASE}/launcher/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { detail?: string }
          | null;
        return { ok: false, error: body?.detail ?? res.statusText };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
}));
