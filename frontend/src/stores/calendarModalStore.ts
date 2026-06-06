"use client";

/**
 * Ponte entre o canvas PIXI (WallCalendar) e o DOM React (CalendarModal).
 * O PIXI não consegue renderizar overlay HTML diretamente, então o click no
 * sprite só seta `isOpen` aqui; o modal escuta e abre.
 */

import { create } from "zustand";

interface CalendarModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useCalendarModalStore = create<CalendarModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
