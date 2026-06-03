"use client";

import { useEffect, useState } from "react";
import { Assets, Texture } from "pixi.js";

export type Direction8 =
  | "north"
  | "north-east"
  | "east"
  | "south-east"
  | "south"
  | "south-west"
  | "west"
  | "north-west";

export type PedroDirectionalTextures = Partial<Record<Direction8, Texture>>;
export type PedroDirectionalWalkFrames = Partial<Record<Direction8, Texture[]>>;

export interface PedroSpriteBundle {
  /** One idle/rotation sprite per direction. */
  idle: PedroDirectionalTextures;
  /** Array of walk-cycle frames per direction (typically 6 frames). */
  walk: PedroDirectionalWalkFrames;
}

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
const WALK_BASE = "/sprites/characters/PEDRO/animations/animation-2d055173";

/**
 * Loads idle (rotation) + walk-cycle sprites for Pedro. Both are 8-direction
 * partials so the caller can fall back gracefully if a direction is missing
 * (e.g., the south walk frames currently don't exist on disk).
 */
export function usePedroSprites(): PedroSpriteBundle {
  const [bundle, setBundle] = useState<PedroSpriteBundle>({
    idle: {},
    walk: {},
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const idleEntries = await Promise.all(
        DIRECTIONS.map(async (dir) => {
          try {
            const t: Texture = await Assets.load(
              `/sprites/characters/PEDRO/rotations/${dir}.png`,
            );
            t.source.scaleMode = "nearest";
            return [dir, t] as const;
          } catch {
            return [dir, null] as const;
          }
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
              // Skip missing frames silently; if all are missing the entry
              // ends up empty and the caller falls back to idle.
            }
          }
          return [dir, frames] as const;
        }),
      );

      if (cancelled) return;

      const idle: PedroDirectionalTextures = {};
      for (const [dir, tex] of idleEntries) {
        if (tex) idle[dir] = tex;
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

/**
 * Convert a movement delta into one of 8 compass directions.
 * Screen coords: +x is east, +y is south.
 */
export function directionFromDelta(dx: number, dy: number): Direction8 {
  // atan2 returns radians in (-π, π]. 0 = east, π/2 = south, -π/2 = north.
  // Round to nearest 45° bucket → 8 directions.
  const angle = Math.atan2(dy, dx);
  const bucket = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  // bucket 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
  const map: Direction8[] = [
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
    "north",
    "north-east",
  ];
  return map[bucket];
}
