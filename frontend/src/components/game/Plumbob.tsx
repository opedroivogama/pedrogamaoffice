"use client";

import { useState, useMemo, type ReactNode } from "react";
import { useTick } from "@pixi/react";
import type { Graphics } from "pixi.js";

interface PlumbobProps {
  /** Vertical offset above the character (negative = up). Defaults to -140. */
  y?: number;
}

/**
 * The Sims-style "plumbob" — a green floating diamond rendered above the
 * character currently under player control. Bobs up and down and spins around
 * its vertical axis (squashed horizontally) so it reads as a 3D crystal even
 * though we're in a flat pixi scene.
 */
export function Plumbob({ y = -140 }: PlumbobProps): ReactNode {
  const [t, setT] = useState(0);
  useTick((ticker) => {
    setT((prev) => prev + ticker.deltaTime * 0.06);
  });

  // Bob: ±3 px around the base offset.
  const bob = Math.sin(t * 1.6) * 3;
  // Spin: horizontal scale oscillates between 0.35 and 1 to mimic rotation.
  const spinScaleX = 0.35 + 0.65 * Math.abs(Math.cos(t));
  // Flip side when scale crosses zero so we don't get a mirror flicker.
  const flip = Math.cos(t) < 0 ? -1 : 1;

  const drawDiamond = useMemo(
    () =>
      (g: Graphics): void => {
        g.clear();
        // Diamond points: top, right, bottom, left.
        const w = 14;
        const h = 22;
        // Outline (dark green) — slightly bigger.
        g.poly([0, -h - 1, w + 1, 0, 0, h + 1, -w - 1, 0]);
        g.fill({ color: 0x0a3d0a });
        // Top facet (bright green).
        g.poly([0, -h, w, 0, 0, 0, -w, 0]);
        g.fill({ color: 0x4ade80 });
        // Bottom facet (darker green, gives depth).
        g.poly([0, h, w, 0, 0, 0, -w, 0]);
        g.fill({ color: 0x16a34a });
        // Inner highlight on top facet.
        g.poly([0, -h + 2, w * 0.55, -1, 0, -1, -w * 0.55, -1]);
        g.fill({ color: 0x86efac });
      },
    [],
  );

  return (
    <pixiContainer y={y + bob} scale={{ x: spinScaleX * flip, y: 1 }}>
      <pixiGraphics draw={drawDiamond} />
    </pixiContainer>
  );
}
