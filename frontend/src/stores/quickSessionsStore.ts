"use client";

import { create } from "zustand";

// ============================================================================
// TYPES
// ============================================================================

export interface QuickSession {
  /** UUID interno do atalho (não confundir com sessionId do Claude). */
  id: string;
  /** ID da sessão Claude Code, usado pra POST /sessions/{id}/resume. */
  sessionId: string;
  label: string;
  /** Cor da bolinha — hex curto/longo. Vazio = dourado padrão. */
  color?: string;
  emoji?: string;
}

interface QuickSessionsState {
  sessions: QuickSession[];
  isLoaded: boolean;
  loadError: string | null;

  load: () => Promise<void>;
  add: (session: Omit<QuickSession, "id">) => Promise<void>;
  update: (id: string, patch: Omit<QuickSession, "id">) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (fromId: string, toId: string) => Promise<void>;
  /** POST /sessions/{sessionId}/resume — abre o terminal na sessão. */
  resume: (sessionId: string) => Promise<{ ok: boolean; error?: string }>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE = "http://localhost:8000/api/v1";
const PREF_KEY = "quick_sessions";

// ============================================================================
// HELPERS
// ============================================================================

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `qs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchSessions(): Promise<QuickSession[]> {
  try {
    const res = await fetch(`${API_BASE}/preferences/${PREF_KEY}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { value: string | null };
    if (!data.value) return [];
    const parsed = JSON.parse(data.value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is QuickSession =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as QuickSession).id === "string" &&
        typeof (s as QuickSession).sessionId === "string" &&
        typeof (s as QuickSession).label === "string",
    );
  } catch {
    return [];
  }
}

async function persistSessions(sessions: QuickSession[]): Promise<void> {
  await fetch(`${API_BASE}/preferences/${PREF_KEY}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: JSON.stringify(sessions) }),
  });
}

// ============================================================================
// STORE
// ============================================================================

export const useQuickSessionsStore = create<QuickSessionsState>()((set, get) => ({
  sessions: [],
  isLoaded: false,
  loadError: null,

  load: async () => {
    try {
      const sessions = await fetchSessions();
      set({ sessions, isLoaded: true, loadError: null });
    } catch (err) {
      set({ isLoaded: true, loadError: (err as Error).message });
    }
  },

  add: async (session) => {
    const next: QuickSession = { ...session, id: genId() };
    const sessions = [...get().sessions, next];
    set({ sessions });
    await persistSessions(sessions);
  },

  update: async (id, patch) => {
    const sessions = get().sessions.map((s) =>
      s.id === id ? { ...s, ...patch, id } : s,
    );
    set({ sessions });
    await persistSessions(sessions);
  },

  remove: async (id) => {
    const sessions = get().sessions.filter((s) => s.id !== id);
    set({ sessions });
    await persistSessions(sessions);
  },

  reorder: async (fromId, toId) => {
    if (fromId === toId) return;
    const sessions = [...get().sessions];
    const fromIdx = sessions.findIndex((s) => s.id === fromId);
    const toIdx = sessions.findIndex((s) => s.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = sessions.splice(fromIdx, 1);
    sessions.splice(toIdx, 0, moved);
    set({ sessions });
    await persistSessions(sessions);
  },

  resume: async (sessionId) => {
    try {
      const res = await fetch(
        `${API_BASE}/sessions/${sessionId}/resume`,
        { method: "POST" },
      );
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
