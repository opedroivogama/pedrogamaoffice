"use client";

/**
 * Ponte PIXI ↔ DOM pro modal do rádio.
 * Click no sprite do rádio de parede (canvas Pixi) seta `isOpen=true`; o
 * <RadioModal/> escuta e renderiza os controles centralizados.
 */

import { create } from "zustand";

interface RadioModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useRadioModalStore = create<RadioModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
