"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { type Graphics, BlurFilter } from "pixi.js";

interface LightGlowProps {
  /** Raio horizontal da fonte de luz (px). */
  radiusX: number;
  /** Raio vertical da fonte de luz (px). Default = radiusX (círculo). */
  radiusY?: number;
  /** Cor do glow em hex. Default 0xfff0aa (amarelo quente, tipo janela). */
  color?: number;
  /** Alpha do glow (0..1). Default 0.55. */
  alpha?: number;
  /** Intensidade do blur. Default 24. */
  blurStrength?: number;
  /** Offset X. */
  x?: number;
  /** Offset Y. */
  y?: number;
  /** Blend mode. "add" pra glow forte de tela CRT; "normal" pra
   *  halo suave de lâmpada. Default "add". */
  blendMode?: "add" | "normal" | "screen";
}

/**
 * Halo de luz que vaza pra cena. Usa elipse colorida com blur filter
 * pra simular bloom/glow. Renderize ANTES da fonte de luz pra ela
 * ficar nítida em cima do halo.
 */
export function LightGlow({
  radiusX,
  radiusY,
  color = 0xfff0aa,
  alpha = 0.55,
  blurStrength = 24,
  x = 0,
  y = 0,
  blendMode = "add",
}: LightGlowProps): ReactNode {
  const ry = radiusY ?? radiusX;
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      g.ellipse(x, y, radiusX, ry);
      g.fill({ color, alpha });
    },
    [radiusX, ry, color, alpha, x, y],
  );

  const filters = useMemo(
    () => [new BlurFilter({ strength: blurStrength, quality: 4 })],
    [blurStrength],
  );

  return <pixiGraphics draw={draw} filters={filters} blendMode={blendMode} />;
}
