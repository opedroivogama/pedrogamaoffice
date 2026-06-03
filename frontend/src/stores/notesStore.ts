"use client";

import { create } from "zustand";

// ============================================================================
// TYPES
// ============================================================================

export interface Note {
  id: string;
  title: string;
  body: string;
  position: number;
  created_at: string;
  updated_at: string;
}

interface NotesState {
  notes: Note[];
  selectedId: string | null;
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;

  open: () => void;
  close: () => void;

  fetchAll: () => Promise<void>;
  createNote: (title?: string, body?: string) => Promise<Note | null>;
  updateNote: (
    id: string,
    patch: { title?: string; body?: string },
  ) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  select: (id: string | null) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE = "http://localhost:8000/api/v1";

// ============================================================================
// STORE
// ============================================================================

export const useNotesStore = create<NotesState>()((set, get) => ({
  notes: [],
  selectedId: null,
  isOpen: false,
  isLoading: false,
  error: null,

  open: () => {
    set({ isOpen: true });
    // Carrega ao abrir (silencioso se já tiver carregado uma vez)
    void get().fetchAll();
  },

  close: () => set({ isOpen: false }),

  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/notes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const notes = (await res.json()) as Note[];
      // Mantém a nota selecionada se ela ainda existe; senão pega a primeira.
      const { selectedId } = get();
      const stillExists = notes.some((n) => n.id === selectedId);
      set({
        notes,
        selectedId: stillExists ? selectedId : (notes[0]?.id ?? null),
        isLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createNote: async (title = "Sem título", body = "") => {
    try {
      const res = await fetch(`${API_BASE}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const note = (await res.json()) as Note;
      set((s) => ({
        notes: [note, ...s.notes],
        selectedId: note.id,
      }));
      return note;
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    }
  },

  updateNote: async (id, patch) => {
    // Optimistic — atualiza local imediatamente pra UI fluir
    set((s) => ({
      notes: s.notes.map((n) =>
        n.id === id
          ? {
              ...n,
              ...patch,
              updated_at: new Date().toISOString(),
            }
          : n,
      ),
    }));
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = (await res.json()) as Note;
      // Aplica updated_at do servidor (autoritativo) sem mexer no campo que
      // o usuário possa ter editado durante o roundtrip.
      set((s) => ({
        notes: s.notes.map((n) =>
          n.id === id ? { ...n, updated_at: updated.updated_at } : n,
        ),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  deleteNote: async (id) => {
    const prev = get().notes;
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      selectedId:
        s.selectedId === id
          ? (s.notes.find((n) => n.id !== id)?.id ?? null)
          : s.selectedId,
    }));
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Rollback otimista
      set({ notes: prev, error: (err as Error).message });
    }
  },

  select: (id) => set({ selectedId: id }),
}));
