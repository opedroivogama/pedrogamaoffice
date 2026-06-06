"use client";

import { useEffect, useState } from "react";
import { Assets, Texture } from "pixi.js";

import type {
  Direction8,
  PedroDirectionalIdleFrames,
  PedroDirectionalWalkFrames,
  PedroSpriteBundle,
} from "./usePedroSprites";

const DIRECTIONS: Direction8[] = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];

const WALK_FRAME_COUNT = 6;
const WALK_BASE = "/sprites/characters/GESTOR_TRAFEGO/animations/walk-v3";

const IDLE_FRAME_COUNT = 4;
const IDLE_BASE = "/sprites/characters/GESTOR_TRAFEGO/animations/idle";
const IDLE_ANIMATED_DIRECTIONS: Direction8[] = ["south"];

export function useGestorTrafegoSprites(): PedroSpriteBundle {
  const [bundle, setBundle] = useState<PedroSpriteBundle>({
    idle: {},
    walk: {},
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const staticIdleEntries = await Promise.all(
        DIRECTIONS.map(async (dir) => {
          try {
            const t: Texture = await Assets.load(
              `/sprites/characters/GESTOR_TRAFEGO/rotations/${dir}.png`,
            );
            t.source.scaleMode = "nearest";
            return [dir, t] as const;
          } catch {
            return [dir, null] as const;
          }
        }),
      );

      const animatedIdleEntries = await Promise.all(
        IDLE_ANIMATED_DIRECTIONS.map(async (dir) => {
          const frames: Texture[] = [];
          for (let i = 0; i < IDLE_FRAME_COUNT; i++) {
            const fileName = `frame_${i.toString().padStart(3, "0")}.png`;
            try {
              const t: Texture = await Assets.load(
                `${IDLE_BASE}/${dir}/${fileName}`,
              );
              t.source.scaleMode = "nearest";
              frames.push(t);
            } catch {
              // missing frame
            }
          }
          return [dir, frames] as const;
        }),
      );

      const walkEntries = await Promise.all(
        DIRECTIONS.map(async (dir) => {
          const frames: Texture[] = [];
          for (let i = 0; i < WALK_FRAME_COUNT; i++) {
            const fileName = `frame_${i.toString().padStart(3, "0")}.png`;
            try {
              const t: Texture = await Assets.load(
                `${WALK_BASE}/${dir}/${fileName}`,
              );
              t.source.scaleMode = "nearest";
              frames.push(t);
            } catch {
              // missing
            }
          }
          return [dir, frames] as const;
        }),
      );

      if (cancelled) return;

      const animatedIdleByDir = new Map<Direction8, Texture[]>();
      for (const [dir, frames] of animatedIdleEntries) {
        if (frames.length >= 1) animatedIdleByDir.set(dir, frames);
      }

      const idle: PedroDirectionalIdleFrames = {};
      for (const [dir, tex] of staticIdleEntries) {
        const animated = animatedIdleByDir.get(dir);
        if (animated) {
          idle[dir] = animated;
        } else if (tex) {
          idle[dir] = [tex];
        }
      }

      const walk: PedroDirectionalWalkFrames = {};
      for (const [dir, frames] of walkEntries) {
        if (frames.length > 0) walk[dir] = frames;
      }
      setBundle({ idle, walk });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return bundle;
}
