"use client";

import { useEffect } from "react";
import { useGameStore, type GameStore } from "@/stores/gameStore";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@/constants/canvas";
import { getNavigationGrid, TILE_SIZE } from "@/systems/navigationGrid";
import { directionFromDelta } from "@/hooks/usePedroSprites";

/** Resolve current pixel position of a controlled entity (boss / user avatar
 *  / agent). Returns null if the id is unknown. Mirrors the position-lookup
 *  logic used by the keyboard movement step. */
function getEntityPosition(
  store: GameStore,
  entityId: string,
): { x: number; y: number } | null {
  if (entityId === "boss") return store.boss.position;
  const avatar = store.userAvatarPositions.get(entityId);
  if (avatar) return avatar;
  const agent = store.agents.get(entityId);
  if (agent) return agent.currentPosition;
  return null;
}

/**
 * Resolve a desired step into a final position that respects the navigation
 * grid. If the diagonal target is blocked, try sliding along X or Y. If both
 * are blocked, return the current position unchanged.
 */
function resolveCollidedMove(
  cur: { x: number; y: number },
  dx: number,
  dy: number,
  step: number,
  margin: number,
): { x: number; y: number } {
  const grid = getNavigationGrid();
  const isWalkableAt = (x: number, y: number) => {
    const gx = Math.floor(x / TILE_SIZE);
    const gy = Math.floor(y / TILE_SIZE);
    return grid.isWalkable(gx, gy);
  };

  const targetX = clamp(cur.x + dx * step, margin, CANVAS_WIDTH - margin);
  const targetY = clamp(cur.y + dy * step, margin, CANVAS_HEIGHT - margin);

  if (isWalkableAt(targetX, targetY)) {
    return { x: targetX, y: targetY };
  }
  // Try axis-aligned slides (X-only, then Y-only).
  if (dx !== 0 && isWalkableAt(targetX, cur.y)) {
    return { x: targetX, y: cur.y };
  }
  if (dy !== 0 && isWalkableAt(cur.x, targetY)) {
    return { x: cur.x, y: targetY };
  }
  return cur;
}

const MOVEMENT_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "w",
  "a",
  "s",
  "d",
  "W",
  "A",
  "S",
  "D",
]);

const SPEED_PX_PER_SEC = 220;
const MARGIN = 32;

/**
 * When `controlledEntityId` is set in gameStore, this hook captures WASD /
 * arrow keys and updates the controlled entity's position each frame. ESC
 * releases control.
 *
 * Designed to be mounted once at the page/canvas level. The animation system
 * already skips automatic movement for the controlled entity, so user input
 * is authoritative while a control session is active.
 */
export function usePlayerControl(): void {
  const controlledEntityId = useGameStore((s) => s.controlledEntityId);
  const setControlledEntity = useGameStore((s) => s.setControlledEntity);

  // Global hotkey: pressing C with no entity controlled and nothing focused
  // takes control of Pedro directly. Other characters (Claude/boss,
  // Estagiário, Chrome Dummy) are entered by clicking on them — Pedro is the
  // user's own avatar, so it gets the dedicated shortcut.
  useEffect(() => {
    if (controlledEntityId) return;
    const onHotkey = (e: KeyboardEvent) => {
      if (e.key !== "c" && e.key !== "C") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable
      ) {
        return;
      }
      setControlledEntity("pedro");
    };
    window.addEventListener("keydown", onHotkey);
    return () => window.removeEventListener("keydown", onHotkey);
  }, [controlledEntityId, setControlledEntity]);

  useEffect(() => {
    if (!controlledEntityId) return;

    const pressedKeys = new Set<string>();
    // Tracks whether Shift is held *right now* (independent of arrow keys).
    // While true, ticks change facing-only (no movement) — the character
    // turns to look in that direction without walking. Tracked separately
    // so it works regardless of which key (Shift or arrow) was pressed
    // first, and we also re-sync from `e.shiftKey` on every event to
    // survive focus-loss / sticky-key edge cases.
    const shiftHeldRef = { current: false };

    const onKeyDown = (e: KeyboardEvent) => {
      // Keep the Shift state fresh on every keydown — covers the case
      // where Shift is pressed *after* an arrow is already held.
      shiftHeldRef.current = e.shiftKey;

      if (e.key === "Escape") {
        setControlledEntity(null);
        return;
      }
      if (MOVEMENT_KEYS.has(e.key)) {
        pressedKeys.add(e.key);
        e.preventDefault();
        // Bloqueia o D=debug e outras hotkeys globais enquanto controla.
        e.stopImmediatePropagation();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Always re-sync from the event — handles Shift release while an
      // arrow is still held, and prevents stale `true` after focus loss.
      shiftHeldRef.current = e.shiftKey;

      if (MOVEMENT_KEYS.has(e.key)) {
        pressedKeys.delete(e.key);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const keys = pressedKeys;
      let dx = 0;
      let dy = 0;
      if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) dx -= 1;
      if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) dx += 1;
      if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) dy -= 1;
      if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) dy += 1;

      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        const store = useGameStore.getState();

        // Manual arrow input overrides any in-flight click-to-move path.
        if (store.clickToMoveTarget) {
          store.clearClickToMoveTarget();
        }

        // Shift+arrow → rotate-only. Skip the movement / collision step
        // and just record a facing override. User avatars get an 8-direction
        // Direction8 string; the boss gets a cardinal 4-direction string
        // (sprite sheet only has front/back/side).
        if (shiftHeldRef.current) {
          if (store.userAvatarPositions.has(controlledEntityId)) {
            store.setUserAvatarFacing(
              controlledEntityId,
              directionFromDelta(dx, dy),
            );
            rafId = requestAnimationFrame(tick);
            return;
          }
          if (controlledEntityId === "boss") {
            // Resolve to 4 cardinals — matches WanderingBoss's facing union.
            const cardinal: "south" | "north" | "east" | "west" =
              Math.abs(dx) > Math.abs(dy)
                ? dx > 0
                  ? "east"
                  : "west"
                : dy > 0
                  ? "south"
                  : "north";
            store.setBossFacing(cardinal);
            rafId = requestAnimationFrame(tick);
            return;
          }
        }

        const step = SPEED_PX_PER_SEC * dt;

        if (controlledEntityId === "boss") {
          // Normal movement clears any rotate-only override so the
          // delta-detected facing takes over while walking.
          if (store.bossFacing !== null) store.setBossFacing(null);
          const next = resolveCollidedMove(
            store.boss.position,
            dx,
            dy,
            step,
            MARGIN,
          );
          store.setBossPosition(next);
        } else if (store.userAvatarPositions.has(controlledEntityId)) {
          // Normal movement clears the rotate-only override so the
          // delta-detected facing takes over while walking.
          if (store.userAvatarFacings.has(controlledEntityId)) {
            store.setUserAvatarFacing(controlledEntityId, "");
          }
          const cur = store.userAvatarPositions.get(controlledEntityId);
          if (cur) {
            const next = resolveCollidedMove(cur, dx, dy, step, MARGIN);
            store.setUserAvatarPosition(controlledEntityId, next);
          }
        } else {
          const agent = store.agents.get(controlledEntityId);
          if (agent) {
            const next = resolveCollidedMove(
              agent.currentPosition,
              dx,
              dy,
              step,
              MARGIN,
            );
            store.updateAgentPosition(controlledEntityId, next);
            // Keep target in sync so the animation system doesn't try to
            // "catch up" once control is released.
            store.updateAgentTarget(controlledEntityId, next);
          }
        }
      } else {
        // No keyboard input — if a click-to-move path is queued for this
        // entity, advance one tick along it. Reaches each waypoint then
        // moves to the next; clears the target on the final waypoint.
        const store = useGameStore.getState();
        const ctm = store.clickToMoveTarget;
        if (ctm && ctm.entityId === controlledEntityId) {
          const cur = getEntityPosition(store, controlledEntityId);
          const wp = ctm.path[ctm.pathIdx];
          if (!cur || !wp) {
            store.clearClickToMoveTarget();
          } else {
            const ddx = wp.x - cur.x;
            const ddy = wp.y - cur.y;
            const dist = Math.hypot(ddx, ddy);
            const step = SPEED_PX_PER_SEC * dt;

            let next: { x: number; y: number };
            let advanceWaypoint = false;
            if (dist <= step || dist < 1) {
              next = { x: wp.x, y: wp.y };
              advanceWaypoint = true;
            } else {
              const nx = ddx / dist;
              const ny = ddy / dist;
              next = { x: cur.x + nx * step, y: cur.y + ny * step };
              // Update facing for user avatars while walking the path.
              if (store.userAvatarPositions.has(controlledEntityId)) {
                if (store.userAvatarFacings.has(controlledEntityId)) {
                  store.setUserAvatarFacing(controlledEntityId, "");
                }
              }
            }

            // Commit position via the same setters as keyboard movement.
            if (controlledEntityId === "boss") {
              store.setBossPosition(next);
            } else if (store.userAvatarPositions.has(controlledEntityId)) {
              store.setUserAvatarPosition(controlledEntityId, next);
            } else if (store.agents.has(controlledEntityId)) {
              store.updateAgentPosition(controlledEntityId, next);
              store.updateAgentTarget(controlledEntityId, next);
            }

            if (advanceWaypoint) {
              const nextIdx = ctm.pathIdx + 1;
              if (nextIdx >= ctm.path.length) {
                store.clearClickToMoveTarget();
              } else {
                store.advanceClickToMovePathIdx(nextIdx);
              }
            }
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(rafId);
      pressedKeys.clear();
    };
  }, [controlledEntityId, setControlledEntity]);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
