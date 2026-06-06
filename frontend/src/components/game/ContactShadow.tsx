"use client";

import { useCallback, type ReactNode } from "react";
import type { Graphics } from "pixi.js";

interface ContactShadowProps {
  /** Largura da elipse (eixo X). */
  width: number;
  /** Altura da elipse (eixo Y). Default = width/4 — formato achatado de
   *  sombra de contato vista de cima/3-4. */
  height?: number;
  /** Opacidade. Default 0.35. */
  alpha?: number;
  /** Offset Y do centro da sombra. Default 0 — centro em (0,0). */
  y?: number;
  /** Offset X do centro da sombra. */
  x?: number;
}

/**
 * Drop shadow elíptico pra dar sensação de contato com o chão.
 * Renderize ANTES do sprite no mesmo container pra que o sprite
 * cubra a parte de cima da elipse.
 */
export function ContactShadow({
  width,
  height,
  alpha = 0.35,
  x = 0,
  y = 0,
}: ContactShadowProps): ReactNode {
  const h = height ?? width / 4;
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      g.ellipse(x, y, width / 2, h / 2);
      g.fill({ color: 0x000000, alpha });
    },
    [width, h, alpha, x, y],
  );
  return <pixiGraphics draw={draw} />;
}
