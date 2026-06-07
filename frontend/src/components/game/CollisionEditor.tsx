/**
 * CollisionEditor - Interactive tile editor for the navigation grid.
 *
 * When active, overlays the office canvas with the full 40×32 tile grid.
 * The user picks a paint mode (WALL / FLOOR / ERASER) and clicks/drags to
 * apply it. Edits persist to localStorage and are picked up automatically
 * by A* pathfinding.
 *
 * Coordinate mapping uses the canvas's `getBoundingClientRect()` directly
 * instead of PIXI's event system, because the canvas sits inside a
 * react-zoom-pan-pinch wrapper whose CSS transform desynchronizes PIXI's
 * cached rect under zoom/pan.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTick } from "@pixi/react";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  TILE_SIZE,
  TileType,
  getNavigationGrid,
} from "@/systems/navigationGrid";
import { useGameStore } from "@/stores/gameStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { getCharacterFootOffsetY } from "@/hooks/usePlayerControl";
import { FOOTPRINT_OFFSETS } from "@/systems/footprintCollision";

const COLOR_BLOCKED = 0xff3030;
const COLOR_FLOOR = 0x30ff60;
const COLOR_OVERRIDE_BORDER = 0xffd84a;
// Layer override paints — não bloqueiam, só afetam z-order de sprites
// de cenário. ABOVE = azul (vai pra cima do player), BELOW = roxo (atrás).
const COLOR_ABOVE = 0x3080ff;
const COLOR_BELOW = 0xc040ff;
// Footprint overlay — mesmos 9 pontos usados pela checagem em
// usePlayerControl.ts (centro + 4 cardeais + 4 diagonais). Quando o
// editor tá ativo, desenhamos os 9 pontos em cima de cada personagem
// pra você ver quais SQM ele "ocupa" e por que (ou não) trava na wall.
// FOOTPRINT_OFFSETS importado de @/systems/footprintCollision (fonte única
// também usada pelo resolveCollidedMove do keyboard control).
const COLOR_FOOTPRINT_OK = 0x00e0ff; // ciano — ponto walkable
const COLOR_FOOTPRINT_BAD = 0xff00ff; // magenta — ponto em wall

export type PaintMode = "wall" | "floor" | "erase" | "above" | "below";

export interface CollisionEditorProps {
  active: boolean;
  paintMode: PaintMode;
}

export function CollisionEditor({ active, paintMode }: CollisionEditorProps) {
  const [version, setVersion] = useState(0);
  const isPaintingRef = useRef(false);
  const lastTileRef = useRef<string>("");
  const paintModeRef = useRef<PaintMode>(paintMode);
  const floorId = useNavigationStore((s) => s.floorId);
  const currentFloorIdRef = useRef(floorId);

  // Keep ref in sync so the long-lived DOM listeners see the latest mode.
  useEffect(() => {
    paintModeRef.current = paintMode;
  }, [paintMode]);

  useEffect(() => {
    currentFloorIdRef.current = floorId;
  }, [floorId]);

  // Carrega overrides do Supabase ao montar / trocar de floor.
  // Pedro 2026-06-06: persistência migrada de localStorage pra Supabase.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/collision/${floorId}`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          tiles: Array<{ gx: number; gy: number; tile_type: string }>;
        };
        const remote: Record<string, TileType> = {};
        for (const t of json.tiles ?? []) {
          const typeMap: Record<string, TileType> = {
            wall: TileType.WALL,
            floor: TileType.FLOOR,
            above: TileType.ABOVE_PLAYER,
            below: TileType.BELOW_PLAYER,
          };
          const tt = typeMap[t.tile_type];
          if (tt !== undefined) remote[`${t.gx},${t.gy}`] = tt;
        }
        getNavigationGrid().replaceAllOverridesFromRemote(remote);
        setVersion((v) => v + 1);
      } catch (err) {
        console.warn(
          "[CollisionEditor] backend load failed; usando cache local:",
          err,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [floorId]);

  useEffect(() => {
    if (!active) return;
    const grid = getNavigationGrid();
    return grid.onChange(() => setVersion((v) => v + 1));
  }, [active]);

  // Suppress browser context menu while active (right-click is reserved for
  // future use; not strictly required with the new paint-mode UX but keeps
  // the editor non-disruptive).
  useEffect(() => {
    if (!active) return;
    const prevent = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", prevent);
    return () => window.removeEventListener("contextmenu", prevent);
  }, [active]);

  // DOM-based pointer handling. We attach to the canvas element directly
  // and use `event.offsetX/Y` which is the click position in the canvas's
  // LOCAL (pre-transform) coordinate space. This is robust against CSS
  // transforms (zoom/pan from react-zoom-pan-pinch).
  useEffect(() => {
    if (!active) return;
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".pixi-canvas-container canvas",
    );
    if (!canvas) {
      // eslint-disable-next-line no-console
      console.warn("[CollisionEditor] canvas not found");
      return;
    }

    // Log setup once so we can verify mapping in the field.
    // eslint-disable-next-line no-console
    console.log("[CollisionEditor] attached", {
      canvasInternal: { w: canvas.width, h: canvas.height },
      canvasStyle: { w: canvas.style.width, h: canvas.style.height },
      canvasClient: { w: canvas.clientWidth, h: canvas.clientHeight },
      rect: canvas.getBoundingClientRect(),
      dpr: window.devicePixelRatio,
      stageSize: { w: CANVAS_WIDTH, h: CANVAS_HEIGHT },
    });

    const applyAt = (
      clientX: number,
      clientY: number,
      isFirst: boolean,
      logIt: boolean,
    ) => {
      // Use the LIVE bounding rect — it reflects any CSS transforms applied
      // by react-zoom-pan-pinch (scale + translate) to the canvas's ancestor
      // chain. `canvas.clientWidth` does NOT reflect those transforms.
      const rect = canvas.getBoundingClientRect();
      const visX = clientX - rect.left;
      const visY = clientY - rect.top;
      // Map visible (transformed) coords → stage coords by the visible/stage
      // size ratio. Equivalent to inverting the CSS transform.
      const stageX = (visX / rect.width) * CANVAS_WIDTH;
      const stageY = (visY / rect.height) * CANVAS_HEIGHT;
      const gx = Math.floor(stageX / TILE_SIZE);
      const gy = Math.floor(stageY / TILE_SIZE);

      if (logIt) {
        // eslint-disable-next-line no-console
        console.log("[CollisionEditor] click", {
          client: { x: clientX, y: clientY },
          rect: { l: rect.left, t: rect.top, w: rect.width, h: rect.height },
          visible: { x: visX.toFixed(1), y: visY.toFixed(1) },
          stage: { x: stageX.toFixed(1), y: stageY.toFixed(1) },
          tile: { gx, gy },
        });
      }

      if (gx < 0 || gx >= GRID_WIDTH || gy < 0 || gy >= GRID_HEIGHT) return;
      const key = `${gx},${gy}`;
      if (!isFirst && key === lastTileRef.current) return;
      lastTileRef.current = key;

      const grid = getNavigationGrid();
      const mode = paintModeRef.current;
      if (mode === "wall") {
        grid.setOverride(gx, gy, TileType.WALL);
      } else if (mode === "floor") {
        grid.setOverride(gx, gy, TileType.FLOOR);
      } else if (mode === "above") {
        grid.setOverride(gx, gy, TileType.ABOVE_PLAYER);
      } else if (mode === "below") {
        grid.setOverride(gx, gy, TileType.BELOW_PLAYER);
      } else {
        grid.setOverride(gx, gy, null);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      getNavigationGrid().beginStroke();
      isPaintingRef.current = true;
      lastTileRef.current = "";
      canvas.setPointerCapture?.(e.pointerId);
      applyAt(e.clientX, e.clientY, true, true);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isPaintingRef.current) return;
      applyAt(e.clientX, e.clientY, false, false);
    };

    const onPointerUp = (e: PointerEvent) => {
      isPaintingRef.current = false;
      lastTileRef.current = "";
      canvas.releasePointerCapture?.(e.pointerId);
      // Fim do stroke — pega o batch de mudanças e empurra pro backend
      // (Supabase). Em background, sem await — UI segue responsiva.
      const grid = getNavigationGrid();
      const changes = grid.endStroke();
      if (changes.size > 0) {
        const tiles: Array<{ gx: number; gy: number; tile_type: string }> = [];
        const deletes: Array<{ gx: number; gy: number }> = [];
        for (const [key, type] of changes) {
          const [gx, gy] = key.split(",").map(Number);
          if (type === null) {
            deletes.push({ gx, gy });
          } else {
            const tile_type =
              type === TileType.WALL
                ? "wall"
                : type === TileType.FLOOR
                  ? "floor"
                  : type === TileType.ABOVE_PLAYER
                    ? "above"
                    : type === TileType.BELOW_PLAYER
                      ? "below"
                      : "floor";
            tiles.push({ gx, gy, tile_type });
          }
        }
        const floorId = currentFloorIdRef.current;
        if (tiles.length > 0) {
          fetch(`/api/v1/collision/${floorId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tiles }),
          }).catch((err) =>
            console.warn("[CollisionEditor] upsert failed:", err),
          );
        }
        for (const d of deletes) {
          fetch(`/api/v1/collision/${floorId}/${d.gx}/${d.gy}`, {
            method: "DELETE",
          }).catch((err) =>
            console.warn("[CollisionEditor] delete failed:", err),
          );
        }
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    const prevCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.style.cursor = prevCursor;
    };
  }, [active]);

  const tiles = useMemo(() => {
    if (!active) return [];
    return getNavigationGrid().getAllTilesForEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, version]);

  if (!active) return null;

  return (
    <pixiContainer zIndex={9999} sortableChildren eventMode="none">
      {/* Tile fill + override border in a single Graphics draw call. */}
      <pixiGraphics
        draw={(g) => {
          g.clear();
          for (const tile of tiles) {
            const isBlocked =
              tile.type === TileType.WALL ||
              tile.type === TileType.DESK ||
              tile.type === TileType.BOSS_DESK;
            const isAbove = tile.type === TileType.ABOVE_PLAYER;
            const isBelow = tile.type === TileType.BELOW_PLAYER;
            const color = isAbove
              ? COLOR_ABOVE
              : isBelow
                ? COLOR_BELOW
                : isBlocked
                  ? COLOR_BLOCKED
                  : COLOR_FLOOR;
            const alpha = tile.overridden
              ? isAbove || isBelow
                ? 0.45
                : 0.5
              : isBlocked
                ? 0.32
                : 0.12;
            g.rect(tile.x, tile.y, TILE_SIZE, TILE_SIZE);
            g.fill({ color, alpha });
            if (tile.overridden) {
              g.rect(tile.x + 1, tile.y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
              g.stroke({ color: COLOR_OVERRIDE_BORDER, width: 2, alpha: 0.9 });
            } else {
              g.rect(tile.x, tile.y, TILE_SIZE, TILE_SIZE);
              g.stroke({ color: 0xffffff, width: 0.5, alpha: 0.18 });
            }
          }
        }}
      />
      <CharacterFootprintsOverlay />
    </pixiContainer>
  );
}

/** Overlay que desenha os 9 pontos da footprint check de cada personagem
 *  vivo no painel (boss, user avatars, agents). Cada ponto que cai em tile
 *  walkable fica ciano; em wall, magenta. Permite ver visualmente por que
 *  um personagem trava ou atravessa uma parede. Pedro 2026-06-06. */
function CharacterFootprintsOverlay() {
  const [tick, setTick] = useState(0);
  useTick(() => setTick((t) => (t + 1) % 1_000_000));
  // Usado pra invalidar memos via dependência opaca.
  void tick;

  return (
    <pixiGraphics
      draw={(g) => {
        g.clear();
        const grid = getNavigationGrid();
        const state = useGameStore.getState();
        const positions: Array<{ x: number; y: number; label: string }> = [];

        // Boss seated/wandering — usa boss.position que reflete ambos.
        positions.push({
          x: state.boss.position.x,
          y: state.boss.position.y,
          label: "boss",
        });

        // User avatars (Pedro / Samurai / Gestor).
        for (const [id, pos] of state.userAvatarPositions) {
          positions.push({ x: pos.x, y: pos.y, label: id });
        }

        // Agents.
        for (const [id, agent] of state.agents) {
          positions.push({
            x: agent.currentPosition.x,
            y: agent.currentPosition.y,
            label: id,
          });
        }

        for (const pos of positions) {
          // Aplica o mesmo offset de pé visual usado na colisão real —
          // assim o que você vê no overlay = o que a footprint check usa.
          const footY = pos.y + getCharacterFootOffsetY(pos.label);
          for (const [dx, dy] of FOOTPRINT_OFFSETS) {
            const px = pos.x + dx;
            const py = footY + dy;
            const gx = Math.floor(px / TILE_SIZE);
            const gy = Math.floor(py / TILE_SIZE);
            const ok = grid.isWalkable(gx, gy);
            g.circle(px, py, 5);
            g.fill({
              color: ok ? COLOR_FOOTPRINT_OK : COLOR_FOOTPRINT_BAD,
              alpha: 0.85,
            });
            g.stroke({ color: 0x000000, width: 1, alpha: 0.6 });
          }
        }
      }}
    />
  );
}
