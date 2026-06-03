/**
 * Office chair positions and the matching desk-top y where a seated
 * (waist-up) sprite should sit. Used by UserAvatar / WanderingBoss /
 * AgentSprite to auto-trigger the "seated" cropping illusion when a
 * character lands near a chair.
 */

export interface Chair {
  /** Chair x in world coords (walkable destination). */
  x: number;
  /** Chair y in world coords (walkable destination). */
  y: number;
  /** Desk-surface top y where the BOTTOM of the cropped seated sprite
   *  should be anchored, so the visible head/torso looks "on top of" the
   *  desk while the legs/feet are hidden behind it. */
  deskTopY: number;
}

// Layout derived from navigationGrid.ts:
//   - Desk row 0: chair y=400, desk surface starts at y≈438 (container y=408 + internal 30)
//   - Desk row 1: chair y=592, desk surface starts at y≈630 (container y=600 + internal 30)
//   - Desk x grid: 256, 512, 768, 1024 (4 columns)
//   - Boss desk: chair y=900, desk surface ≈ y=930
export const CHAIRS: Chair[] = [
  // Row 0
  { x: 256, y: 400, deskTopY: 438 },
  { x: 512, y: 400, deskTopY: 438 },
  { x: 768, y: 400, deskTopY: 438 },
  { x: 1024, y: 400, deskTopY: 438 },
  // Row 1
  { x: 256, y: 592, deskTopY: 630 },
  { x: 512, y: 592, deskTopY: 630 },
  { x: 768, y: 592, deskTopY: 630 },
  { x: 1024, y: 592, deskTopY: 630 },
  // Boss
  { x: 640, y: 900, deskTopY: 930 },
];

/**
 * Return the nearest chair within `threshold` px, or null if none. Used by
 * character components to decide whether to render the seated crop.
 */
export function findNearestChair(
  pos: { x: number; y: number },
  threshold = 30,
): Chair | null {
  let best: Chair | null = null;
  let bestDist = threshold;
  for (const c of CHAIRS) {
    const d = Math.hypot(c.x - pos.x, c.y - pos.y);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** Vertical fraction of the source sprite used for the seated crop.
 *  0.58 = corta logo abaixo do peito — mostra cabeça + ombros + peito;
 *  esconde tronco-baixo + cintura + pernas atrás da mesa. */
export const SEATED_CROP_RATIO = 0.58;
