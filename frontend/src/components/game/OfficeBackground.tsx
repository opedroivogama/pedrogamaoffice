/**
 * OfficeBackground Component
 *
 * Renders the office floor, walls, and tile pattern using sprites.
 */

import { type ReactNode, useMemo, useCallback } from "react";
import { Graphics, Texture } from "pixi.js";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";

// ============================================================================
// CONSTANTS
// ============================================================================

// Floor/wall dimensions
const WALL_HEIGHT = 400;
const WALL_TRIM_HEIGHT = 10;
const FLOOR_TILE_SIZE = 100;
// Base da parede: y=-20 + height=(WALL_HEIGHT-50)=350 → base em 330.
// Aumentamos +15 só pra descer o RODAPÉ (sem mexer na topbar).
const FLOOR_START_Y = 330;

// Colors — paleta levemente azulada (cool night) pra unificar o mood
// com o lighting overlay e os glows.
const FLOOR_COLOR = 0x252a35;
const WALL_COLOR = 0x363a48;
const WALL_TRIM_COLOR = 0x424658;

// ============================================================================
// TYPES
// ============================================================================

interface OfficeBackgroundProps {
  floorTileTexture?: Texture | null;
  wallTexture?: Texture | null;
}

interface TileData {
  x: number;
  y: number;
}

// ============================================================================
// DRAWING FUNCTION
// ============================================================================

/**
 * Draws the office floor fallback color + wall fallback color.
 * Quando a textura `wall` está disponível ela é renderizada por cima
 * desta função via pixiSprite — esta função vira só backstop.
 */
function drawWalls(g: Graphics): void {
  g.clear();

  // Floor background (fallback color behind tiles) começa em FLOOR_START_Y
  // pra cobrir a região completa que vai virar chão (incluindo gap antigo
  // entre WALL_HEIGHT e onde a parede sprite agora termina).
  g.rect(0, FLOOR_START_Y, CANVAS_WIDTH, CANVAS_HEIGHT - FLOOR_START_Y);
  g.fill(FLOOR_COLOR);

  // Wall fallback (fica abaixo do sprite quando ele carrega)
  g.rect(0, 0, CANVAS_WIDTH, FLOOR_START_Y);
  g.fill(WALL_COLOR);
}

// ============================================================================
// COMPONENT
// ============================================================================

export function OfficeBackground({
  floorTileTexture,
  wallTexture,
}: OfficeBackgroundProps): ReactNode {
  // Carpete único repetido — sem rotação, sem tint, sem variants.
  useMemo(() => {
    if (floorTileTexture?.source) {
      floorTileTexture.source.scaleMode = "linear";
    }
  }, [floorTileTexture]);

  const tiles = useMemo(() => {
    const result: (TileData & { row: number; col: number })[] = [];
    let row = 0;
    for (let y = FLOOR_START_Y; y < CANVAS_HEIGHT; y += FLOOR_TILE_SIZE) {
      let col = 0;
      for (let x = 0; x < CANVAS_WIDTH; x += FLOOR_TILE_SIZE) {
        result.push({
          x: x + FLOOR_TILE_SIZE / 2,
          y: y + FLOOR_TILE_SIZE / 2,
          row,
          col,
        });
        col++;
      }
      row++;
    }
    return result;
  }, []);

  // Stable reference for wall drawing
  const drawWallsCallback = useCallback((g: Graphics) => drawWalls(g), []);

  // Sombra de contato parede→piso: gradient escuro nos ~22px do topo do chão
  // pra "assentar" o piso debaixo da parede em vez de parecer adesivo colado.
  const drawWallShadowCallback = useCallback((g: Graphics) => {
    g.clear();
    const SHADOW_HEIGHT = 22;
    const STEPS = 11;
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1);
      const h = SHADOW_HEIGHT / STEPS;
      const alpha = 0.32 * Math.pow(1 - t, 1.6);
      g.rect(0, FLOOR_START_Y + i * h, CANVAS_WIDTH, h + 1);
      g.fill({ color: 0x000000, alpha });
    }
  }, []);

  return (
    <>
      {/* Walls and floor background (fallback colors abaixo dos sprites) */}
      <pixiGraphics draw={drawWallsCallback} />

      {/* Parede sprite — esticada. +10px cada lado horizontal, -50px
          altura, subida 20px (y=-20) pra base do trim subir junto. */}
      {wallTexture && (
        <pixiSprite
          texture={wallTexture}
          x={-10}
          y={-20}
          width={CANVAS_WIDTH + 20}
          height={WALL_HEIGHT - 50}
        />
      )}

      {/* Chão inteiriço — UMA textura única cobrindo todo o piso
          (1280×694), sem tiling. Tábuas diagonais 35° matching mesa.
          Pedro 2026-06-04: tiles repetidos ficavam óbvios visualmente. */}
      {floorTileTexture && (
        <pixiSprite
          texture={floorTileTexture}
          x={0}
          y={FLOOR_START_Y}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT - FLOOR_START_Y}
        />
      )}

      {/* Sombra de contato parede→piso por cima do chão. */}
      <pixiGraphics draw={drawWallShadowCallback} />
    </>
  );
}
