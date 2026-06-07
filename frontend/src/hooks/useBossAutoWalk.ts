"use client";

import { useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@/constants/canvas";
import { getNavigationGrid, TILE_SIZE } from "@/systems/navigationGrid";
import { BOSS_POSITION } from "@/systems/queuePositions";

const SPEED_PX_PER_SEC = 140;
const MARGIN = 32;
const ARRIVAL_EPSILON = 2;

// How often the autonomous wander loop picks a fresh target.
const WANDER_INTERVAL_MS = 8000;
const WANDER_MAX_ATTEMPTS = 20;
// Max distance from the desk a wandering boss is allowed to roam. Keeps him
// from disappearing across the room — he's still second in command, just
// stretching his legs.
const WANDER_RADIUS = 280;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function isWalkablePixel(x: number, y: number): boolean {
  const grid = getNavigationGrid();
  const gx = Math.floor(x / TILE_SIZE);
  const gy = Math.floor(y / TILE_SIZE);
  return grid.isWalkable(gx, gy);
}

function pickRandomWalkableTarget(): { x: number; y: number } | null {
  for (let i = 0; i < WANDER_MAX_ATTEMPTS; i++) {
    // Sample in a square around the desk, then keep only points inside the
    // circular WANDER_RADIUS — keeps the boss near home.
    const dx = (Math.random() * 2 - 1) * WANDER_RADIUS;
    const dy = (Math.random() * 2 - 1) * WANDER_RADIUS;
    if (Math.hypot(dx, dy) > WANDER_RADIUS) continue;
    const x = clamp(BOSS_POSITION.x + dx, MARGIN, CANVAS_WIDTH - MARGIN);
    const y = clamp(BOSS_POSITION.y + dy, MARGIN, CANVAS_HEIGHT - MARGIN);
    if (isWalkablePixel(x, y)) return { x, y };
  }
  return null;
}

/**
 * Drives `boss.position` toward `bossWalkTarget` each frame, independently of
 * the player-control system. Two ways to set a target:
 *
 * 1. Backend POST /api/v1/boss/walk — broadcasts a `boss_walk_to` WS message
 *    that the handler in useWebSocketEvents writes into `bossWalkTarget`.
 * 2. The auto-wander behavior below — when the boss is IDLE, this hook picks
 *    a fresh random tile near the desk every WANDER_INTERVAL_MS so Claude
 *    paces around instead of sitting frozen.
 *
 * When the boss enters any non-IDLE state (WORKING / DELEGATING / RECEIVING /
 * etc.), we walk him back to BOSS_POSITION so the seated sprite can render
 * normally during work. He's second in command — work happens at the desk.
 *
 * Manual user control (controlledEntityId === "boss") wins: this hook bails
 * out entirely so it doesn't fight WASD input.
 */
// Modo "Claudius preso na mesa" (Pedro 2026-06-07): enquanto o wander/walk
// não está bem calibrado, mantém o Claudius sempre sentado. OfficeGame faz
// setEntitySeated("boss", ...) no mount; este hook precisa virar no-op pra
// não brigar (auto-wander tentaria mover ele e o sprite oscilaria). Troca
// pra false pra reativar wander.
const CLAUDIUS_PINNED_TO_DESK = true;

export function useBossAutoWalk(): void {
  const target = useGameStore((s) => s.bossWalkTarget);
  const controlled = useGameStore((s) => s.controlledEntityId);
  const backendState = useGameStore((s) => s.boss.backendState);

  // React to backend-state transitions: leaving IDLE means "back to the
  // desk"; entering IDLE means "free to roam". The auto-wander interval is
  // gated on the same state inside the tick.
  useEffect(() => {
    if (CLAUDIUS_PINNED_TO_DESK) return;
    if (controlled === "boss") return;
    const store = useGameStore.getState();
    if (backendState !== "idle") {
      // Heading to work — drop any wander target and walk home if we're away.
      const cur = store.boss.position;
      const dx = cur.x - BOSS_POSITION.x;
      const dy = cur.y - BOSS_POSITION.y;
      if (Math.hypot(dx, dy) > 4) {
        store.setBossWalkTarget({ x: BOSS_POSITION.x, y: BOSS_POSITION.y });
      } else {
        store.setBossWalkTarget(null);
      }
    }
  }, [backendState, controlled]);

  // Periodically pick a new random target while IDLE.
  useEffect(() => {
    if (CLAUDIUS_PINNED_TO_DESK) return;
    if (controlled === "boss") return;
    if (backendState !== "idle") return;
    const tick = () => {
      const store = useGameStore.getState();
      if (store.controlledEntityId === "boss") return;
      if (store.boss.backendState !== "idle") return;
      if (store.bossWalkTarget) return; // still walking
      const next = pickRandomWalkableTarget();
      if (next) store.setBossWalkTarget(next);
    };
    // Small delay so the boss settles at the desk first when transitioning
    // into IDLE before strolling off.
    const initial = window.setTimeout(tick, 1500);
    const id = window.setInterval(tick, WANDER_INTERVAL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, [backendState, controlled]);

  // Animate position toward the active target.
  useEffect(() => {
    if (CLAUDIUS_PINNED_TO_DESK) return;
    if (!target) return;
    if (controlled === "boss") return;

    let rafId = 0;
    let lastTime = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const store = useGameStore.getState();
      const cur = store.boss.position;
      const t = store.bossWalkTarget;
      if (!t) return;

      const dx = t.x - cur.x;
      const dy = t.y - cur.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= ARRIVAL_EPSILON) {
        store.setBossPosition({ x: t.x, y: t.y });
        store.setBossWalkTarget(null);
        return;
      }

      const advance = SPEED_PX_PER_SEC * dt;
      let nx: number;
      let ny: number;
      if (dist <= advance) {
        nx = t.x;
        ny = t.y;
      } else {
        nx = cur.x + (dx / dist) * advance;
        ny = cur.y + (dy / dist) * advance;
      }

      // Respect the navigation grid: if the next step would land on a non-
      // walkable tile, slide along the available axis.
      let resolvedX = nx;
      let resolvedY = ny;
      if (!isWalkablePixel(nx, ny)) {
        if (isWalkablePixel(nx, cur.y)) {
          resolvedY = cur.y;
        } else if (isWalkablePixel(cur.x, ny)) {
          resolvedX = cur.x;
        } else {
          // Fully blocked — drop the target so we don't spin in place.
          store.setBossWalkTarget(null);
          return;
        }
      }

      store.setBossPosition({
        x: clamp(resolvedX, MARGIN, CANVAS_WIDTH - MARGIN),
        y: clamp(resolvedY, MARGIN, CANVAS_HEIGHT - MARGIN),
      });
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [target, controlled]);
}
