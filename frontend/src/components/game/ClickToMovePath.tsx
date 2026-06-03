"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useTick } from "@pixi/react";
import type { Graphics } from "pixi.js";

import { useGameStore } from "@/stores/gameStore";
import { TILE_SIZE } from "@/systems/navigationGrid";

/**
 * Renders the in-flight click-to-move path for the controlled entity:
 *   - polyline from "current waypoint" through the remaining waypoints
 *   - a pulsing X marker on the destination tile
 *
 * Reads `clickToMoveTarget` from the game store. Renders nothing when no
 * target is queued. Designed to live inside the main office canvas, drawn
 * BELOW characters so feet stay visible above the line.
 */
export function ClickToMovePath(): ReactNode {
  const target = useGameStore((s) => s.clickToMoveTarget);
  const entityPos = useGameStore((s) => {
    if (!s.clickToMoveTarget) return null;
    const id = s.clickToMoveTarget.entityId;
    if (id === "boss") return s.boss.position;
    const av = s.userAvatarPositions.get(id);
    if (av) return av;
    const ag = s.agents.get(id);
    return ag ? ag.currentPosition : null;
  });

  // Pulse phase for the destination marker — small useTick that just bumps
  // a number so the draw callback re-runs each frame.
  const [pulse, setPulse] = useState(0);
  useTick((ticker) => {
    setPulse((p) => (p + ticker.deltaMS / 600) % (Math.PI * 2));
  });

  const drawPath = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!target || !entityPos) return;

      const remaining = target.path.slice(target.pathIdx);
      if (remaining.length === 0) return;

      // Polyline: from the entity's current pos through every remaining
      // waypoint. Dourado fosco JP, alpha 0.55 so it doesn't dominate.
      g.moveTo(entityPos.x, entityPos.y);
      for (const wp of remaining) {
        g.lineTo(wp.x, wp.y);
      }
      g.stroke({ width: 3, color: 0xb8972a, alpha: 0.55 });

      // Waypoint dots — small circles to make corners obvious.
      for (let i = 0; i < remaining.length - 1; i++) {
        const wp = remaining[i];
        g.circle(wp.x, wp.y, 3);
        g.fill({ color: 0xb8972a, alpha: 0.7 });
      }
    },
    [target, entityPos],
  );

  const drawTarget = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!target) return;
      const { gx, gy } = target.targetTile;
      const cx = gx * TILE_SIZE + TILE_SIZE / 2;
      const cy = gy * TILE_SIZE + TILE_SIZE / 2;

      // Pulsing ring around the destination tile.
      const t = (Math.sin(pulse) + 1) / 2; // 0..1
      const ringRadius = TILE_SIZE * 0.45 + t * 6;
      const ringAlpha = 0.35 + (1 - t) * 0.45;
      g.circle(cx, cy, ringRadius);
      g.stroke({ width: 2.5, color: 0xb8972a, alpha: ringAlpha });

      // Tile outline.
      const half = TILE_SIZE / 2 - 2;
      g.rect(cx - half, cy - half, half * 2, half * 2);
      g.stroke({ width: 1.5, color: 0xfde7b0, alpha: 0.6 });

      // X mark inside the tile — classic destination signal.
      const xSize = TILE_SIZE * 0.28;
      g.moveTo(cx - xSize, cy - xSize);
      g.lineTo(cx + xSize, cy + xSize);
      g.moveTo(cx + xSize, cy - xSize);
      g.lineTo(cx - xSize, cy + xSize);
      g.stroke({ width: 2, color: 0xfde7b0, alpha: 0.85 });
    },
    [target, pulse],
  );

  if (!target) return null;

  return (
    <pixiContainer>
      <pixiGraphics draw={drawPath} />
      <pixiGraphics draw={drawTarget} />
    </pixiContainer>
  );
}
