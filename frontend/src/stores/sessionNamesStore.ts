"use client";

/**
 * Lookup reativo de sessionId → display label.
 *
 * Existe pra deixar surfaces fora do `<Page>` (notavelmente os toasts em
 * `AttentionToasts`) consumir o nome atual da sessão sem snapshot. Quando
 * o usuário roda `/rename`, `useSessions` atualiza essa store e qualquer
 * componente que use o hook re-renderiza com o nome novo.
 */

import { create } from "zustand";

interface SessionNamesState {
  /** Map de sessionId → label preferido (displayName ?? label ?? id-curto). */
  names: Record<string, string>;
  setNames: (entries: Record<string, string>) => void;
  getName: (sessionId: string | null | undefined) => string | null;
}

export const useSessionNamesStore = create<SessionNamesState>((set, get) => ({
  names: {},
  setNames: (entries) => set({ names: entries }),
  getName: (sessionId) => {
    if (!sessionId) return null;
    return get().names[sessionId] ?? null;
  },
}));
