/**
 * OfficeGame - Main Game Canvas
 *
 * Main visualization component using:
 * - Centralized Zustand store
 * - XState state machines
 * - Single animation tick loop
 *
 * The component is purely for rendering - all state logic is in the store/machines.
 */

"use client";

import { Application, extend } from "@pixi/react";
import {
  Container,
  Text,
  Graphics,
  Sprite,
  Application as PixiApplication,
  Texture,
  Rectangle,
  ColorMatrixFilter,
  type FederatedPointerEvent,
} from "pixi.js";
import {
  Fragment,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useTick } from "@pixi/react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { useShallow } from "zustand/react/shallow";
import { performSoftReset, getHmrVersion } from "@/systems/hmrCleanup";

import {
  useGameStore,
  selectAgents,
  selectBoss,
  selectTodos,
  selectDebugMode,
  selectShowPaths,
  selectShowQueueSlots,
  selectShowPhaseLabels,
  selectShowObstacles,
  selectElevatorState,
  selectContextUtilization,
  selectIsCompacting,
  selectPrintReport,
} from "@/stores/gameStore";
import { useAnimationSystem } from "@/systems/animationSystem";
import { useCompactionAnimation } from "@/systems/compactionAnimation";
import { useOfficeTextures } from "@/hooks/useOfficeTextures";
import { useDefaultCharacterTexture } from "@/hooks/useCharacterSprites";
import { useSimulationStatus } from "@/hooks/useSimulationStatus";
import {
  usePedroSprites,
  directionFromDelta,
  type PedroDirectionalIdleFrames,
  type PedroDirectionalWalkFrames,
  type Direction8,
} from "@/hooks/usePedroSprites";
import { usePedroSamuraiSprites } from "@/hooks/usePedroSamuraiSprites";
import { useAttentionStore } from "@/stores/attentionStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { Plumbob } from "@/components/game/Plumbob";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BACKGROUND_COLOR,
} from "@/constants/canvas";
import {
  EMPLOYEE_OF_MONTH_POSITION,
  CITY_WINDOW_POSITION,
  WALL_CLOCK_POSITION,
  WALL_OUTLET_POSITION,
  WHITEBOARD_POSITION,
  WATER_COOLER_POSITION,
  COFFEE_MACHINE_POSITION,
  PRINTER_STATION_POSITION,
  PLANT_POSITION,
  FLOOR_RADIO_POSITION,
  BOSS_RUG_POSITION,
  TRASH_CAN_OFFSET,
} from "@/constants/positions";
import {
  AgentSprite,
  AgentArms,
  AgentHeadset,
  AgentLabel,
  Bubble as AgentBubble,
} from "./AgentSprite";
import {
  BossSprite,
  BossBubble,
  MobileBoss,
  WorkIndicator,
  CLAUDIUS_WORK_INDICATOR_GAP,
  SECONDARY_IDLE_PERIOD_S,
  SECONDARY_IDLE_DURATION_S,
  SECONDARY_IDLE_AMPLITUDE,
} from "./BossSprite";
import { ICON_MAP } from "./shared/iconMap";
import { useNavigationStore } from "@/stores/navigationStore";
import { ALL_FLOOR_ID, LOBBY_FLOOR_ID } from "@/types/navigation";
import {
  BOSS_POSITION,
  PEDRO_DESK_POSITION,
  ELEVATOR_POSITION,
  isInElevatorZone,
} from "@/systems/queuePositions";
import {
  findNearestChair,
  SEATED_CROP_RATIO,
} from "@/constants/chairs";
import { TrashCanSprite } from "./TrashCanSprite";
import { WallClock } from "./WallClock";
import { MusicNotesAura } from "./MusicNotesAura";
import { useElevatorModalStore } from "@/stores/elevatorModalStore";
import { useRadioModalStore } from "@/stores/radioModalStore";
import { Whiteboard } from "./Whiteboard";
import { CityWindow } from "./CityWindow";
import { WallCalendar } from "./WallCalendar";
import { Elevator, isAgentInElevator } from "./Elevator";
import { PrinterStation } from "./PrinterStation";
import { ContactShadow } from "./ContactShadow";
import { LightGlow } from "./LightGlow";
import { DebugOverlays } from "./DebugOverlays";
import { CollisionEditor, type PaintMode } from "./CollisionEditor";
import { getNavigationGrid, TILE_SIZE, TileType } from "@/systems/navigationGrid";
import { shouldIgnoreShortcut } from "@/utils/shortcutGate";
import { calculatePath } from "@/systems/pathfinding";
import {
  getFootY,
  isFootprintWalkable,
} from "@/systems/footprintCollision";
import { useChunkedBubble } from "@/hooks/useChunkedBubble";
import { ClickToMovePath } from "./ClickToMovePath";
import { getCharacterFootOffsetY } from "@/hooks/usePlayerControl";
import type { Position } from "@/types";
import {
  DeskSurfacesBase,
  DeskSurfacesTop,
  useDeskPositions,
} from "./DeskGrid";
import { ZoomControls } from "./ZoomControls";
import { LoadingScreen } from "./LoadingScreen";
import { OfficeBackground } from "./OfficeBackground";

// Register PixiJS components
extend({ Container, Text, Graphics, Sprite });

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface SubagentDotProps {
  x: number;
  y: number;
  color: string;
}

function SubagentDot({ x, y, color }: SubagentDotProps): ReactNode {
  const drawDot = useCallback(
    (g: Graphics) => {
      g.clear();
      g.circle(0, 0, 4);
      // Safe hex parsing with fallback
      const hex = /^#[0-9a-fA-F]{6}$/.test(color)
        ? parseInt(color.slice(1), 16)
        : 0xf59e0b;
      g.fill({ color: hex });
      g.circle(0, 0, 4);
      g.stroke({ color: 0xffffff, alpha: 0.4, width: 1 });
    },
    [color],
  );

  return <pixiGraphics draw={drawDot} x={x} y={y} />;
}

function FloorSign({
  label,
  accent,
}: {
  label: string;
  accent: string;
}): ReactNode {
  const w = 120;
  const h = 24;
  const drawSign = useCallback(
    (g: Graphics) => {
      g.clear();
      // Backing plate
      g.roundRect(-w / 2, -h / 2, w, h, 4);
      g.fill({ color: 0x1e1e1e, alpha: 0.9 });
      // Border
      g.roundRect(-w / 2, -h / 2, w, h, 4);
      const hex = /^#[0-9a-fA-F]{6}$/.test(accent)
        ? parseInt(accent.slice(1), 16)
        : 0x6366f1;
      g.stroke({ color: hex, width: 1.5, alpha: 0.7 });
    },
    [accent],
  );

  return (
    <pixiContainer x={ELEVATOR_POSITION.x} y={ELEVATOR_POSITION.y - 88}>
      <pixiGraphics draw={drawSign} />
      <pixiContainer scale={0.5}>
        <pixiText
          text={label}
          anchor={0.5}
          resolution={2}
          style={{
            fontSize: 18,
            fill: "#ffffff",
            fontFamily: "monospace",
            fontWeight: "bold",
          }}
        />
      </pixiContainer>
    </pixiContainer>
  );
}

// ============================================================================
// FLOATING ICON — transient emoji rising from a character on tool events
// ============================================================================

interface FloatingIconProps {
  x: number;
  y: number;
  icon: string;
  onDone: () => void;
}

function FloatingIcon({ x, y, icon, onDone }: FloatingIconProps): ReactNode {
  const [age, setAge] = useState(0);
  const doneRef = useRef(false);
  useTick((ticker) => {
    if (doneRef.current) return;
    setAge((a) => {
      const next = a + ticker.deltaMS / 1400;
      if (next >= 1 && !doneRef.current) {
        doneRef.current = true;
        onDone();
      }
      return next;
    });
  });
  if (age >= 1) return null;
  return (
    <pixiContainer x={x} y={y - 40 - age * 32} alpha={1 - age}>
      <pixiText
        text={icon}
        anchor={0.5}
        resolution={2}
        style={{ fontSize: 24 }}
      />
    </pixiContainer>
  );
}

// ============================================================================
// WANDERING BOSS — Claude se afastando da mesa
// ============================================================================

interface WanderingBossProps {
  position: { x: number; y: number };
  textures: {
    idle: Texture | null;
    stepLeft: Texture | null;
    stepRight: Texture | null;
    sideIdle: Texture | null;
    sideStep1: Texture | null;
    sideStep2: Texture | null;
    backIdle: Texture | null;
    backStep1: Texture | null;
    backStep2: Texture | null;
    /** Static rotation pra diagonal — sem walk animation, só vira o sprite. */
    seIdle?: Texture | null;
    swIdle?: Texture | null;
    neIdle?: Texture | null;
    nwIdle?: Texture | null;
  };
  /** Breathing-idle frames for the south direction. Cycled when standing still
   *  facing south. Other directions fall back to static idle. */
  idleFrames?: (Texture | null)[] | null;
  tint?: number;
}

/** Toast HTML-overlay com auto-dismiss em 2.5s que aparece quando o
 *  usePlayerControl não consegue achar caminho até o destino. Pedro 2026-06-06. */
function PathErrorToast(): ReactNode {
  const msg = useGameStore((s) => s.pathErrorMessage);
  const setMsg = useGameStore((s) => s.setPathErrorMessage);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg, setMsg]);
  if (!msg) return null;
  return (
    <div
      className="absolute top-6 left-1/2 -translate-x-1/2 z-50 rounded border px-4 py-2 text-sm shadow-lg"
      style={{
        background: "rgba(14, 14, 14, 0.94)",
        borderColor: "#c23838",
        color: "#fde7b0",
        fontFamily: "Montserrat, sans-serif",
        fontWeight: 600,
        pointerEvents: "none",
      }}
    >
      ⚠ {msg}
    </div>
  );
}

/** Plumbob overlay — renderiza um único Plumbob acima de TUDO (depois no
 *  JSX = sempre na frente) que segue o personagem controlado. Pedro 2026-06-06. */
function PlumbobOverlay(): ReactNode {
  const controlledId = useGameStore((s) => s.controlledEntityId);
  const bossPos = useGameStore((s) => s.boss.position);
  const bossChair = useGameStore((s) => s.entitySeats.get("boss") ?? null);
  const userPos = useGameStore((s) =>
    controlledId ? s.userAvatarPositions.get(controlledId) : undefined,
  );
  const agent = useGameStore((s) =>
    controlledId ? s.agents.get(controlledId) : undefined,
  );
  if (!controlledId) return null;
  let x: number;
  let y: number;
  let plumbobY: number;
  if (controlledId === "boss") {
    // Sentado vs em pé: crânio do Claudius sentado fica bem mais baixo
    // (sprite cropado, topo escondido pelo hideOffset). Pedro pediu o
    // plumbob mais perto da cabeça (2026-06-07).
    if (bossChair) {
      // +5 no x compensa o offset que o BossSprite aplica internamente no
      // sprite e na badge (`x={5}` dentro do root em BOSS_POSITION). Sem
      // isso, o plumbob ficava 5px à esquerda da badge/sprite. (Pedro 2026-06-07.)
      x = bossChair.x + 5;
      y = bossChair.deskTopY;
      // PlumbobOverlay está em (chair.x, chair.deskTopY=930) e o BossSprite
      // root está em BOSS_POSITION=(640, 900) → diferença vertical de 30px
      // entre os dois containers. A badge "Claudius" sentada no BossSprite
      // renderiza em y_badge ≈ -114 (relativo ao BossSprite root) com pill
      // de altura 22. No canvas: badge_top ≈ 775. Pra plumbob (altura 22)
      // ficar com folga de 8px acima da badge: canvas_y ≈ 745 → plumbobY =
      // 745 - 930 = -185. (Pedro 2026-06-07: plumbob deve sempre ficar
      // acima da badge de nome.)
      plumbobY = -185;
    } else {
      x = bossPos.x;
      y = bossPos.y;
      plumbobY = -240; // ~12px acima do topo do Claudius em pé
    }
  } else if (userPos) {
    // Se sentado, ancora visualmente na cadeira e ajusta o offset pra que
    // a distância plumbob↔crânio seja a mesma da versão em pé.
    // Em pé (size≈256-282, topPad≈58/248): crânio em -216, plumbob em -270
    // → 54px acima do crânio.
    // Sentado: crânio em -SEATED_CROP_RATIO*216 ≈ -125, então -125-54 = -179.
    const chair = findNearestChair(userPos, 30);
    if (chair) {
      x = chair.x;
      // -11 acompanha o ajuste do anchor do sprite sentado. Na cadeira do
      // boss (y=900) desce 10px junto com sprite/badge. Pedro 2026-06-07.
      const bossChairDrop = chair.y === 900 ? 25 : 0;
      y = chair.deskTopY - 11 + bossChairDrop;
      plumbobY = -133;
    } else {
      x = userPos.x;
      y = userPos.y;
      // Pedro Samurai em pé (size=282, topPad=63/248):
      // crânio em container_y = -282*(1-63/248) ≈ -210
      // badge center em -210-4 = -214 (top edge ≈ -225)
      // plumbob bottom em -225-4 = -229; plumbob_y = -251.
      // (Pedro 2026-06-07 — consistente com badge sentado a 4px do crânio.)
      plumbobY = -251;
    }
  } else if (agent) {
    x = agent.currentPosition.x;
    y = agent.currentPosition.y;
    plumbobY = -120;
  } else {
    return null;
  }
  return (
    <pixiContainer x={x} y={y}>
      <Plumbob y={plumbobY} />
    </pixiContainer>
  );
}

function WanderingBoss({
  position,
  textures,
  idleFrames,
  tint = 0xffffff,
}: WanderingBossProps): ReactNode {
  // Subscribe ao backendState pra mostrar o WorkIndicator (⚔️🔨🛡️)
  // acima da badge mesmo quando Claudius está andando.
  const bossBackendState = useGameStore((s) => s.boss.backendState);
  const isWorking =
    bossBackendState === "working" ||
    bossBackendState === "delegating" ||
    bossBackendState === "receiving";
  // Plumbob aparece quando Claudius está sendo dirigido (clicado pra controlar).
  // Mesmo flag usado em BossSprite.tsx pra versão sentada.
  const isControlled = useGameStore((s) => s.controlledEntityId === "boss");

  const prevPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastMoveTsRef = useRef<number>(0);
  const [facing, setFacing] = useState<
    "south" | "north" | "east" | "west" |
    "south-east" | "south-west" | "north-east" | "north-west"
  >("south");
  const [frameIdx, setFrameIdx] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [idleTime, setIdleTime] = useState(0);

  // Rotate-only override from Shift+arrow while the boss is being controlled.
  // When set, takes precedence over the delta-detected facing below.
  const bossFacingOverride = useGameStore((s) => s.bossFacing);

  useEffect(() => {
    const prev = prevPosRef.current;
    prevPosRef.current = { x: position.x, y: position.y };
    if (!prev) return;
    const dx = position.x - prev.x;
    const dy = position.y - prev.y;
    if (Math.hypot(dx, dy) < 0.5) return;
    lastMoveTsRef.current = performance.now();
    // Resolve to 8 directions — usa as diagonais quando |dx|/|dy| são similares.
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const ratio = Math.max(adx, ady) / Math.max(0.001, Math.min(adx, ady));
    const isDiagonal = ratio < 2.5;
    if (isDiagonal && adx > 0.1 && ady > 0.1) {
      if (dy > 0) {
        setFacing(dx > 0 ? "south-east" : "south-west");
      } else {
        setFacing(dx > 0 ? "north-east" : "north-west");
      }
    } else if (adx > ady) {
      setFacing(dx > 0 ? "east" : "west");
    } else {
      setFacing(dy > 0 ? "south" : "north");
    }
  }, [position]);

  useTick((ticker) => {
    const now = performance.now();
    const moving = now - lastMoveTsRef.current < 120;
    if (moving !== isMoving) setIsMoving(moving);
    if (moving) setFrameIdx((idx) => idx + ticker.deltaMS / 160);
    // Idle breathing accumulator runs whenever standing still — same cadence
    // as the seated BossSprite (~660ms per frame at 4-frame cycle).
    if (!moving) setIdleTime((t) => t + ticker.deltaTime * 0.05);
  });

  // Effective facing: prefer the explicit override (Shift+arrow), fall back
  // to the delta-detected local state.
  const effectiveFacing = bossFacingOverride ?? facing;

  // Idle secundário (suspiro/alongamento) — só conta quando parado, pois
  // idleTime só acumula nesses momentos. Aplicado como scale.y suave.
  const secondaryPhase = (idleTime / 3) % SECONDARY_IDLE_PERIOD_S;
  const inSecondaryIdle = !isMoving && secondaryPhase < SECONDARY_IDLE_DURATION_S;
  const secondaryStretchY = inSecondaryIdle
    ? 1 + SECONDARY_IDLE_AMPLITUDE *
      Math.sin((secondaryPhase / SECONDARY_IDLE_DURATION_S) * Math.PI)
    : 1;

  // Choose texture + horizontal flip per direction.
  let texture: Texture | null = textures.idle;
  let flipX = false;
  if (effectiveFacing === "south") {
    const cycle = [textures.idle, textures.stepLeft, textures.idle, textures.stepRight];
    if (isMoving) {
      texture = cycle[Math.floor(frameIdx) % cycle.length] ?? textures.idle;
    } else {
      // Cycle breathing-idle frames when standing still facing south.
      const validIdle = idleFrames?.filter((t): t is Texture => t != null);
      if (validIdle && validIdle.length > 0) {
        texture = validIdle[Math.floor(idleTime * 1.5) % validIdle.length];
      } else {
        texture = textures.idle;
      }
    }
  } else if (effectiveFacing === "north") {
    const cycle = [textures.backIdle, textures.backStep1, textures.backIdle, textures.backStep2];
    texture = isMoving
      ? cycle[Math.floor(frameIdx) % cycle.length] ?? textures.backIdle
      : textures.backIdle;
  } else if (effectiveFacing === "south-east") {
    // Diagonal — sem walk animation, só rotação estática.
    texture = textures.seIdle ?? textures.sideIdle;
  } else if (effectiveFacing === "south-west") {
    texture = textures.swIdle ?? textures.sideIdle;
    if (!textures.swIdle) flipX = true; // fallback: espelha side
  } else if (effectiveFacing === "north-east") {
    texture = textures.neIdle ?? textures.backIdle;
  } else if (effectiveFacing === "north-west") {
    texture = textures.nwIdle ?? textures.backIdle;
    if (!textures.nwIdle) flipX = true;
  } else {
    // east / west — use side frames, flip horizontally for west
    const cycle = [textures.sideIdle, textures.sideStep1, textures.sideIdle, textures.sideStep2];
    texture = isMoving
      ? cycle[Math.floor(frameIdx) % cycle.length] ?? textures.sideIdle
      : textures.sideIdle;
    flipX = effectiveFacing === "west";
  }

  if (!texture) return null;

  // Sentado só via click explícito (Pedro 2026-06-06): leia o estado
  // entitySeats em vez de findNearestChair por proximidade. WanderingBoss
  // = "boss".
  const chair = useGameStore(
    (s) => s.entitySeats.get("boss") ?? null,
  );
  // Quando sentado, FORÇA usar idle south (textures.idle) como fonte do crop.
  // Sem isso, qualquer ruído no `texture` (frame de walk sobrando após teleporte
  // pra cadeira, micro-update de position por outros sistemas) fazia o sprite
  // sentado animar como se estivesse andando dentro da mesa (Pedro 2026-06-07).
  const seatedSourceTexture = chair ? textures.idle : texture;
  const seatedTexture = useMemo(() => {
    if (!chair || !seatedSourceTexture) return null;
    const src = seatedSourceTexture.source;
    return new Texture({
      source: src,
      frame: new Rectangle(
        0,
        0,
        src.width,
        Math.round(src.height * SEATED_CROP_RATIO),
      ),
    });
  }, [chair, seatedSourceTexture]);

  // Render size dinâmico — sprites grandes (claudeGold/AI_GOLD_HELMET 248px
  // com padding em volta) usam 282 pra match exato do Pedro Samurai (size=282
  // no UserAvatar). Sem isso, o Claudius renderizava em 240 e parecia recuado
  // dentro da mesa em relação ao Pedro, que estica o sprite 248 pra 282 (Pedro
  // 2026-06-07). Fallback chromeDummy (128px sem padding) usa 128.
  const renderSize =
    (texture?.source?.width ?? 128) >= 200 ? 282 : 128;

  // Quando sentado em QUALQUER cadeira (boss desk ou outra), renderiza
  // versão cropada na cadeira. Sem isso, sentar em cadeira de agent fazia
  // Claudius sumir (BossSprite esconde com isAway, WanderingBoss retornava
  // null). Pedro 2026-06-06.
  if (chair && seatedTexture) {
    const seatedHeight = renderSize * SEATED_CROP_RATIO;
    return (
      <pixiContainer
        x={chair.x}
        y={chair.deskTopY - 11}
        zIndex={chair.deskTopY + 44}
      >
        <pixiSprite
          texture={seatedTexture}
          anchor={{ x: 0.5, y: 1 }}
          x={0}
          y={0}
          width={renderSize}
          height={seatedHeight}
          tint={tint}
        />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer
      x={position.x}
      y={position.y}
      zIndex={position.y + getCharacterFootOffsetY("boss")}
    >
      {/* Outer scale.y faz o stretch do idle secundário sem interferir no
          flip horizontal que continua no sprite (scale.x). Wrap só envolve
          o sprite — badge e WorkIndicator ficam fora pra não stretchar. */}
      <pixiContainer scale={{ x: 1, y: secondaryStretchY }}>
        <pixiSprite
          texture={texture}
          anchor={{ x: 0.5, y: 1 }}
          x={0}
          y={0}
          width={renderSize}
          height={renderSize}
          scale={{ x: flipX ? -1 : 1, y: 1 }}
          tint={tint}
        />
      </pixiContainer>
      {/* Badge "Claudius" — mesmo offset usado pela badge sentado em
          BossSprite.tsx (y=-187), pra distância cabeça-pill consistente
          entre andando e sentado. 3px mais perto da cabeça do que a versão
          original (y=-190) a pedido do Pedro. */}
      <pixiContainer y={-187}>
        <pixiGraphics
          draw={(g) => {
            const label = "Claudius";
            const pillW = Math.max(56, label.length * 11 + 20);
            const pillH = 22;
            g.clear();
            g.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 7);
            g.fill({ color: 0x0e0e0e, alpha: 0.9 });
            g.stroke({ color: 0xb8972a, width: 1.5 });
          }}
        />
        <pixiText
          text="Claudius"
          anchor={0.5}
          resolution={2}
          style={{
            fontFamily: "monospace",
            fontSize: 18,
            fill: 0xfde7b0,
            fontWeight: "bold",
          }}
        />
      </pixiContainer>
      {/* WorkIndicator (⚔️🔨🛡️) — mesmo gap acima da badge usado em
          BossSprite.tsx pra Claudius sentado. Mantém consistência visual
          entre os dois estados. */}
      {isWorking && (
        <pixiContainer y={-187 - CLAUDIUS_WORK_INDICATOR_GAP} scale={0.5}>
          <WorkIndicator />
        </pixiContainer>
      )}
      {/* Plumbob renderizado em layer separado (PlumbobOverlay no fim do
          JSX) pra ficar sempre acima de qualquer coisa, incluindo o tampo
          das mesas. Pedro 2026-06-06. */}
    </pixiContainer>
  );
}

// ============================================================================
// USER AVATAR (the person sending commands to Claude — stands in the corner)
// ============================================================================

interface UserAvatarProps {
  /** Stable ID used for player control + popup focus (e.g. "pedro"). */
  id: string;
  texture: Texture | null;
  label: string;
  phase?: number;
  /** Pixel y in source where head (skin/face) ends and shirt begins. */
  neckline?: number;
  /** Pixel y in source where shirt ends and pants begin. */
  waist?: number;
  /** Rendered sprite size in px (square). Default 128. Pedro's new sprite has
   *  extra transparent padding so we render him at 256 to match the others. */
  size?: number;
  /** Ratio of transparent padding at the TOP of the source sprite (0..1).
   *  Used to anchor the name pill just above the actual head instead of the
   *  empty top of the canvas. Pedro's PEDRO/rotations/south.png is 228×228
   *  with the head starting at y=58 → ratio ≈ 0.254. */
  topPaddingRatio?: number;
  /** Optional per-direction idle frames. Array length 1 = static rotation
   *  (legacy behaviour). Length > 1 = breathing-idle, cycled at ~5 fps when
   *  the avatar isn't moving. */
  directionalTextures?: PedroDirectionalIdleFrames;
  /** Optional per-direction walk-cycle frames. When provided AND the avatar
   *  is actively moving, cycle through these frames; otherwise fall back to
   *  the idle directional texture. */
  walkFrames?: PedroDirectionalWalkFrames;
  /** Quando false, o balão de fala não é renderizado aqui — o caller desenha
   *  numa layer top-level pra garantir que fica acima de outros personagens. */
  renderBubble?: boolean;
  /** Quando false, a badge com o nome não é renderizada inline — o caller
   *  desenha em <UserAvatarLabelsLayer/> top-level pra sempre sobrepor. */
  renderLabel?: boolean;
  /** Duração de cada frame do idle em ms. Default 200 (~5fps). Aumentar pra
   *  desacelerar a respiração quando o personagem tem muitos frames de idle. */
  idleFrameDurationMs?: number;
  /** Quando true, desenha uma sombra elíptica de contato sob os pés (só no
   *  estado em pé — no sentado o desk cobriria). Default false pra preservar
   *  visual atual de Pedro/Estagiário; ativado pontualmente em sprites slim
   *  que ficam "flutuando" sem sombra (ex.: Gestor de Tráfego). */
  withShadow?: boolean;
  /** Largura da elipse de sombra (px). Default 80 — compatível com size=256. */
  shadowWidth?: number;
}

// How long a Pedro/Estagiário speech bubble stays on screen (ms).
const USER_AVATAR_BUBBLE_DURATION_MS = 6000;

function UserAvatar({
  id,
  texture,
  label,
  size = 128,
  topPaddingRatio = 0,
  directionalTextures,
  walkFrames,
  renderBubble = true,
  renderLabel = true,
  idleFrameDurationMs = 200,
  withShadow = false,
  shadowWidth = 80,
}: UserAvatarProps): ReactNode {
  const position = useGameStore((s) => s.userAvatarPositions.get(id));
  // Espera o fetch de loadUserAvatarPositions resolver antes de renderizar.
  // Sem isso, o sprite spawna na posição default e teleporta ~200ms depois
  // quando o fetch volta com a posição persistida.
  const positionsHydrated = useGameStore((s) => s.userAvatarsHydrated);
  const controlledEntityId = useGameStore((s) => s.controlledEntityId);
  const bubbleText = useGameStore((s) => s.userAvatarBubbles.get(id));
  const setUserAvatarBubble = useGameStore((s) => s.setUserAvatarBubble);
  const facingOverride = useGameStore((s) => s.userAvatarFacings.get(id));
  const openFocusPopup = useAttentionStore((s) => s.openFocusPopup);
  const clickToFocusEnabled = usePreferencesStore((s) => s.clickToFocusEnabled);

  const isControlled = controlledEntityId === id;

  // Track facing direction based on position deltas. Keeps last direction
  // when idle so Pedro doesn't snap back to south the moment he stops.
  // Also tracks last time the avatar actually moved, used to decide whether
  // to cycle walk frames vs show the idle texture.
  const prevPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastMoveTsRef = useRef<number>(0);
  const [deltaFacing, setDeltaFacing] = useState<Direction8>("south");
  useEffect(() => {
    if (!position) return;
    const prev = prevPosRef.current;
    prevPosRef.current = { x: position.x, y: position.y };
    if (!prev) return;
    const dx = position.x - prev.x;
    const dy = position.y - prev.y;
    if (Math.hypot(dx, dy) < 0.5) return;
    lastMoveTsRef.current = performance.now();
    setDeltaFacing(directionFromDelta(dx, dy));
  }, [position]);

  // facing: store override wins over delta-detected facing.
  const facing: Direction8 =
    (facingOverride as Direction8 | undefined) ?? deltaFacing;

  // Walk-cycle frame index. ~140ms per frame. Only advances while moving.
  // Idle-cycle frame index. ~200ms per frame (~5fps) — respiração lenta.
  // Only advances while parado.
  const [walkFrameIdx, setWalkFrameIdx] = useState(0);
  const [idleFrameIdx, setIdleFrameIdx] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  useTick((ticker) => {
    const now = performance.now();
    const moving = now - lastMoveTsRef.current < 120;
    if (moving !== isMoving) setIsMoving(moving);
    if (moving) {
      setWalkFrameIdx((idx) => idx + ticker.deltaMS / 140);
    } else {
      setIdleFrameIdx((idx) => idx + ticker.deltaMS / idleFrameDurationMs);
    }
  });

  // Choose the active texture: walk frame > idle frame > fallback.
  let activeTexture: Texture | null = texture;
  if (isMoving && walkFrames) {
    const frames = walkFrames[facing];
    if (frames && frames.length > 0) {
      const idx = Math.floor(walkFrameIdx) % frames.length;
      activeTexture = frames[idx];
    } else {
      const idleFrames = directionalTextures?.[facing];
      if (idleFrames && idleFrames.length > 0) activeTexture = idleFrames[0];
    }
  } else {
    const idleFrames = directionalTextures?.[facing];
    if (idleFrames && idleFrames.length > 0) {
      const idx = Math.floor(idleFrameIdx) % idleFrames.length;
      activeTexture = idleFrames[idx];
    }
  }

  // Auto-clear the bubble after USER_AVATAR_BUBBLE_DURATION_MS so prompts
  // don't linger forever. New prompts reset the timer because bubbleText
  // changes and re-runs this effect.
  useEffect(() => {
    if (!bubbleText) return;
    const timer = setTimeout(() => {
      setUserAvatarBubble(id, null);
    }, USER_AVATAR_BUBBLE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [bubbleText, id, setUserAvatarBubble]);

  const handleTap = useCallback(() => {
    if (!clickToFocusEnabled || !position) return;
    const canvas = document.querySelector(".pixi-canvas-container canvas");
    if (!canvas) return;
    const rect = (canvas as HTMLElement).getBoundingClientRect();
    const scale = rect.width / 1280;
    const screenX = rect.left + position.x * scale;
    const screenY = rect.top + position.y * scale;
    openFocusPopup(id, screenX, screenY);
  }, [clickToFocusEnabled, id, openFocusPopup, position]);

  if (!texture || !position) return null;
  // Hold off until loadUserAvatarPositions() resolved — avoids spawn at
  // default coords + visible teleport when the fetch arrives ~200ms later.
  if (!positionsHydrated) return null;

  // Sentado só via click explícito (Pedro 2026-06-06): leia entitySeats.
  const chair = useGameStore(
    (s) => s.entitySeats.get(id) ?? null,
  );

  // Quando sentado, força facing=south (de frente pra câmera).
  // Pedido do Pedro em 2026-06-06.
  if (chair && directionalTextures) {
    const southFrames = directionalTextures["south"];
    if (southFrames && southFrames.length > 0) {
      activeTexture = southFrames[0];
    }
  }

  if (chair && activeTexture) {
    const src = activeTexture.source;
    const seatedSourceH = Math.round(src.height * SEATED_CROP_RATIO);
    const seatedTex = new Texture({
      source: src,
      frame: new Rectangle(0, 0, src.width, seatedSourceH),
    });
    const seatedRenderH = size * SEATED_CROP_RATIO;
    // Pedro 2026-06-07: na cadeira do boss (y=900) desce o sprite 10px pra
    // bater visualmente com a mesa daquela cadeira (que é maior).
    const bossChairDrop = chair.y === 900 ? 25 : 0;
    return (
      <pixiContainer
        x={chair.x}
        y={chair.deskTopY - 11 + bossChairDrop}
        zIndex={chair.deskTopY + 44}
        onPointerTap={handleTap}
        interactive={clickToFocusEnabled}
      >
        <pixiSprite
          texture={seatedTex}
          anchor={{ x: 0.5, y: 1 }}
          x={0}
          y={0}
          width={size}
          height={seatedRenderH}
        />
        {/* Label sits just above the visible head — 4px acima do crânio
            sentado. Fórmula corrigida em 2026-06-07: topo do crânio em
            container coords = size*(topPaddingRatio - SEATED_CROP_RATIO).
            A fórmula anterior `size*SEATED_CROP_RATIO*(1-topPaddingRatio)`
            tratava o padding como se fosse fora do crop e jogava a badge
            longe demais (~33px acima do crânio real). */}
        {renderLabel && (
          <pixiContainer
            y={size * (topPaddingRatio - SEATED_CROP_RATIO) - 4}
          >
            <pixiGraphics
              draw={(g) => {
                const pillW = Math.max(56, label.length * 11 + 20);
                const pillH = 22;
                g.clear();
                g.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 7);
                g.fill({ color: 0x0e0e0e, alpha: 0.9 });
                g.stroke({ color: 0xb8972a, width: 1.5 });
              }}
            />
            <pixiText
              text={label}
              anchor={0.5}
              resolution={2}
              style={{
                fontFamily: "monospace",
                fontSize: 18,
                fill: 0xfde7b0,
                fontWeight: "bold",
              }}
            />
          </pixiContainer>
        )}
        {/* Plumbob foi pra PlumbobOverlay no fim do JSX. */}
      </pixiContainer>
    );
  }

  return (
    <pixiContainer
      x={position.x}
      y={position.y}
      zIndex={position.y + getCharacterFootOffsetY(id)}
      onPointerTap={handleTap}
      interactive={clickToFocusEnabled}
    >
      {/* Sombra elíptica opt-in sob os pés — renderizada ANTES do sprite
          pra ficar atrás. Anchor do sprite é y:1; y=-44 puxa a elipse pra
          junto da base do chibi (sprites com padding inferior ficam
          "flutuando" se a sombra ficar no y=0 do container). */}
      {withShadow && (
        <ContactShadow width={shadowWidth} y={-71} alpha={0.245} />
      )}
      {/* Static full body — no shadow, no breathing animation.
          When directionalTextures is provided, swap based on movement. */}
      <pixiSprite
        texture={activeTexture ?? undefined}
        anchor={{ x: 0.5, y: 1 }}
        x={0}
        y={0}
        width={size}
        height={size}
      />
      {/* Dark pill with gold border behind the name for emphasis. Só inline
          quando renderLabel=true. Senão caller desenha em layer top-level. */}
      {renderLabel && (
        <pixiContainer y={-(size * (1 - topPaddingRatio) + 8)}>
          <pixiGraphics
            draw={(g) => {
              const pillW = Math.max(56, label.length * 11 + 20);
              const pillH = 22;
              g.clear();
              g.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 7);
              g.fill({ color: 0x0e0e0e, alpha: 0.9 });
              g.stroke({ color: 0xb8972a, width: 1.5 });
            }}
          />
          <pixiText
            text={label}
            anchor={0.5}
            resolution={2}
            style={{
              fontFamily: "monospace",
              fontSize: 18,
              fill: 0xfde7b0,
              fontWeight: "bold",
            }}
          />
        </pixiContainer>
      )}
      {/* Plumbob foi pra PlumbobOverlay no fim do JSX. */}

      {/* Speech bubble — shows the user's terminal prompt as Pedro talking.
          maxChars=300 overrides the default 60-char truncation que boss e
          agents usam, então prompts longos do user ficam legíveis.
          Quando renderBubble=false, o caller desenha na top-level layer. */}
      {renderBubble && bubbleText && (
        <AgentBubble
          content={{ type: "speech", text: bubbleText }}
          yOffset={-(size * (1 - topPaddingRatio) + 42)}
          maxChars={300}
        />
      )}
    </pixiContainer>
  );
}

// ============================================================================
// PEDRO BUBBLE LAYER — desenha o balão do Pedro numa camada top-level pra
// garantir que fica acima de qualquer personagem que passe na frente.
// ============================================================================

// Configuração dos UserAvatars pra layer de labels top-level. Quando um
// avatar é adicionado, registrá-lo aqui pra a badge sempre aparecer por cima.
const USER_AVATAR_LABEL_CONFIGS: Array<{
  id: string;
  label: string;
  size: number;
  topPaddingRatio: number;
}> = [
  { id: "pedro-samurai", label: "Pedro", size: 282, topPaddingRatio: 63 / 248 },
];

/**
 * Renderiza a badge (pílula com nome) de cada UserAvatar numa camada
 * top-level — garante que NUNCA é coberta por móvel, mesa, decoração de
 * parede etc. Posição é calculada por avatar: se está parado perto de uma
 * cadeira, ancora no deskTop; senão usa a posição corrente + topPadding.
 */
function UserAvatarLabelsLayer(): ReactNode {
  const positions = useGameStore((s) => s.userAvatarPositions);
  return (
    <>
      {USER_AVATAR_LABEL_CONFIGS.map((cfg) => {
        const pos = positions.get(cfg.id);
        if (!pos) return null;
        const chair = findNearestChair(pos, 30);
        let labelX: number;
        let labelY: number;
        if (chair) {
          // 4px acima do topo real do crânio sentado. -11 acompanha o
          // ajuste do anchor do sprite sentado. Fórmula corrigida Pedro
          // 2026-06-07: topo do crânio sentado em container coords =
          // size*(topPaddingRatio - SEATED_CROP_RATIO). A fórmula anterior
          // `size*SEATED_CROP_RATIO*(1-topPaddingRatio)` jogava badge ~33px
          // acima do crânio real.
          labelX = chair.x;
          // Boss chair (y=880) tem drop de 25px pra alinhar com mesa maior.
          const bossChairDrop = chair.y === 900 ? 25 : 0;
          labelY =
            chair.deskTopY -
            11 +
            cfg.size * (cfg.topPaddingRatio - SEATED_CROP_RATIO) -
            4 +
            bossChairDrop;
        } else {
          // 4px acima do topo do crânio em pé.
          labelX = pos.x;
          labelY = pos.y - (cfg.size * (1 - cfg.topPaddingRatio) + 4);
        }
        const pillW = Math.max(56, cfg.label.length * 11 + 20);
        const pillH = 22;
        return (
          <pixiContainer key={cfg.id} x={labelX} y={labelY}>
            <pixiGraphics
              draw={(g) => {
                g.clear();
                g.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 7);
                g.fill({ color: 0x0e0e0e, alpha: 0.9 });
                g.stroke({ color: 0xb8972a, width: 1.5 });
              }}
            />
            <pixiText
              text={cfg.label}
              anchor={0.5}
              resolution={2}
              style={{
                fontFamily: "monospace",
                fontSize: 18,
                fill: 0xfde7b0,
                fontWeight: "bold",
              }}
            />
          </pixiContainer>
        );
      })}
    </>
  );
}

function PedroBubbleLayer(): ReactNode {
  // Pedro 2026-06-07: lê do "pedro-samurai" (sprite atual) em vez do
  // "pedro" antigo. O bubbleText pode ter sido escrito em qualquer um —
  // tenta samurai primeiro, fallback pra pedro.
  const samuraiPos = useGameStore((s) =>
    s.userAvatarPositions.get("pedro-samurai"),
  );
  const pedroPos = useGameStore((s) => s.userAvatarPositions.get("pedro"));
  const position = samuraiPos ?? pedroPos;
  const bubbleText = useGameStore(
    (s) =>
      s.userAvatarBubbles.get("pedro-samurai") ??
      s.userAvatarBubbles.get("pedro"),
  );
  const chair = useGameStore(
    (s) =>
      s.entitySeats.get("pedro-samurai") ?? s.entitySeats.get("pedro") ?? null,
  );
  if (!position || !bubbleText) return null;
  // Pedro Samurai atual: size=282, topPaddingRatio=63/248. Pedro 2026-06-07:
  // fórmula corrigida — antes usava size=256, topPad=58/228 e fórmula errada
  // de crânio sentado (size*SEATED_CROP_RATIO*(1-topPad)), que jogava a
  // bolha 30-50px acima do real e em pé escapava do crânio.
  const SIZE = 282;
  const TOP_PAD = 63 / 248;
  if (chair) {
    const bossChairDrop = chair.y === 900 ? 25 : 0;
    const x = chair.x;
    const y = chair.deskTopY - 11 + bossChairDrop;
    // Topo crânio sentado = size * (topPad - SEATED_CROP_RATIO). Bolha 42px
    // acima.
    const yOffset = SIZE * (TOP_PAD - SEATED_CROP_RATIO) - 42;
    return (
      <pixiContainer x={x} y={y}>
        <AgentBubble
          content={{ type: "speech", text: bubbleText }}
          yOffset={yOffset}
          maxChars={300}
        />
      </pixiContainer>
    );
  }
  // Em pé: topo crânio em -size * (1 - topPad). Bolha 42px acima.
  const yOffset = -(SIZE * (1 - TOP_PAD) + 42);
  return (
    <pixiContainer x={position.x} y={position.y}>
      <AgentBubble
        content={{ type: "speech", text: bubbleText }}
        yOffset={yOffset}
        maxChars={300}
      />
    </pixiContainer>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Modo "Claudius preso na mesa" (Pedro 2026-06-07): mantém o Claudius
// sempre sentado na própria mesa. Bloqueia movimentação por click e
// auto-walk (useBossAutoWalk tem flag equivalente). Vira false pra
// reativar wander/click-to-move do boss.
const CLAUDIUS_PINNED_TO_DESK = true;

export function OfficeGame(): ReactNode {
  // Track PixiJS app for cleanup
  const appRef = useRef<PixiApplication | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  // Garante que o Claudius começa (e permanece) sentado na própria mesa.
  // Roda no mount e a cada vez que o seat for limpo por algum sistema
  // residual — o store.entitySeats é a fonte da verdade do "sentado".
  useEffect(() => {
    if (!CLAUDIUS_PINNED_TO_DESK) return;
    const store = useGameStore.getState();
    const chair = { x: 460, y: 900, deskTopY: 930 };
    if (!store.entitySeats.has("boss")) {
      store.setEntitySeated("boss", chair);
      store.setBossPosition({ x: chair.x, y: chair.y });
    }
    // Re-pin se algo limpar o seat.
    const unsub = useGameStore.subscribe((state, prev) => {
      const wasSeated = prev.entitySeats.has("boss");
      const isSeated = state.entitySeats.has("boss");
      if (wasSeated && !isSeated) {
        useGameStore.getState().setEntitySeated("boss", chair);
        useGameStore.getState().setBossPosition({ x: chair.x, y: chair.y });
      }
    });
    return () => unsub();
  }, []);

  // Procura o tile walkable mais próximo de um alvo (BFS em anéis).
  // Usado pra "andar até o mais perto possível da cadeira": como a cadeira
  // em si frequentemente está num tile não-walkable (atrás do tampo), o A*
  // mira aqui em vez de na cadeira. Retorna world-coords (centro do tile)
  // ou null se nenhum vizinho até MAX_R for walkable pra essa entity.
  const findApproachTile = useCallback(
    (
      targetX: number,
      targetY: number,
      id: string,
    ): { x: number; y: number } | null => {
      const grid = getNavigationGrid();
      const baseGx = Math.floor(targetX / TILE_SIZE);
      const baseGy = Math.floor(targetY / TILE_SIZE);
      const MAX_R = 6;
      // Radius 0 primeiro — se o próprio tile do alvo for walkable.
      for (let r = 0; r <= MAX_R; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            // Só o ANEL do raio r (skip interior já testado).
            if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const gx = baseGx + dx;
            const gy = baseGy + dy;
            const cx = gx * TILE_SIZE + TILE_SIZE / 2;
            const cy = gy * TILE_SIZE + TILE_SIZE / 2;
            if (isFootprintWalkable(grid, cx, getFootY(cy, id))) {
              return { x: cx, y: cy };
            }
          }
        }
      }
      return null;
    },
    [],
  );

  // Eject helper: quando uma entity sai da cadeira pra andar, teleporta pra
  // um tile walkable em frente à mesa (chair.deskTopY + N*TILE) antes de
  // calcular o path. Sem isso, o A* saía da posição da cadeira (atrás do
  // tampo) e o sprite em pé renderizava dentro da mesa por 1-2 frames até
  // o pathfinder chegar num tile livre (Pedro 2026-06-07).
  const ejectFromChair = useCallback(
    (
      id: string,
      chair: { x: number; y: number; deskTopY: number },
    ): { x: number; y: number } => {
      const grid = getNavigationGrid();
      for (const dy of [TILE_SIZE * 2, TILE_SIZE * 3, TILE_SIZE * 4, TILE_SIZE * 5]) {
        const ejectY = chair.deskTopY + dy;
        if (isFootprintWalkable(grid, chair.x, getFootY(ejectY, id))) {
          return { x: chair.x, y: ejectY };
        }
      }
      // Sem tile livre encontrado — devolve a posição da cadeira pra não
      // travar; o usuário pode tentar novamente.
      return { x: chair.x, y: chair.y };
    },
    [],
  );

  // Click-to-move: when a tile is tapped and a character is being controlled,
  // pathfind from its current position and queue the path in the store. The
  // RAF loop in `usePlayerControl` consumes the queue and walks the entity.
  // Pixi's `global` on a FederatedPointerEvent is world-space (the office
  // canvas is the root coord system here), so no extra zoom/pan conversion
  // is needed — TransformWrapper scales the whole canvas after Pixi.
  const handleFloorTap = useCallback(
    (e: FederatedPointerEvent) => {
      const store = useGameStore.getState();
      const id = store.controlledEntityId;
      if (!id) return;
      // Claudius preso na mesa: ignora click-to-move pra ele.
      if (CLAUDIUS_PINNED_TO_DESK && id === "boss") return;

      // World-space pixel coords come straight from Pixi's global pointer pos
      // (the container that hosts this handler sits in office-world space).
      const x = e.global.x;
      const y = e.global.y;

      // Resolve current position of the controlled entity.
      let cur: { x: number; y: number } | null = null;
      if (id === "boss") cur = store.boss.position;
      else if (store.userAvatarPositions.has(id))
        cur = store.userAvatarPositions.get(id) ?? null;
      else if (store.agents.has(id))
        cur = store.agents.get(id)?.currentPosition ?? null;
      if (!cur) return;

      // Snap target to grid; bail out if a personagem com ESSA footprint
      // não cabe ali (mesma fórmula do keyboard + overlay azul).
      const gx = Math.floor(x / TILE_SIZE);
      const gy = Math.floor(y / TILE_SIZE);
      const grid = getNavigationGrid();
      const targetCx = gx * TILE_SIZE + TILE_SIZE / 2;
      const targetCy = gy * TILE_SIZE + TILE_SIZE / 2;
      if (!isFootprintWalkable(grid, targetCx, getFootY(targetCy, id))) return;

      // Se estava sentado, ejeta primeiro pra frente da mesa e recalcula
      // path do novo ponto. Isso resolve o "sprite andando dentro da mesa"
      // e garante saída visível.
      const seatedChair = store.entitySeats.get(id);
      if (seatedChair) {
        cur = ejectFromChair(id, seatedChair);
        if (id === "boss") store.setBossPosition(cur);
        else if (store.userAvatarPositions.has(id))
          store.setUserAvatarPosition(id, cur);
        else if (store.agents.has(id)) {
          store.updateAgentPosition(id, cur);
          store.updateAgentTarget(id, cur);
        }
        store.setEntitySeated(id, null);
      }

      // Aim at the tile center so the entity comes to rest neatly.
      const target = { x: targetCx, y: targetCy };
      // 4º param = entityId → A* usa footprint+offset (não atravessa mesa).
      const path = calculatePath(cur, target, id, id);
      if (path.length === 0) return;

      store.setClickToMoveTarget({
        entityId: id,
        path,
        pathIdx: 0,
        targetTile: { gx, gy },
      });
    },
    [ejectFromChair],
  );

  // Modal de confirmação pra sentar — evita sentar acidental quando o
  // usuário só clicou pra mexer perto da mesa. Pedro 2026-06-06.
  const [sitConfirmDesk, setSitConfirmDesk] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Click na mesa/cadeira → mostra modal "Sentar?" pro personagem controlado.
  // Se ninguém estiver controlado mas o Pedro existir no painel, assume Pedro
  // automaticamente — antes o click era ignorado e dava impressão de bug
  // (Pedro 2026-06-06).
  const handleDeskTap = useCallback((desk: { x: number; y: number }) => {
    const store = useGameStore.getState();
    if (!store.controlledEntityId) {
      if (store.userAvatarPositions.has("pedro")) {
        store.setControlledEntity("pedro");
      } else {
        return;
      }
    }
    setSitConfirmDesk({ x: desk.x, y: desk.y });
  }, []);

  // Click na mesa do Claudius quando ele está em pé → abre modal "Sentar Claudius?".
  const [sitConfirmBoss, setSitConfirmBoss] = useState(false);
  const handleBossDeskTap = useCallback(() => {
    const store = useGameStore.getState();
    if (store.entitySeats.has("boss")) return; // já sentado
    setSitConfirmBoss(true);
  }, []);
  const confirmSitBoss = useCallback(() => {
    setSitConfirmBoss(false);
    const store = useGameStore.getState();
    store.setEntitySeated("boss", {
      x: 460,
      y: 900,
      deskTopY: 930,
    });
    store.setBossPosition({ x: 460, y: 900 });
  }, []);

  // Confirma → calcula path A* até a cadeira correspondente e dispara
  // click-to-move. A cadeira fica em y=desk.y+12 (ver chairs.ts).
  const confirmSit = useCallback(() => {
    const desk = sitConfirmDesk;
    if (!desk) return;
    setSitConfirmDesk(null);
    const store = useGameStore.getState();
    const id = store.controlledEntityId;
    if (!id) return;
    // Claudius preso na mesa: ignora tentativa de sentar em outra cadeira.
    if (CLAUDIUS_PINNED_TO_DESK && id === "boss") return;
    const chair = findNearestChair({ x: desk.x, y: desk.y + 12 }, 60);
    if (!chair) return;
    let cur: { x: number; y: number } | null = null;
    if (id === "boss") cur = store.boss.position;
    else if (store.userAvatarPositions.has(id))
      cur = store.userAvatarPositions.get(id) ?? null;
    else if (store.agents.has(id))
      cur = store.agents.get(id)?.currentPosition ?? null;
    if (!cur) return;
    // Atalho: se o personagem já está num raio de 4 SQM (= 128px) da
    // cadeira, senta DIRETO sem path. Pedro 2026-06-06.
    const distToChair = Math.hypot(cur.x - chair.x, cur.y - chair.y);
    if (distToChair <= TILE_SIZE * 4) {
      const chairSeat = {
        x: chair.x,
        y: chair.y,
        deskTopY: chair.deskTopY,
      };
      if (id === "boss") store.setBossPosition({ x: chair.x, y: chair.y });
      else if (store.userAvatarPositions.has(id))
        store.setUserAvatarPosition(id, { x: chair.x, y: chair.y });
      else if (store.agents.has(id)) {
        store.updateAgentPosition(id, { x: chair.x, y: chair.y });
        store.updateAgentTarget(id, { x: chair.x, y: chair.y });
      }
      store.setEntitySeated(id, chairSeat);
      return;
    }
    // Se já estava sentado em outra cadeira, ejeta pra frente da mesa
    // primeiro e recalcula path do novo ponto. setEntitySeated(id, novaChair)
    // acontece no fim do path. (Pedro 2026-06-07: igual ao handleFloorTap.)
    const prevChair = store.entitySeats.get(id);
    if (prevChair) {
      cur = ejectFromChair(id, prevChair);
      if (id === "boss") store.setBossPosition(cur);
      else if (store.userAvatarPositions.has(id))
        store.setUserAvatarPosition(id, cur);
      else if (store.agents.has(id)) {
        store.updateAgentPosition(id, cur);
        store.updateAgentTarget(id, cur);
      }
      store.setEntitySeated(id, null);
    }
    // Procura o tile walkable mais perto possível da cadeira. A* não consegue
    // mirar a cadeira direto porque ela costuma ficar atrás do tampo (tile
    // não-walkable). Pedro 2026-06-07.
    const chairSeat = {
      x: chair.x,
      y: chair.y,
      deskTopY: chair.deskTopY,
    };
    const approach = findApproachTile(chair.x, chair.y, id);

    // Helper local pra teleporte direto (sem path) — usado em 2 caminhos
    // de fallback: sem approach tile possível OU path zero ≤ MAX_TELEPORT.
    const TELEPORT_MAX_TILES = 8;
    const distTilesToChair = distToChair / TILE_SIZE;
    const teleportDirect = () => {
      if (id === "boss") store.setBossPosition({ x: chair.x, y: chair.y });
      else if (store.userAvatarPositions.has(id))
        store.setUserAvatarPosition(id, { x: chair.x, y: chair.y });
      else if (store.agents.has(id)) {
        store.updateAgentPosition(id, { x: chair.x, y: chair.y });
        store.updateAgentTarget(id, { x: chair.x, y: chair.y });
      }
      store.setEntitySeated(id, chairSeat);
    };

    if (!approach) {
      // Cadeira em ilha sem vizinhos walkable em até 6 anéis. Teleporta
      // direto se a entity está perto o suficiente.
      if (distTilesToChair <= TELEPORT_MAX_TILES) {
        teleportDirect();
      } else {
        store.setPathErrorMessage("Sem caminho possível");
      }
      return;
    }

    const path = calculatePath(cur, approach, id, id);
    if (path.length === 0) {
      // A* não achou caminho até o approach tile. Mesma regra de fallback.
      if (distTilesToChair <= TELEPORT_MAX_TILES) {
        teleportDirect();
      } else {
        store.setPathErrorMessage("Sem caminho possível");
      }
      return;
    }
    store.setClickToMoveTarget({
      entityId: id,
      path,
      pathIdx: 0,
      targetTile: {
        gx: Math.floor(approach.x / TILE_SIZE),
        gy: Math.floor(approach.y / TILE_SIZE),
      },
      // Quando o path terminar, usePlayerControl lê isso, snap pra cadeira
      // e dispara setEntitySeated.
      sittingTargetChair: chairSeat,
    });
  }, [sitConfirmDesk, ejectFromChair, findApproachTile]);

  // HMR version for forcing remount
  const hmrVersion = getHmrVersion();

  // Load all office textures
  const { textures, loaded: spritesLoaded } = useOfficeTextures();
  const {
    idle: characterTexture,
    typing: characterTypingTexture,
    typingEyeLeft: characterTypingEyeLeftTexture,
    user: userAvatarTexture,
    userSuit: userSuitTexture,
    chromeDummy: chromeDummyTexture,
    chromeDummyStepLeft: chromeDummyStepLeftTexture,
    chromeDummyStepRight: chromeDummyStepRightTexture,
    chromeDummySideIdle: chromeDummySideIdleTexture,
    chromeDummySideStep1: chromeDummySideStep1Texture,
    chromeDummySideStep2: chromeDummySideStep2Texture,
    chromeDummyBackIdle: chromeDummyBackIdleTexture,
    chromeDummyBackStep1: chromeDummyBackStep1Texture,
    chromeDummyBackStep2: chromeDummyBackStep2Texture,
    claudeGoldIdle: claudeGoldIdleTexture,
    claudeGoldStepLeft: claudeGoldStepLeftTexture,
    claudeGoldStepRight: claudeGoldStepRightTexture,
    claudeGoldSideIdle: claudeGoldSideIdleTexture,
    claudeGoldSideStep1: claudeGoldSideStep1Texture,
    claudeGoldSideStep2: claudeGoldSideStep2Texture,
    claudeGoldBackIdle: claudeGoldBackIdleTexture,
    claudeGoldBackStep1: claudeGoldBackStep1Texture,
    claudeGoldBackStep2: claudeGoldBackStep2Texture,
    claudeGoldIdleFrames,
    claudeGoldSEIdle: claudeGoldSEIdleTexture,
    claudeGoldSWIdle: claudeGoldSWIdleTexture,
    claudeGoldNEIdle: claudeGoldNEIdleTexture,
    claudeGoldNWIdle: claudeGoldNWIdleTexture,
    aiSilverIdle: aiSilverIdleTexture,
    aiSilverStepLeft: aiSilverStepLeftTexture,
    aiSilverStepRight: aiSilverStepRightTexture,
    aiSilverSideIdle: aiSilverSideIdleTexture,
    aiSilverSideStep1: aiSilverSideStep1Texture,
    aiSilverSideStep2: aiSilverSideStep2Texture,
    aiSilverBackIdle: aiSilverBackIdleTexture,
    aiSilverBackStep1: aiSilverBackStep1Texture,
    aiSilverBackStep2: aiSilverBackStep2Texture,
    aiSilverIdleFrames,
  } = useDefaultCharacterTexture();
  const { idle: pedroIdleFrames, walk: pedroWalkFrames } =
    usePedroSprites();
  const { idle: samuraiIdleFrames, walk: samuraiWalkFrames } =
    usePedroSamuraiSprites();

  // Start animation system
  useAnimationSystem();

  // Cleanup on unmount (HMR or navigation)
  useEffect(() => {
    return () => {
      // @pixi/react Application handles Pixi app destruction.
      // Only reset game systems to avoid double-destroy of the WebGL context.
      appRef.current = null;
      performSoftReset();
    };
  }, []);

  // Subscribe to store state
  const agents = useGameStore(useShallow(selectAgents));
  const boss = useGameStore(selectBoss);
  // Cycle Claude's response through sentence-sized chunks (every ~1.8s) so
  // the bubble reads like a fast back-and-forth chat with Pedro instead of
  // a single wall-of-text. Frozen on the final chunk after the cycle.
  const cycledBossBubble = useChunkedBubble(boss.bubble.content);
  const todos = useGameStore(selectTodos);
  const debugMode = useGameStore(selectDebugMode);
  const showPaths = useGameStore(selectShowPaths);
  const showQueueSlots = useGameStore(selectShowQueueSlots);
  const showPhaseLabels = useGameStore(selectShowPhaseLabels);
  const showObstacles = useGameStore(selectShowObstacles);
  const elevatorState = useGameStore(selectElevatorState);
  const contextUtilization = useGameStore(selectContextUtilization);
  const isCompacting = useGameStore(selectIsCompacting);
  const printReport = useGameStore(selectPrintReport);

  // Floor info for elevator label
  const floorId = useNavigationStore((s) => s.floorId);
  const buildingConfig = useNavigationStore((s) => s.buildingConfig);
  const floor = useMemo(() => {
    if (floorId === LOBBY_FLOOR_ID) {
      return { name: "Lobby", icon: "\u{1F6AA}", accent: "#94a3b8" };
    }
    if (floorId === ALL_FLOOR_ID) {
      return { name: "Todas as Sessões", icon: "\u{1F310}", accent: "#B8972A" };
    }
    return buildingConfig?.floors.find((f) => f.id === floorId) ?? null;
  }, [floorId, buildingConfig]);

  // Compaction animation state
  const compactionAnimation = useCompactionAnimation();

  // Ambient lighting — tints the whole office based on real wall-clock hour.
  // Dawn warm pink → midday clear → sunset orange → evening blue → night navy.
  // DEMO: a phantom agent that walks between desks and "sits" (isTyping=true)
  // at each one for 3s. Gated by the SIMULAR toggle — only renders/animates
  // when the backend simulation is running.
  const { running: simulationRunning } = useSimulationStatus();
  const [demoPos, setDemoPos] = useState({ x: 250, y: 750 });
  const [demoIsTyping, setDemoIsTyping] = useState(false);
  const demoIsTypingRef = useRef(false);

  // Collision editor — when active, the canvas shows a paintable tile grid.
  // Pick a paint mode (wall/floor/erase) and click/drag to apply. Toggle E.
  const [collisionEditorActive, setCollisionEditorActive] = useState(false);
  const [paintMode, setPaintMode] = useState<PaintMode>("wall");
  const [overrideCount, setOverrideCount] = useState(() =>
    typeof window !== "undefined" ? getNavigationGrid().getOverrideCount() : 0,
  );
  useEffect(() => {
    const grid = getNavigationGrid();
    setOverrideCount(grid.getOverrideCount());
    return grid.onChange(() => setOverrideCount(grid.getOverrideCount()));
  }, []);

  // Ctrl+Z to undo while the editor is active.
  useEffect(() => {
    if (!collisionEditorActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        getNavigationGrid().undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collisionEditorActive]);
  // Demo walker — uses A* via calculatePath so it respects collisions
  // (including any walls the user paints in the editor). Goals are the two
  // desk sit positions; on arrival the agent sits 3 s, then plans a new path
  // to the other desk.
  const demoPathRef = useRef<Position[]>([]);
  const demoPathIdxRef = useRef(0);
  const demoGoalIdxRef = useRef(0);
  useEffect(() => {
    if (!simulationRunning) return;
    const goals: Array<{ x: number; y: number }> = [
      { x: 512, y: 445 }, // SIT at desk row 0, col 1
      { x: 768, y: 637 }, // SIT at desk row 1, col 2
    ];
    const planNextPath = (from: { x: number; y: number }) => {
      const goal = goals[demoGoalIdxRef.current];
      const path = calculatePath(from, goal, "demo-walker");
      demoPathRef.current = path;
      demoPathIdxRef.current = 0;
    };
    // Initial plan
    planNextPath({ x: 250, y: 750 });

    const id = setInterval(() => {
      if (demoIsTypingRef.current) return;
      setDemoPos((prev) => {
        const path = demoPathRef.current;
        if (!path || path.length === 0) {
          planNextPath(prev);
          return prev;
        }
        // Snap to next waypoint
        const target = path[demoPathIdxRef.current];
        if (!target) {
          // End of path — sit, then move to next goal
          demoIsTypingRef.current = true;
          setDemoIsTyping(true);
          setTimeout(() => {
            demoIsTypingRef.current = false;
            setDemoIsTyping(false);
            demoGoalIdxRef.current =
              (demoGoalIdxRef.current + 1) % goals.length;
            planNextPath(prev);
          }, 3000);
          return prev;
        }
        const dx = target.x - prev.x;
        const dy = target.y - prev.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 4) {
          demoPathIdxRef.current += 1;
          return prev;
        }
        const speed = 3;
        return {
          x: prev.x + (dx / dist) * speed,
          y: prev.y + (dy / dist) * speed,
        };
      });
    }, 40);
    return () => clearInterval(id);
  }, [simulationRunning]);

  const [ambient, setAmbient] = useState<{ color: number; alpha: number }>({
    color: 0,
    alpha: 0,
  });
  useEffect(() => {
    const update = () => {
      const h = new Date().getHours();
      // Cores mais saturadas e alphas maiores — com multiply blend mode
      // o efeito é color grading (não overlay translúcido).
      if (h >= 6 && h < 8) setAmbient({ color: 0xffc8a0, alpha: 0.35 });
      else if (h >= 8 && h < 17) setAmbient({ color: 0xfff8e0, alpha: 0.15 });
      else if (h >= 17 && h < 19) setAmbient({ color: 0xff8848, alpha: 0.45 });
      else if (h >= 19 && h < 22) setAmbient({ color: 0x6878b8, alpha: 0.55 });
      else setAmbient({ color: 0x3850a0, alpha: 0.65 });
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  // Floating tool icons — emoji that rises from a character when its bubble
  // icon changes (i.e., the agent/boss starts using a new tool).
  const [floatingIcons, setFloatingIcons] = useState<
    Array<{ id: number; x: number; y: number; icon: string }>
  >([]);
  const lastBubbleIconRef = useRef<Map<string, string>>(new Map());
  const floatIdRef = useRef(0);
  useEffect(() => {
    const spawned: typeof floatingIcons = [];
    const check = (key: string, x: number, y: number, icon?: string | null) => {
      const last = lastBubbleIconRef.current.get(key);
      if (icon && icon !== last) {
        const emoji = ICON_MAP[icon] ?? icon;
        spawned.push({ id: floatIdRef.current++, x, y, icon: emoji });
      }
      if (icon) lastBubbleIconRef.current.set(key, icon);
      else lastBubbleIconRef.current.delete(key);
    };
    for (const agent of agents.values()) {
      check(
        agent.id,
        agent.currentPosition.x,
        agent.currentPosition.y,
        agent.bubble?.content?.icon,
      );
    }
    check(
      "__boss__",
      boss.position.x,
      boss.position.y,
      boss.bubble?.content?.icon,
    );
    if (spawned.length > 0) {
      setFloatingIcons((prev) => [...prev, ...spawned]);
    }
  }, [agents, boss]);
  const removeFloatingIcon = useCallback((id: number) => {
    setFloatingIcons((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Use store's elevator state (controlled by state machine)
  const isElevatorOpen = elevatorState === "open";

  // Calculate occupied desks
  const occupiedDesks = useMemo(() => {
    const desks = new Set<number>();
    for (const agent of agents.values()) {
      if (agent.desk && agent.phase === "idle") {
        desks.add(agent.desk);
      }
    }
    return desks;
  }, [agents]);

  // Calculate desk tasks for marquee display
  const deskTasks = useMemo(() => {
    const tasks = new Map<number, string>();
    for (const agent of agents.values()) {
      if (agent.desk && agent.phase === "idle") {
        const label = agent.currentTask || agent.name || "";
        if (label) tasks.set(agent.desk, label);
      }
    }
    return tasks;
  }, [agents]);

  // Desk count
  const deskCount = useMemo(() => {
    return Math.max(8, Math.ceil(agents.size / 4) * 4);
  }, [agents.size]);

  // Desk positions for Y-sorted rendering
  const deskPositions = useDeskPositions(deskCount, occupiedDesks);

  // Mesas que têm alguém sentado — usadas pra elevar o zIndex do tampo
  // SÓ pra essas mesas, garantindo que o tampo cubra o personagem sentado
  // sem afetar mesas vazias. Pedro 2026-06-07.
  const entitySeatsForDeskTop = useGameStore((s) => s.entitySeats);
  const seatedChairList = useMemo(
    () => [...entitySeatsForDeskTop.values()],
    [entitySeatsForDeskTop],
  );
  const isDeskOccupied = useCallback(
    (desk: { x: number; y: number }) =>
      seatedChairList.some(
        (c) => Math.abs(c.x - desk.x) < 4 && Math.abs(c.y - desk.y) < 50,
      ),
    [seatedChairList],
  );

  // Split da textura da mesa em "top fatia" (só o tampo) + "bottom"
  // (resto). Pedro 2026-06-06: top em 50% deixava o tampo grande demais
  // e cobria a cabeça do personagem quando ele andava bem atrás. Reduzido
  // pra 25% top + 75% bottom — só o tampo cobre o tronco; cabeça aparece
  // acima.
  const DESK_TOP_SPLIT_RATIO = 0.5;
  const deskTextureSplit = useMemo(() => {
    const src = textures.desk?.source;
    if (!src) return null;
    const w = src.width;
    const h = src.height;
    const topH = Math.floor(h * DESK_TOP_SPLIT_RATIO);
    const top = new Texture({
      source: src,
      frame: new Rectangle(0, 0, w, topH),
    });
    const bottom = new Texture({
      source: src,
      frame: new Rectangle(0, topH, w, h - topH),
    });
    return { top, bottom, topHeightCanvas: topH };
  }, [textures.desk]);

  // Keyboard shortcuts for debug
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e)) return;
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      if (e.key === "d" || e.key === "D") {
        useGameStore.getState().setDebugMode(!debugMode);
      }
      if (e.key === "e" || e.key === "E") {
        setCollisionEditorActive((v) => !v);
      }
      // X — silenciar Claude: dispensa balão atual e qualquer fila pendente
      // + força backendState=idle pra cortar fone tocando / "recebendo".
      if (e.key === "x" || e.key === "X") {
        const store = useGameStore.getState();
        store.clearBubbles("boss");
        store.updateBossBackendState("idle");
      }
      if (debugMode) {
        if (e.key === "p" || e.key === "P") {
          useGameStore.getState().toggleDebugOverlay("paths");
        }
        if (e.key === "q" || e.key === "Q") {
          useGameStore.getState().toggleDebugOverlay("queueSlots");
        }
        if (e.key === "l" || e.key === "L") {
          useGameStore.getState().toggleDebugOverlay("phaseLabels");
        }
        if (e.key === "o" || e.key === "O") {
          useGameStore.getState().toggleDebugOverlay("obstacles");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [debugMode]);


  // Reset pan/zoom + centra a view no resize da janela. ResizeObserver foi
  // evitado pra não disparar em micro-reflows (event log/sidebar).
  // Pedro 2026-06-06: além do resetTransform, faz centerView no próximo
  // frame pra recalcular bounds depois que o DOM termina o reflow.
  useEffect(() => {
    const handleResize = () => {
      transformRef.current?.resetTransform(0);
      requestAnimationFrame(() => {
        transformRef.current?.centerView(undefined, 0);
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden relative">
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={1}
        maxScale={3}
        centerZoomedOut={true}
        centerOnInit={true}
        limitToBounds={true}
        panning={{ disabled: false, velocityDisabled: false }}
        wheel={{ step: 0.1 }}
        pinch={{ step: 5 }}
        doubleClick={{ disabled: true }}
      >
        <ZoomControls />
        <TransformComponent
          wrapperClass="w-full h-full"
          contentClass="w-full h-full"
        >
          <div className="pixi-canvas-container w-full h-full">
            <Application
              key={`pixi-app-${hmrVersion}`}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              backgroundColor={BACKGROUND_COLOR}
              autoDensity={true}
              antialias={true}
              resolution={
                typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
              }
              onInit={(app) => {
                appRef.current = app;
                // Color grading global — sat +10%, contraste +5%.
                // Aplicado no stage pra atingir TODA a cena (inclusive
                // o ambient lighting multiply layer).
                const cmf = new ColorMatrixFilter();
                cmf.saturate(0.1, true);
                cmf.contrast(0.05, true);
                app.stage.filters = [cmf];
              }}
            >
              {/* Loading screen - shown while sprites are loading */}
              {!spritesLoaded && <LoadingScreen />}

              {/* Office content - hidden while loading */}
              {spritesLoaded && (
                <>
                  {/* Floor and walls */}
                  <OfficeBackground
                    floorTileTexture={textures.floorTile}
                    wallTexture={textures.wall}
                  />

                  {/* Click-to-move capture layer: invisible rect over the
                      whole office floor. Sits just above the background and
                      below all interactive sprites (chairs, characters), so
                      tapping a sprite still triggers that sprite's handler
                      while taps on bare floor route to click-to-move. */}
                  <pixiContainer
                    eventMode="static"
                    onPointerTap={handleFloorTap}
                  >
                    <pixiGraphics
                      draw={(g) => {
                        g.clear();
                        g.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                        g.fill({ color: 0x000000, alpha: 0.0001 });
                      }}
                    />
                  </pixiContainer>

                  {/* Path + destination marker for the controlled entity. */}
                  <ClickToMovePath />

                  {/* Boss area rug — temporariamente desativado a pedido do
                      Pedro. Pra reativar, troca `false &&` por `textures.bossRug &&`. */}
                  {false && textures.bossRug && (
                    <pixiSprite
                      texture={textures.bossRug}
                      anchor={0.5}
                      x={BOSS_RUG_POSITION.x}
                      y={BOSS_RUG_POSITION.y}
                      scale={0.3}
                    />
                  )}

                  {/* Wall decorations */}
                  <pixiContainer
                    x={EMPLOYEE_OF_MONTH_POSITION.x}
                    y={EMPLOYEE_OF_MONTH_POSITION.y}
                  >
                    <WallCalendar frameTexture={textures.wallCalendarFrame} />
                  </pixiContainer>
                  <pixiContainer
                    x={CITY_WINDOW_POSITION.x}
                    y={CITY_WINDOW_POSITION.y}
                  >
                    {/* Halo discreto da janela — não dominar a cor do céu
                        noturno (calibrado pra ler como respiro de luz). */}
                    <LightGlow
                      radiusX={160}
                      radiusY={90}
                      color={0xffd97a}
                      alpha={0.20}
                      blurStrength={18}
                      blendMode="add"
                    />
                    <CityWindow frameTexture={textures.windowFrame} />
                  </pixiContainer>
                  {/* SafetySign desativada visualmente — componente, posição
                      e doc preservados. Pra reativar, importar SafetySign +
                      SAFETY_SIGN_POSITION e devolver o <pixiContainer> aqui. */}
                  <pixiContainer
                    x={WALL_CLOCK_POSITION.x}
                    y={WALL_CLOCK_POSITION.y}
                  >
                    <WallClock />
                  </pixiContainer>
                  {/* Wall outlet removido em 2026-06-06 a pedido do Pedro
                      (elemento órfão na parede sem função visual). */}
                  <pixiContainer
                    x={WHITEBOARD_POSITION.x}
                    y={WHITEBOARD_POSITION.y}
                  >
                    {/* Glow branco suave do whiteboard iluminado. */}
                    <LightGlow
                      radiusX={170}
                      radiusY={80}
                      color={0xfff8e0}
                      alpha={0.3}
                      blurStrength={26}
                      blendMode="add"
                    />
                    <Whiteboard todos={todos} frameTexture={textures.whiteboardFrame} />
                  </pixiContainer>
                  {textures.waterCooler && (
                    <pixiContainer
                      x={WATER_COOLER_POSITION.x}
                      y={WATER_COOLER_POSITION.y}
                    >
                      <ContactShadow width={42} y={28} />
                      <pixiSprite
                        texture={textures.waterCooler}
                        anchor={0.5}
                        scale={0.158}
                      />
                    </pixiContainer>
                  )}
                  {/* Coffee machine - to the right of water cooler */}
                  {textures.coffeeMachine && (
                    <pixiContainer
                      x={COFFEE_MACHINE_POSITION.x}
                      y={COFFEE_MACHINE_POSITION.y}
                    >
                      <ContactShadow width={48} y={26} />
                      <pixiSprite
                        texture={textures.coffeeMachine}
                        anchor={0.5}
                        scale={0.1}
                      />
                    </pixiContainer>
                  )}

                  {/* Printer station - bottom left corner */}
                  {/* Only print after boss delivers the completion message */}
                  <PrinterStation
                    x={PRINTER_STATION_POSITION.x}
                    y={PRINTER_STATION_POSITION.y}
                    isPrinting={
                      printReport && !isCompacting && !!boss.bubble.content
                    }
                    deskTexture={textures.desk}
                    cornerTableTexture={textures.cornerTable}
                    printerTexture={textures.printer}
                    printerStationTexture={textures.printerStation}
                  />

                  {/* Plant - to the right of printer */}
                  {textures.plant && (
                    <pixiContainer
                      x={PLANT_POSITION.x}
                      y={PLANT_POSITION.y}
                    >
                      <ContactShadow width={48} y={25} />
                      <pixiSprite
                        texture={textures.plant}
                        anchor={0.5}
                        scale={0.1}
                      />
                    </pixiContainer>
                  )}

                  {/* Som de parede ao lado da cafeteira — textura PNG (radio.png,
                      o vintage FM que o Pedro escolheu). Prateleira fininha
                      embaixo, na cor da mesa. Container scale=0.97 shrinka
                      rádio + prateleira juntos sem mexer no scale do sprite
                      (mantém scaleMode linear da textura preservando defin.) */}
                  {textures.radio && (
                    <pixiContainer
                      x={FLOOR_RADIO_POSITION.x}
                      y={FLOOR_RADIO_POSITION.y}
                      scale={0.97}
                      eventMode="static"
                      cursor="pointer"
                      onPointerTap={useRadioModalStore.getState().open}
                    >
                      <pixiGraphics
                        draw={(g) => {
                          g.clear();
                          // Tom dominante da desk.png é #491a03 (mogno escuro).
                          // Prateleira logo abaixo da base do rádio (y=0).
                          const left = -68;
                          const width = 136;
                          // Front face (vertical visível)
                          g.rect(left, 0, width, 5);
                          g.fill({ color: 0x491a03 });
                          // Top highlight (1px no topo - face superior da prateleira)
                          g.rect(left, 0, width, 1);
                          g.fill({ color: 0x6b2a0a });
                          // Sombra fina embaixo
                          g.rect(left, 5, width, 1);
                          g.fill({ color: 0x2a0d02 });
                        }}
                      />
                      <pixiSprite
                        texture={textures.radio}
                        anchor={{ x: 0.5, y: 1 }}
                        scale={0.475}
                      />
                      <MusicNotesAura baseY={-100} />
                    </pixiContainer>
                  )}

                  {/* Elevator with animated doors and agents inside.
                      onTap abre o ElevatorModal com a lista de andares. */}
                  <Elevator
                    isOpen={isElevatorOpen}
                    agents={agents}
                    frameTexture={textures.elevatorFrame}
                    doorTexture={textures.elevatorDoor}
                    headsetTexture={null}
                    sunglassesTexture={null}
                    onTap={useElevatorModalStore.getState().open}
                  />

                  {/* Floor sign above elevator */}
                  {floor && (
                    <FloorSign
                      label={`${floor.icon} ${floor.name}`}
                      accent={floor.accent}
                    />
                  )}

                  {/* Y-sorted layer: chairs, DESKS and agents sorted by Y
                      position (higher Y = in front). Mesa entrou aqui (Pedro
                      2026-06-06) pra permitir personagem passar atrás dela
                      mas na frente da cadeira. */}
                  <pixiContainer sortableChildren={true}>
                    {/* Desk chairs - zIndex = desk.y + 90 (compensa sprites
                        grandes com padding inferior tipo Pedro Samurai
                        size=282: zIndex pedro = position.y - 80, então
                        precisa position.y > desk.y + 170 pra ficar na frente.
                        Pedro 2026-06-07: garante que em pé atrás da mesa
                        fique sempre coberto pela cadeira. Tampo sobe junto
                        pra continuar na frente da cadeira. */}
                    {deskPositions.map((desk, i) => {
                      return (
                        <pixiContainer
                          key={`chair-${i}`}
                          x={desk.x}
                          y={desk.y}
                          zIndex={desk.y + 90}
                          eventMode="static"
                          cursor="pointer"
                          onPointerTap={() => handleDeskTap(desk)}
                        >
                          {textures.chair && (
                            <pixiSprite
                              texture={textures.chair}
                              anchor={0.5}
                              x={0}
                              y={30}
                              scale={0.1386}
                            />
                          )}
                        </pixiContainer>
                      );
                    })}

                    {/* Mesas split em 2 sprites — Pedro 2026-06-07:
                        - top half: zIndex = desk.y + 60. Atrás da cadeira (44)
                          mas frente do sentado (50). Vindo do SOUTH com
                          foot.y > desk.y+60 → personagem cobre o tampo.
                        - bottom half (pernas): Y-sort na base da mesa. */}
                    {deskTextureSplit &&
                      deskPositions.map((desk, i) => {
                        const topVisual =
                          deskTextureSplit.topHeightCanvas * 0.21;
                        // Linha de Y-sort do bottom puxada bem pra baixo
                        // (cobrindo o fundo do sprite). Personagens em pé
                        // na frente da mesa só ficam à frente se o pé
                        // VISUAL passa BEM além da base da mesa. Pedro
                        // 2026-06-06.
                        const baseZ = desk.y + topVisual + 60;
                        // Tampo zIndex = desk.y + 95 (acima da cadeira +90 e
                        // do sentado deskTopY+44 ≈ desk.y+94, abaixo de
                        // personagem com foot.y > desk.y+95). EXCEÇÃO: se
                        // tem alguém sentado nessa mesa, eleva pra garantir
                        // que tampo+monitor fiquem SEMPRE na frente do sentado.
                        // Pedro 2026-06-07: subido de +60 pra +95 junto com
                        // cadeira, pra preservar ordem cadeira < tampo.
                        const topZ = isDeskOccupied(desk)
                          ? 999_000
                          : desk.y + 95;
                        return (
                          <Fragment key={`desk-${i}`}>
                            <pixiContainer
                              x={desk.x}
                              y={desk.y}
                              zIndex={baseZ}
                            >
                              <pixiSprite
                                texture={deskTextureSplit.bottom}
                                anchor={{ x: 0.5, y: 0 }}
                                x={-25}
                                y={-5 + topVisual}
                                scale={0.21}
                              />
                            </pixiContainer>
                            <pixiContainer
                              x={desk.x}
                              y={desk.y}
                              zIndex={topZ}
                              eventMode="static"
                              cursor="pointer"
                              onPointerTap={() => handleDeskTap(desk)}
                            >
                              <pixiSprite
                                texture={deskTextureSplit.top}
                                anchor={{ x: 0.5, y: 0 }}
                                x={-25}
                                y={-5}
                                scale={0.21}
                              />
                            </pixiContainer>
                          </Fragment>
                        );
                      })}

                    {/* Agents outside elevator - zIndex based on feet Y position */}
                    {Array.from(agents.values())
                      .filter(
                        (agent) =>
                          !isAgentInElevator(
                            agent.currentPosition.x,
                            agent.currentPosition.y,
                          ),
                      )
                      .map((agent) => (
                        <pixiContainer
                          key={agent.id}
                          zIndex={
                            agent.currentPosition.y +
                            getCharacterFootOffsetY(agent.id)
                          }
                        >
                          <AgentSprite
                            id={agent.id}
                            name={agent.name}
                            color={agent.color}
                            number={agent.number}
                            position={agent.currentPosition}
                            phase={agent.phase}
                            bubble={agent.bubble.content}
                            headsetTexture={null}
                            sunglassesTexture={null}
                            characterTexture={aiSilverIdleTexture ?? chromeDummyTexture}
                            characterTypingTexture={null}
                            characterTypingEyeLeftTexture={null}
                            characterStepLeftTexture={aiSilverStepLeftTexture ?? chromeDummyStepLeftTexture}
                            characterStepRightTexture={aiSilverStepRightTexture ?? chromeDummyStepRightTexture}
                            characterSideIdleTexture={aiSilverSideIdleTexture ?? chromeDummySideIdleTexture}
                            characterSideStep1Texture={aiSilverSideStep1Texture ?? chromeDummySideStep1Texture}
                            characterSideStep2Texture={aiSilverSideStep2Texture ?? chromeDummySideStep2Texture}
                            characterBackIdleTexture={aiSilverBackIdleTexture ?? chromeDummyBackIdleTexture}
                            characterBackStep1Texture={aiSilverBackStep1Texture ?? chromeDummyBackStep1Texture}
                            characterBackStep2Texture={aiSilverBackStep2Texture ?? chromeDummyBackStep2Texture}
                            characterIdleFrames={aiSilverIdleFrames}
                            characterRenderSize={aiSilverIdleTexture ? 240 : 128}
                            characterFeetOffsetY={aiSilverIdleTexture ? 60 : 0}
                            renderBubble={false}
                            renderLabel={false}
                            isTyping={agent.isTyping}
                          />
                        </pixiContainer>
                      ))}

                    {/* WanderingBoss — Claudius andando. Y-sort com mesas
                        (mesa zIndex=999999 sempre cobre). */}
                    {(() => {
                      const bdx = boss.position.x - BOSS_POSITION.x;
                      const bdy = boss.position.y - BOSS_POSITION.y;
                      const isAtDesk = Math.hypot(bdx, bdy) < 25;
                      if (isAtDesk || compactionAnimation.phase !== "idle")
                        return null;
                      return (
                        <WanderingBoss
                          position={boss.position}
                          tint={0xffffff}
                          textures={{
                            idle: claudeGoldIdleTexture ?? chromeDummyTexture,
                            stepLeft: claudeGoldStepLeftTexture ?? chromeDummyStepLeftTexture,
                            stepRight: claudeGoldStepRightTexture ?? chromeDummyStepRightTexture,
                            sideIdle: claudeGoldSideIdleTexture ?? chromeDummySideIdleTexture,
                            sideStep1: claudeGoldSideStep1Texture ?? chromeDummySideStep1Texture,
                            sideStep2: claudeGoldSideStep2Texture ?? chromeDummySideStep2Texture,
                            backIdle: claudeGoldBackIdleTexture ?? chromeDummyBackIdleTexture,
                            backStep1: claudeGoldBackStep1Texture ?? chromeDummyBackStep1Texture,
                            backStep2: claudeGoldBackStep2Texture ?? chromeDummyBackStep2Texture,
                            seIdle: claudeGoldSEIdleTexture,
                            swIdle: claudeGoldSWIdleTexture,
                            neIdle: claudeGoldNEIdleTexture,
                            nwIdle: claudeGoldNWIdleTexture,
                          }}
                          idleFrames={claudeGoldIdleFrames}
                        />
                      );
                    })()}

                    {/* Pedro Samurai — único UserAvatar humano hoje. NPCs
                        decorativos (gestor-trafego, suporte-comercial,
                        LOBBY_AGENTS) removidos no reset 2026-06-07: voltam
                        andar por andar quando os bridges produzirem dados
                        de verdade. */}
                    <UserAvatar
                      id="pedro-samurai"
                      texture={samuraiIdleFrames.south?.[0] ?? userSuitTexture}
                      label="Pedro"
                      phase={2.9}
                      waist={85}
                      size={282}
                      topPaddingRatio={63 / 248}
                      directionalTextures={samuraiIdleFrames}
                      walkFrames={samuraiWalkFrames}
                      renderBubble={false}
                      renderLabel={false}
                      idleFrameDurationMs={2700}
                      withShadow
                    />

                    {/* Monitor + canecas/decorações das mesas — DENTRO do
                        Y-sort com zIndex=desk.y+80 (mesmo da mesa). Personagens
                        com foot.y maior passam na frente; menor, atrás.
                        Pedro 2026-06-06. */}
                    <DeskSurfacesTop
                      deskCount={deskCount}
                      occupiedDesks={occupiedDesks}
                      deskTasks={deskTasks}
                      monitorTexture={textures.monitor}
                      coffeeMugTexture={textures.coffeeMug}
                      staplerTexture={textures.stapler}
                      deskLampTexture={textures.deskLamp}
                      penHolderTexture={textures.penHolder}
                      magic8BallTexture={textures.magic8Ball}
                      rubiksCubeTexture={textures.rubiksCube}
                      rubberDuckTexture={textures.rubberDuck}
                      thermosTexture={textures.thermos}
                      blueMugTexture={textures.blueMug}
                      blackMugTexture={textures.blackMug}
                      isDeskOccupied={isDeskOccupied}
                    />

                    {/* BossSprite (Claudius sentado) DENTRO do Y-sort. zIndex
                        atrelado a BOSS_POSITION.y (fixed) — agents/avatars com
                        foot.y maior cobrem; menor, são cobertos. */}
                    <pixiContainer
                      zIndex={BOSS_POSITION.y}
                      eventMode="static"
                      cursor="pointer"
                      onPointerTap={handleBossDeskTap}
                    >
                      {(() => {
                        const bdx = boss.position.x - BOSS_POSITION.x;
                        const bdy = boss.position.y - BOSS_POSITION.y;
                        const isAtDesk = Math.hypot(bdx, bdy) < 25;
                        const isAway =
                          !isAtDesk || compactionAnimation.phase !== "idle";
                        return (
                          <BossSprite
                            position={BOSS_POSITION}
                            state={boss.backendState}
                            bubble={boss.bubble.content}
                            inUseBy={boss.inUseBy}
                            chairTexture={textures.chairRed ?? textures.chair}
                            deskTexture={textures.desk}
                            keyboardTexture={textures.keyboard}
                            monitorTexture={textures.monitor}
                            phoneTexture={textures.phone}
                            headsetTexture={null}
                            sunglassesTexture={null}
                            characterTexture={claudeGoldIdleTexture ?? chromeDummyTexture}
                            characterTypingTexture={claudeGoldIdleTexture ?? chromeDummyTexture}
                            characterTypingEyeLeftTexture={claudeGoldIdleTexture ?? chromeDummyTexture}
                            characterIdleFrames={claudeGoldIdleFrames}
                            characterRenderSize={claudeGoldIdleTexture ? 282 : 128}
                            renderBubble={false}
                            isTyping={true /* TEMP DEBUG: forced typing pose */}
                            isWorking={
                              boss.backendState === "working" ||
                              boss.backendState === "delegating" ||
                              boss.backendState === "receiving"
                            }
                            isAway={isAway}
                          />
                        );
                      })()}
                    </pixiContainer>

                    {/* Mesa do Pedro — visual idêntico ao mobiliário do
                        Claudius (mesma sprite + cadeira preta), mas SEM o
                        BossSprite. Render inline pra evitar herdar o
                        onPointerTap=openFocusPopup("boss") que está hardcoded
                        no BossSprite. Click chama handleDeskTap (mesmo fluxo
                        das mesas dos agents). Pedro 2026-06-07. */}
                    {/* Mesa do Pedro em DUAS camadas Y-sortadas pra que o
                        tampo cubra o personagem sentado (igual o padrão das
                        mesas do grid: desk.y+80). Camada 1 (sombra+cadeira)
                        fica ATRÁS do personagem; camada 2 (tampo da mesa)
                        fica NA FRENTE. */}

                    {/* Camada 1: sombra + cadeira azul — atrás do personagem
                        sentado mas com encosto visível acima dele.
                        zIndex = +70 (deskTopY-PEDRO_DESK_POSITION.y=30, então
                        sentado zIndex=deskTopY+44=974; cadeira +70=970, 4
                        abaixo do sentado igual padrão das mesas normais).
                        Cadeira y={30} alinha com sprite das mesas normais
                        (encosto + assento visíveis). Pedro 2026-06-07. */}
                    <pixiContainer
                      x={PEDRO_DESK_POSITION.x}
                      y={PEDRO_DESK_POSITION.y}
                      zIndex={PEDRO_DESK_POSITION.y + 70}
                      eventMode="static"
                      cursor="pointer"
                      onPointerTap={() => handleDeskTap(PEDRO_DESK_POSITION)}
                    >
                      <ContactShadow width={170} height={26} y={50} alpha={0.4} />
                      {textures.chair && (
                        <pixiSprite
                          texture={textures.chair}
                          anchor={0.5}
                          x={0}
                          y={30}
                          scale={0.1386}
                        />
                      )}
                    </pixiContainer>

                    {/* Camada 1.5: pernas da mesa (bottom split) — atrás do
                        personagem sentado/cadeira pra Y-sort funcionar.
                        Pedro 2026-06-07: split equivalente ao das mesas
                        normais pra encosto da cadeira ficar visível. */}
                    {deskTextureSplit && (
                      <pixiContainer
                        x={PEDRO_DESK_POSITION.x}
                        y={PEDRO_DESK_POSITION.y}
                        zIndex={
                          PEDRO_DESK_POSITION.y +
                          deskTextureSplit.topHeightCanvas * 0.21 +
                          60
                        }
                      >
                        <pixiSprite
                          texture={deskTextureSplit.bottom}
                          anchor={{ x: 0.5, y: 0 }}
                          x={-25}
                          y={-5 + deskTextureSplit.topHeightCanvas * 0.21}
                          scale={{ x: 0.27, y: 0.21 }}
                        />
                      </pixiContainer>
                    )}

                    {/* Camada 2: tampo da mesa (top split) — na frente do
                        sentado pra cobrir cintura. Antes usava sprite inteiro
                        textures.desk que cobria todo o encosto da cadeira;
                        agora só metade superior igual mesas normais (Pedro
                        2026-06-07). */}
                    {deskTextureSplit && (
                      <pixiContainer
                        x={PEDRO_DESK_POSITION.x}
                        y={PEDRO_DESK_POSITION.y}
                        zIndex={PEDRO_DESK_POSITION.y + 75}
                        eventMode="static"
                        cursor="pointer"
                        onPointerTap={() => handleDeskTap(PEDRO_DESK_POSITION)}
                      >
                        <pixiSprite
                          texture={deskTextureSplit.top}
                          anchor={{ x: 0.5, y: 0 }}
                          x={-25}
                          y={-5}
                          scale={{ x: 0.27, y: 0.21 }}
                        />
                      </pixiContainer>
                    )}
                  </pixiContainer>

                  {/* Sombras das mesas (always-back) + teclado. Sprite da
                      mesa em si desligado aqui — vai pro container Y-sorted
                      abaixo pra concorrer com personagem/cadeira por zIndex.
                      zIndex=1 pra ficar ATRÁS de tudo (sombras no chão). */}
                  <pixiContainer zIndex={1}>
                  <DeskSurfacesBase
                    deskCount={deskCount}
                    occupiedDesks={occupiedDesks}
                    deskTexture={textures.desk}
                    keyboardTexture={textures.keyboard}
                    renderDeskSprite={false}
                  />
                  </pixiContainer>

                  {/* Agent arms + headsets removed when using character sprite texture */}

                  {/* DEMO: phantom agent walking + sitting. Only rendered
                      while the SIMULAR toggle is on. */}
                  {simulationRunning && (
                  <pixiContainer zIndex={demoPos.y}>
                    <AgentSprite
                      id="__demo_walker__"
                      name={demoIsTyping ? "Demo (sentado)" : "Demo"}
                      color="#ff8800"
                      number={999}
                      position={demoPos}
                      phase="idle"
                      bubble={null}
                      headsetTexture={null}
                      sunglassesTexture={null}
                      characterTexture={aiSilverIdleTexture ?? chromeDummyTexture}
                      characterTypingTexture={aiSilverIdleTexture ?? chromeDummyTexture}
                      characterStepLeftTexture={aiSilverStepLeftTexture ?? chromeDummyStepLeftTexture}
                      characterStepRightTexture={aiSilverStepRightTexture ?? chromeDummyStepRightTexture}
                      characterSideIdleTexture={aiSilverSideIdleTexture ?? chromeDummySideIdleTexture}
                      characterSideStep1Texture={aiSilverSideStep1Texture ?? chromeDummySideStep1Texture}
                      characterSideStep2Texture={aiSilverSideStep2Texture ?? chromeDummySideStep2Texture}
                      characterBackIdleTexture={aiSilverBackIdleTexture ?? chromeDummyBackIdleTexture}
                      characterBackStep1Texture={aiSilverBackStep1Texture ?? chromeDummyBackStep1Texture}
                      characterBackStep2Texture={aiSilverBackStep2Texture ?? chromeDummyBackStep2Texture}
                      characterIdleFrames={aiSilverIdleFrames}
                      characterRenderSize={aiSilverIdleTexture ? 240 : 128}
                      characterFeetOffsetY={aiSilverIdleTexture ? 60 : 0}
                      renderBubble={false}
                      renderLabel={true}
                      isTyping={demoIsTyping}
                    />
                  </pixiContainer>
                  )}

                  {/* DeskSurfacesTop foi movido pra DENTRO do Y-sort acima
                      (com zIndex=desk.y+80) pra canecas/monitores Y-sortarem
                      com personagens. Pedro 2026-06-06. */}

                  {/* BossSprite (seated) também foi MOVIDO pra dentro do
                      sortable acima pra Y-sort com mesas/canecas/personagens
                      (Pedro 2026-06-06). */}

                  {/* Mobile Boss (when walking to/from trash can) */}
                  <pixiContainer zIndex={compactionAnimation.bossPosition?.y ?? 0}>
                  {compactionAnimation.bossPosition && (
                    <MobileBoss
                      position={compactionAnimation.bossPosition}
                      jumpOffset={compactionAnimation.jumpOffset}
                      scale={compactionAnimation.bossScale}
                      sunglassesTexture={null}
                      headsetTexture={null}
                    />
                  )}
                  </pixiContainer>

                  {/* Trash Can (Context Utilization Indicator) - fixed next
                      to boss desk; doesn't follow when boss walks away. */}
                  <pixiContainer zIndex={BOSS_POSITION.y + TRASH_CAN_OFFSET.y}>
                  <TrashCanSprite
                    x={BOSS_POSITION.x + TRASH_CAN_OFFSET.x}
                    y={BOSS_POSITION.y + TRASH_CAN_OFFSET.y}
                    contextUtilization={
                      compactionAnimation.phase !== "idle"
                        ? compactionAnimation.animatedContextUtilization
                        : contextUtilization
                    }
                    isCompacting={isCompacting}
                    isStomping={compactionAnimation.isStomping}
                    texture={textures.trashCan}
                  />
                  </pixiContainer>

                  {/* UserAvatars (Pedro/gestor/samurai) foram MOVIDOS pra
                      dentro do sortable acima pra Y-sort com mesas. */}
                  {/* Estagiário and Chrome Dummy hidden por hora — uncomment
                      to bring them back into the office. */}
                  {/*
                  <UserAvatar
                    id="estagiario"
                    texture={userAvatarTexture}
                    label="Estagiário"
                  />
                  <UserAvatar
                    id="chrome-dummy"
                    texture={chromeDummyTexture}
                    label="Chrome Dummy"
                  />
                  */}

                  {/* Debug overlays */}
                  {debugMode && (
                    <DebugOverlays
                      showPaths={showPaths}
                      showQueueSlots={showQueueSlots}
                      showPhaseLabels={showPhaseLabels}
                      showObstacles={showObstacles}
                    />
                  )}

                  {/* Collision editor overlay (paintable grid) */}
                  <CollisionEditor
                    active={collisionEditorActive}
                    paintMode={paintMode}
                  />

                  {/* Debug mode indicator */}
                  {debugMode && (
                    <pixiText
                      text="DEBUG MODE (D=toggle, P=paths, Q=queue, L=labels, O=obstacles, T=time)"
                      x={10}
                      y={10}
                      style={{
                        fontSize: 12,
                        fill: 0x00ff00,
                        fontFamily: "monospace",
                      }}
                    />
                  )}

                  {/* Labels Layer - rendered on top of most things */}
                  {Array.from(agents.values())
                    .filter(
                      (agent) =>
                        agent.name && !isInElevatorZone(agent.currentPosition),
                    )
                    .map((agent) => (
                      <AgentLabel
                        key={`label-${agent.id}`}
                        name={agent.name!}
                        position={agent.currentPosition}
                      />
                    ))}

                  {/* Character Type Overlays - crown/badge/dot per agent type */}
                  {Array.from(agents.values())
                    .filter(
                      (agent) =>
                        agent.characterType &&
                        !isInElevatorZone(agent.currentPosition),
                    )
                    .map((agent) => (
                      <pixiContainer
                        key={`chartype-${agent.id}`}
                        zIndex={agent.currentPosition.y + 20}
                      >
                        {/* Lead crown overlay */}
                        {agent.characterType === "lead" && (
                          <pixiText
                            text="👑"
                            style={{ fontSize: 14 }}
                            x={agent.currentPosition.x - 8}
                            y={agent.currentPosition.y - 52}
                          />
                        )}

                        {/* Teammate badge + nameplate overlay */}
                        {agent.characterType === "teammate" && (
                          <>
                            <pixiText
                              text="🎖️"
                              style={{ fontSize: 10 }}
                              x={agent.currentPosition.x - 6}
                              y={agent.currentPosition.y - 46}
                            />
                            {agent.name && (
                              <pixiText
                                text={agent.name}
                                style={{
                                  fontSize: 7,
                                  fill: agent.color ?? "#3b82f6",
                                  fontFamily: "monospace",
                                  fontWeight: "bold",
                                }}
                                x={agent.currentPosition.x - 18}
                                y={agent.currentPosition.y - 34}
                              />
                            )}
                          </>
                        )}

                        {/* Subagent shoulder dot */}
                        {agent.characterType === "subagent" &&
                          (() => {
                            const parentAgent = agent.parentId
                              ? Array.from(agents.values()).find(
                                  (a) => a.id === agent.parentId,
                                )
                              : null;
                            const dotColor = parentAgent?.color ?? "#f59e0b";
                            return (
                              <SubagentDot
                                key={`dot-${agent.id}`}
                                x={agent.currentPosition.x + 10}
                                y={agent.currentPosition.y - 28}
                                color={dotColor}
                              />
                            );
                          })()}
                      </pixiContainer>
                    ))}

                  {/* Bubbles Layer - rendered on top of everything */}
                  {Array.from(agents.values())
                    .filter(
                      (agent) =>
                        agent.bubble.content &&
                        !isInElevatorZone(agent.currentPosition),
                    )
                    .map((agent) => (
                      <pixiContainer
                        key={`bubble-${agent.id}`}
                        x={agent.currentPosition.x}
                        y={agent.currentPosition.y}
                      >
                        <AgentBubble
                          content={agent.bubble.content!}
                          yOffset={-80}
                        />
                      </pixiContainer>
                    ))}
                  {/* Balão do Claudius — renderiza chunks ciclados de
                      `cycledBossBubble` (resposta crua dividida em
                      sentenças, ~1.8s cada, congela na última).
                      Regra do Pedro (2026-06-03): só aparece quando ele
                      está sentado em alguma cadeira. Se levantou e tá
                      andando, o balão some — mesma heurística que o
                      WanderingBoss usa pra trocar pro sprite sentado.
                      Clicar dispensa o balão e força backendState=idle
                      pra cortar também a ligação/recebimento em curso. */}
                  {cycledBossBubble && findNearestChair(boss.position, 30) && (
                    <pixiContainer
                      x={boss.position.x}
                      y={boss.position.y}
                      eventMode="static"
                      cursor="pointer"
                      onPointerTap={() => {
                        const store = useGameStore.getState();
                        store.clearBubbles("boss");
                        store.updateBossBackendState("idle");
                      }}
                    >
                      <BossBubble content={cycledBossBubble} yOffset={-80} />
                    </pixiContainer>
                  )}
                  {/* Balão do Pedro (user avatar) — top-level pra ficar sempre
                      acima de qualquer personagem que passe na frente. */}
                  <PedroBubbleLayer />
                  {/* Labels dos UserAvatars (Pedro/Gestor/Samurai) — top-level
                      pra NUNCA serem cobertas por móvel/parede/decoração. */}
                  <UserAvatarLabelsLayer />

                  {/* Floating tool icons — rise + fade above each character. */}
                  {floatingIcons.map((f) => (
                    <FloatingIcon
                      key={f.id}
                      x={f.x}
                      y={f.y}
                      icon={f.icon}
                      onDone={() => removeFloatingIcon(f.id)}
                    />
                  ))}

                  {/* Ambient lighting — tints the scene based on time of day.
                      blendMode "multiply" faz color grading (escurece +
                      tinta a paleta) em vez de overlay translúcido, dando
                      sensação de mood cinematográfico. */}
                  {ambient.alpha > 0 && (
                    <pixiGraphics
                      blendMode="multiply"
                      draw={(g) => {
                        g.clear();
                        g.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                        g.fill({ color: ambient.color, alpha: ambient.alpha });
                      }}
                    />
                  )}
                  {/* Plumbob overlay — sempre na FRENTE de tudo (depois de
                      qualquer mesa/sprite no JSX). Segue a posição do
                      personagem controlado. Pedro 2026-06-06. */}
                  <PlumbobOverlay />
                </>
              )}
            </Application>
          </div>
        </TransformComponent>
      </TransformWrapper>

      <PathErrorToast />

      {/* Modal "Sentar Claudius?" — abre ao clicar na mesa do boss quando
          ele tá em pé. */}
      {sitConfirmBoss && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0, 0, 0, 0.55)" }}
          onClick={() => setSitConfirmBoss(false)}
        >
          <div
            className="flex flex-col items-center gap-4 rounded-lg border px-6 py-5 shadow-xl"
            style={{
              background: "#0e0e0e",
              borderColor: "#B8972A",
              color: "#fde7b0",
              fontFamily: "Montserrat, sans-serif",
              minWidth: 240,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-base font-semibold tracking-wide">
              Sentar Claudius?
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmSitBoss}
                className="rounded border px-4 py-1.5 text-sm font-semibold transition-colors"
                style={{
                  background: "#B8972A",
                  borderColor: "#B8972A",
                  color: "#0e0e0e",
                }}
              >
                Sentar
              </button>
              <button
                type="button"
                onClick={() => setSitConfirmBoss(false)}
                className="rounded border px-4 py-1.5 text-sm transition-colors"
                style={{
                  background: "transparent",
                  borderColor: "#B8972A",
                  color: "#fde7b0",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação "Sentar?" — abre ao clicar na cadeira/mesa. */}
      {sitConfirmDesk && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0, 0, 0, 0.55)" }}
          onClick={() => setSitConfirmDesk(null)}
        >
          <div
            className="flex flex-col items-center gap-4 rounded-lg border px-6 py-5 shadow-xl"
            style={{
              background: "#0e0e0e",
              borderColor: "#B8972A",
              color: "#fde7b0",
              fontFamily: "Montserrat, sans-serif",
              minWidth: 240,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-base font-semibold tracking-wide">
              Sentar nesta cadeira?
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmSit}
                className="rounded border px-4 py-1.5 text-sm font-semibold transition-colors"
                style={{
                  background: "#B8972A",
                  borderColor: "#B8972A",
                  color: "#0e0e0e",
                }}
              >
                Sentar
              </button>
              <button
                type="button"
                onClick={() => setSitConfirmDesk(null)}
                className="rounded border px-4 py-1.5 text-sm transition-colors"
                style={{
                  background: "transparent",
                  borderColor: "#B8972A",
                  color: "#fde7b0",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collision editor controls — visible only while the editor is active */}
      {collisionEditorActive && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs shadow-lg"
          style={{
            background: "rgba(14, 14, 14, 0.92)",
            borderColor: "#B8972A",
            color: "#fde7b0",
            fontFamily: "Montserrat, sans-serif",
          }}
        >
          <span className="font-semibold tracking-wider">EDITOR DE COLISÃO</span>
          <span className="opacity-50">|</span>

          {/* Paint mode selector */}
          {(
            [
              { id: "wall" as const, label: "Parede", swatch: "#ff3030" },
              { id: "floor" as const, label: "Chão", swatch: "#30ff60" },
              { id: "above" as const, label: "Sobre", swatch: "#3080ff" },
              { id: "below" as const, label: "Atrás", swatch: "#c040ff" },
              { id: "erase" as const, label: "Borracha", swatch: "#ffd84a" },
            ]
          ).map((mode) => {
            const isActive = paintMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setPaintMode(mode.id)}
                className="flex items-center gap-1.5 rounded border px-2 py-0.5 transition-colors"
                style={{
                  borderColor: isActive ? mode.swatch : "#B8972A",
                  background: isActive ? mode.swatch : "transparent",
                  color: isActive ? "#0e0e0e" : "#fde7b0",
                  fontWeight: isActive ? 600 : 400,
                }}
                title={
                  mode.id === "wall"
                    ? "Pintar tiles como WALL (bloqueado)"
                    : mode.id === "floor"
                      ? "Pintar tiles como FLOOR (andável, sobrepõe mesas)"
                      : mode.id === "above"
                        ? "Sprite de cenário SEMPRE NA FRENTE do personagem"
                        : mode.id === "below"
                          ? "Sprite de cenário SEMPRE ATRÁS do personagem"
                          : "Apagar override (volta ao padrão)"
                }
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: mode.swatch }}
                />
                {mode.label}
              </button>
            );
          })}

          <span className="opacity-50">|</span>
          <span className="opacity-80">overrides: {overrideCount}</span>
          <span className="opacity-50">|</span>
          <span className="opacity-70 italic">salvo auto · Ctrl+Z desfaz</span>
          <button
            type="button"
            onClick={() => {
              // Aplica WALL no tampo das 8 mesas + boss desk de forma
              // automática. Pinta uma faixa fina (2 tiles de largura, 1
              // de altura) no centro de cada tampo — corredor e cadeira
              // continuam walkable. Pedro 2026-06-06.
              const grid = getNavigationGrid();
              const TS = 32;
              const deskCenters = [256, 512, 768, 1024];
              const deskRowYs = [388, 580];
              const bossDeskCenterX = 640;
              const bossDeskCenterY = 900;
              grid.beginStroke();
              for (const cx of deskCenters) {
                for (const cy of deskRowYs) {
                  // 2 tiles x 1 tile no tampo visual da mesa
                  const gx0 = Math.floor((cx - 32) / TS);
                  const gx1 = Math.floor((cx + 32) / TS);
                  const gy = Math.floor((cy + 5) / TS);
                  grid.setOverride(gx0, gy, TileType.WALL);
                  grid.setOverride(gx1, gy, TileType.WALL);
                }
              }
              // Boss desk — tampo mais largo (3 tiles)
              {
                const cx = bossDeskCenterX;
                const cy = bossDeskCenterY;
                const gx0 = Math.floor((cx - 32) / TS);
                const gx1 = Math.floor(cx / TS);
                const gx2 = Math.floor((cx + 32) / TS);
                const gy = Math.floor((cy + 5) / TS);
                grid.setOverride(gx0, gy, TileType.WALL);
                grid.setOverride(gx1, gy, TileType.WALL);
                grid.setOverride(gx2, gy, TileType.WALL);
              }
              // Salva no Supabase via batch (mesmo caminho do paint manual).
              const changes = grid.endStroke();
              const tiles: Array<{
                gx: number;
                gy: number;
                tile_type: string;
              }> = [];
              for (const [key, type] of changes) {
                if (type === null) continue;
                const [gx, gy] = key.split(",").map(Number);
                tiles.push({ gx, gy, tile_type: "wall" });
              }
              if (tiles.length > 0) {
                fetch(`/api/v1/collision/${floorId}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tiles }),
                }).catch(() => undefined);
              }
            }}
            className="rounded border px-2 py-0.5 transition-colors hover:bg-[#B8972A] hover:text-black"
            style={{ borderColor: "#B8972A" }}
            title="Pinta WALL automaticamente no tampo das 8 mesas + boss desk — corredor e cadeira ficam walkable"
          >
            Colisão padrão mesas
          </button>
          <button
            type="button"
            onClick={() => {
              const data = getNavigationGrid().exportOverrides();
              const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `collision-overrides-${new Date()
                .toISOString()
                .replace(/[:.]/g, "-")
                .slice(0, 19)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded border px-2 py-0.5 transition-colors hover:bg-[#B8972A] hover:text-black"
            style={{ borderColor: "#B8972A" }}
            title="Baixa um .json com todos os overrides — versionável e portátil entre navegadores"
          >
            Exportar JSON
          </button>
          <label
            className="cursor-pointer rounded border px-2 py-0.5 transition-colors hover:bg-[#B8972A] hover:text-black"
            style={{ borderColor: "#B8972A" }}
            title="Carrega overrides de um .json previamente exportado (substitui os atuais)"
          >
            Importar JSON
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (ev) => {
                const file = ev.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text);
                  const n = getNavigationGrid().importOverrides(parsed);
                  // eslint-disable-next-line no-console
                  console.log(`[CollisionEditor] Imported ${n} overrides`);
                } catch (err) {
                  // eslint-disable-next-line no-console
                  console.error("[CollisionEditor] Import failed:", err);
                  alert("Falha ao importar JSON. Veja o console.");
                }
                ev.target.value = ""; // allow re-importing the same file
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => getNavigationGrid().undo()}
            className="rounded border px-2 py-0.5 transition-colors hover:bg-[#B8972A] hover:text-black"
            style={{ borderColor: "#B8972A" }}
            title="Desfaz a última pincelada (Ctrl+Z)"
          >
            Desfazer (Ctrl+Z)
          </button>
          <button
            type="button"
            onClick={() => getNavigationGrid().clearAllOverrides()}
            className="rounded border px-2 py-0.5 transition-colors hover:bg-[#B8972A] hover:text-black"
            style={{ borderColor: "#B8972A" }}
          >
            Resetar tudo
          </button>
          <button
            type="button"
            onClick={() => setCollisionEditorActive(false)}
            className="rounded border px-2 py-0.5 transition-colors hover:bg-[#B8972A] hover:text-black"
            style={{ borderColor: "#B8972A" }}
          >
            Fechar (E)
          </button>
        </div>
      )}
    </div>
  );
}
