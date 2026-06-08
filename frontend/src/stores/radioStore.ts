"use client";

import { create } from "zustand";

/**
 * Store central do rádio ambiente.
 *
 * Arquitetura:
 * - O state real (playlist, índice, volume, mute, etc.) vive AQUI, não nos
 *   componentes. Assim sidebar e modal podem ser UI idênticas conectadas
 *   ao mesmo state, sem segundo player ou divergência.
 * - O <AmbientRadioPlayer/> singleton (montado uma vez no app root) cria
 *   o iframe do YouTube + YT.Player, lê este store, aplica actions via API,
 *   e move o iframe físico pro slot ativo (TV > modal > sidebar).
 * - <AmbientRadioControls/> é UI pura: renderizada em quantos lugares
 *   precisarem (sidebar, modal). Lê state, dispara actions.
 * - <RadioVideoTV/> registra seu slot com prioridade alta quando o modo
 *   RADIO (13) do quadro está ativo.
 */

export interface RadioTrack {
  id: string; // YouTube video ID
  url: string;
  title?: string;
}

interface PersistedState {
  playlist: RadioTrack[];
  currentIndex: number;
  volume: number;
  muted: boolean;
  videoHidden: boolean;
}

// Prioridade de slot: maior número vence quando há mais de um slot
// registrado simultaneamente. Garante que o vídeo siga o foco do usuário.
export const SLOT_PRIORITY = {
  sidebar: 1,
  modal: 2,
  tv: 3,
} as const;

export type SlotKind = keyof typeof SLOT_PRIORITY;

interface RegisteredSlot {
  kind: SlotKind;
  element: HTMLElement;
}

interface RadioState extends PersistedState {
  // Runtime (não persistido)
  isPlaying: boolean;
  currentTitle: string;
  isReady: boolean;
  hydrated: boolean;

  // Slot routing — não use diretamente nos componentes de UI.
  slots: Map<string, RegisteredSlot>;

  // Setters de runtime (chamados pelo player singleton)
  setPlaying: (playing: boolean) => void;
  setCurrentTitle: (title: string) => void;
  setIsReady: (ready: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
  hydrateFromPersisted: (s: Partial<PersistedState>) => void;

  // Slot management (chamado pelos componentes view)
  registerSlot: (id: string, slot: RegisteredSlot) => void;
  unregisterSlot: (id: string) => void;

  // Actions de UI — chamadas pelos controles (sidebar/modal)
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  selectTrack: (index: number) => void;
  addTrack: (track: RadioTrack) => void;
  removeTrack: (index: number) => void;
  setVolume: (volume: number) => void;
  toggleMuted: () => void;
  toggleVideoHidden: () => void;
  setMuted: (muted: boolean) => void;
}

const DEFAULT_PERSISTED: PersistedState = {
  playlist: [],
  currentIndex: 0,
  volume: 50,
  muted: false,
  videoHidden: false,
};

export const useRadioStore = create<RadioState>()((set) => ({
  ...DEFAULT_PERSISTED,
  isPlaying: false,
  currentTitle: "",
  isReady: false,
  hydrated: false,
  slots: new Map(),

  setPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTitle: (currentTitle) => set({ currentTitle }),
  setIsReady: (isReady) => set({ isReady }),
  setHydrated: (hydrated) => set({ hydrated }),
  hydrateFromPersisted: (s) =>
    set((prev) => ({
      playlist: s.playlist ?? prev.playlist,
      currentIndex: s.currentIndex ?? prev.currentIndex,
      volume: s.volume ?? prev.volume,
      muted: s.muted ?? prev.muted,
      videoHidden: s.videoHidden ?? prev.videoHidden,
    })),

  registerSlot: (id, slot) =>
    set((state) => {
      const next = new Map(state.slots);
      next.set(id, slot);
      return { slots: next };
    }),
  unregisterSlot: (id) =>
    set((state) => {
      const next = new Map(state.slots);
      next.delete(id);
      return { slots: next };
    }),

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  next: () =>
    set((s) => {
      if (s.playlist.length === 0) return s;
      return { currentIndex: (s.currentIndex + 1) % s.playlist.length };
    }),
  prev: () =>
    set((s) => {
      if (s.playlist.length === 0) return s;
      return {
        currentIndex:
          (s.currentIndex - 1 + s.playlist.length) % s.playlist.length,
      };
    }),
  selectTrack: (index) => set({ currentIndex: index }),
  addTrack: (track) =>
    set((s) => ({ playlist: [...s.playlist, track] })),
  removeTrack: (idx) =>
    set((s) => {
      const next = s.playlist.filter((_, i) => i !== idx);
      let currentIndex = s.currentIndex;
      if (idx < currentIndex) currentIndex--;
      if (currentIndex >= next.length) currentIndex = 0;
      return { playlist: next, currentIndex };
    }),
  setVolume: (volume) => set({ volume }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setMuted: (muted) => set({ muted }),
  toggleVideoHidden: () =>
    set((s) => ({ videoHidden: !s.videoHidden })),
}));

/**
 * Resolve qual slot deve receber o iframe agora — o de maior prioridade
 * entre os registrados. Retorna null se nenhum slot ativo.
 */
export function pickActiveSlot(
  slots: Map<string, RegisteredSlot>,
): RegisteredSlot | null {
  let best: RegisteredSlot | null = null;
  let bestP = -Infinity;
  for (const slot of slots.values()) {
    const p = SLOT_PRIORITY[slot.kind];
    if (p > bestP) {
      bestP = p;
      best = slot;
    }
  }
  return best;
}

/**
 * Para o storage layer (persistência localStorage + backend).
 * Pega APENAS os campos persistíveis.
 */
export function getPersistedSnapshot(s: RadioState): PersistedState {
  return {
    playlist: s.playlist,
    currentIndex: s.currentIndex,
    volume: s.volume,
    muted: s.muted,
    videoHidden: s.videoHidden,
  };
}
