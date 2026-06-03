"use client";

import { create } from "zustand";

/**
 * Shared state for the in-scene radio sprite.
 * AmbientRadio writes here; the PixiJS RadioSprite reads to drive its
 * playing animation and music note particles.
 */
interface RadioState {
  isPlaying: boolean;
  setPlaying: (playing: boolean) => void;
}

export const useRadioStore = create<RadioState>()((set) => ({
  isPlaying: false,
  setPlaying: (playing) => set({ isPlaying: playing }),
}));
