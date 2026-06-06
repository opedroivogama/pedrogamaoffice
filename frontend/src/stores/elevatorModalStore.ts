"use client";

/**
 * Ponte PIXI ↔ DOM pro modal do elevador.
 * Click no sprite do elevador (canvas Pixi) seta `isOpen=true`; o
 * <ElevatorModal/> escuta e renderiza a lista de andares.
 */

import { create } from "zustand";

interface ElevatorModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useElevatorModalStore = create<ElevatorModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
