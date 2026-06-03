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
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  TILE_SIZE,
  TileType,
  getNavigationGrid,
} from "@/systems/navigationGrid";

const COLOR_BLOCKED = 0xff3030;
const COLOR_FLOOR = 0x30ff60;
const COLOR_OVERRIDE_BORDER = 0xffd84a;

export type PaintMode = "wall" | "floor" | "erase";

export interface CollisionEditorProps {
  active: boolean;
  paintMode: PaintMode;
}

export function CollisionEditor({ active, paintMode }: CollisionEditorProps) {
  const [version, setVersion] = useState(0);
  const isPaintingRef = useRef(false);
  const lastTileRef = useRef<string>("");
  const paintModeRef = useRef<PaintMode>(paintMode);

  // Keep ref in sync so the long-lived DOM listeners see the latest mode.
  useEffect(() => {
    paintModeRef.current = paintMode;
  }, [paintMode]);

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
            const color = isBlocked ? COLOR_BLOCKED : COLOR_FLOOR;
            const alpha = tile.overridden ? 0.5 : isBlocked ? 0.32 : 0.12;
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
    </pixiContainer>
  );
}
