/**
 * Footprint collision check — fonte única do "onde o pé do personagem está"
 * pra que o editor (overlay azul) e o motor de movimento (resolveCollidedMove)
 * usem exatamente a mesma fórmula.
 *
 * Pedro 2026-06-07 / Claudius: antes só o CollisionEditor aplicava
 * `getCharacterFootOffsetY` + os 9 pontos do footprint. O usePlayerControl
 * checava colisão em `position.y` cru e em 1 tile só — por isso os sprites
 * atravessavam mesa mesmo com a wall pintada.
 */

import { TILE_SIZE, type NavigationGrid } from "./navigationGrid";
import { getCharacterFootOffsetY } from "@/hooks/usePlayerControl";

const FOOTPRINT_RADIUS = TILE_SIZE;
const FOOTPRINT_RADIUS_DIAG = FOOTPRINT_RADIUS * 0.71;

/** 9 pontos em torno do pé visual (centro + 4 cardinais + 4 diagonais). */
export const FOOTPRINT_OFFSETS: ReadonlyArray<[number, number]> = [
  [0, 0],
  [-FOOTPRINT_RADIUS, 0],
  [FOOTPRINT_RADIUS, 0],
  [0, -FOOTPRINT_RADIUS],
  [0, FOOTPRINT_RADIUS],
  [-FOOTPRINT_RADIUS_DIAG, -FOOTPRINT_RADIUS_DIAG],
  [FOOTPRINT_RADIUS_DIAG, -FOOTPRINT_RADIUS_DIAG],
  [-FOOTPRINT_RADIUS_DIAG, FOOTPRINT_RADIUS_DIAG],
  [FOOTPRINT_RADIUS_DIAG, FOOTPRINT_RADIUS_DIAG],
];

/** Y visual do pé pra colisão. position.y é a base do canvas do sprite;
 *  o pé real fica em position.y + offset (offset negativo, ~-80 pro
 *  samurai). É o ponto onde o overlay azul do editor é desenhado. */
export function getFootY(positionY: number, entityId: string): number {
  return positionY + getCharacterFootOffsetY(entityId);
}

/** True se TODOS os 9 pontos do footprint em (x, footY) caem em tiles
 *  walkable. `ignoreAgentId` opcional pula o tile dinâmico de um agente
 *  específico (pra ele não bloquear o próprio passo). */
export function isFootprintWalkable(
  grid: NavigationGrid,
  x: number,
  footY: number,
  ignoreAgentId?: string,
): boolean {
  for (const [dx, dy] of FOOTPRINT_OFFSETS) {
    const px = x + dx;
    const py = footY + dy;
    const gx = Math.floor(px / TILE_SIZE);
    const gy = Math.floor(py / TILE_SIZE);
    if (!grid.isWalkable(gx, gy, ignoreAgentId)) return false;
  }
  return true;
}
