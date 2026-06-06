/**
 * DeskGrid Components
 *
 * Renders the desk grid with:
 * - Desk surfaces and keyboards (DeskSurfacesBase - behind agent arms)
 * - Monitors and desk accessories (DeskSurfacesTop - in front of agent arms)
 * - Task marquees on occupied desks
 */

import { type ReactNode, useMemo } from "react";
import { Texture } from "pixi.js";
import { DeskMarquee } from "./DeskMarquee";
import { ContactShadow } from "./ContactShadow";
import { LightGlow } from "./LightGlow";

// ============================================================================
// TYPES
// ============================================================================

export interface DeskPosition {
  x: number;
  y: number;
  isEmpty: boolean;
}

type DeskItem =
  | "mug"
  | "stapler"
  | "lamp"
  | "penholder"
  | "8ball"
  | "rubiks"
  | "duck"
  | "thermos"
  | "none";

// ============================================================================
// CONSTANTS
// ============================================================================

// Desk grid layout
const ROW_SIZE = 4;
const DESK_START_X = 256;
// Subido de 408 → 388 (Pedro 2026-06-06) — mesa estava sendo cortada
// pelo limite inferior da sala. Sobe linhas 0 e 1 visualmente; cadeiras
// acompanham porque consomem o mesmo useDeskPositions. Pathfinding e
// chairs.ts (sit positions) seguem com Y antigo — tolerância de 30px no
// findNearestChair absorve o desalinhamento.
const DESK_START_Y = 388;
const DESK_SPACING_X = 256;
const DESK_SPACING_Y = 192;

// Different colors for desk accessories (tinted onto grayscale sprites)
const ACCESSORY_TINTS = [
  0xffffff, // White (no tint) - desk 0
  0x87ceeb, // Sky blue - desk 1
  0x98fb98, // Pale green - desk 2
  0xffb6c1, // Light pink - desk 3
  0xffd700, // Gold - desk 4
  0xdda0dd, // Plum - desk 5
  0xf0e68c, // Khaki - desk 6
  0xadd8e6, // Light blue - desk 7
];

// Deterministic "random" desk items - precomputed shuffled sequence
// Avoids row patterns while ensuring good variety
const DESK_ITEM_SEQUENCE: DeskItem[] = [
  "lamp",
  "mug",
  "8ball",
  "stapler",
  "penholder",
  "thermos",
  "rubiks",
  "duck",
  "lamp",
  "none",
  "none",
  "lamp",
  "stapler",
  "penholder",
  "mug",
  "mug",
  "8ball",
  "thermos",
  "rubiks",
  "duck",
];

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to compute desk positions based on desk count and occupancy.
 */
export function useDeskPositions(
  deskCount: number,
  occupiedDesks: Set<number>,
): DeskPosition[] {
  return useMemo(() => {
    const result: DeskPosition[] = [];

    for (let i = 0; i < deskCount; i++) {
      const row = Math.floor(i / ROW_SIZE);
      const col = i % ROW_SIZE;
      // Grid-aligned positions: X at multiples of 32 (256, 512, 768, 1024)
      // Y spacing of 192 (6×32) ensures desk centers align to grid
      const x = DESK_START_X + col * DESK_SPACING_X;
      const y = DESK_START_Y + row * DESK_SPACING_Y;
      const deskNum = i + 1;
      const isEmpty = !occupiedDesks.has(deskNum);

      result.push({ x, y, isEmpty });
    }

    return result;
  }, [deskCount, occupiedDesks]);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDeskItem(index: number): DeskItem {
  return DESK_ITEM_SEQUENCE[index % DESK_ITEM_SEQUENCE.length];
}

// ============================================================================
// COMPONENTS
// ============================================================================

interface DeskSurfacesBaseProps {
  deskCount: number;
  occupiedDesks: Set<number>;
  deskTexture: Texture | null;
  keyboardTexture: Texture | null;
  /** Quando false, pula a renderização do sprite da mesa (mantém sombra e
   *  teclado). Usado pra delegar o sprite a um container Y-sorted superior
   *  onde a mesa concorre por zIndex com cadeira/personagem (Pedro 2026-06-06:
   *  permite personagem passar atrás da mesa porém na frente da cadeira). */
  renderDeskSprite?: boolean;
}

/**
 * Renders desk surfaces and keyboards (behind agent arms).
 */
export function DeskSurfacesBase({
  deskCount,
  occupiedDesks,
  deskTexture,
  keyboardTexture,
  renderDeskSprite = true,
}: DeskSurfacesBaseProps): ReactNode {
  const desks = useDeskPositions(deskCount, occupiedDesks);

  return (
    <>
      {desks.map((desk, i) => (
        <pixiContainer key={i} x={desk.x} y={desk.y}>
          {/* Drop shadow sob a mesa. Alpha 0.18 — discreto pra dar
              sensação de contato sem competir com o mood escuro. */}
          <ContactShadow width={150} height={24} y={92} alpha={0.18} />
          {/* Desk surface — scale 0.21 (2x do original 0.105, Pedro 2026-06-04)
              x=-40 y=15 (deslocada pra esquerda e pra cima, alinhar com agent).
              renderDeskSprite=false delega esse sprite pra container Y-sorted
              externo (OfficeGame.tsx) — permite mesa concorrer por zIndex com
              personagem/cadeira (passar atrás da mesa, frente da cadeira). */}
          {renderDeskSprite && deskTexture && (
            <pixiSprite
              texture={deskTexture}
              anchor={{ x: 0.5, y: 0 }}
              x={-25}
              y={-5}
              scale={0.21}
            />
          )}
          {/* Keyboard - DESABILITADO (Pedro pediu sala sem computador, 2026-06-04).
              Pra reativar, troca `false &&` por só o `keyboardTexture &&`. */}
          {false && keyboardTexture && (
            <pixiSprite
              texture={keyboardTexture}
              anchor={0.5}
              x={0}
              y={42}
              scale={0.04}
            />
          )}
        </pixiContainer>
      ))}
    </>
  );
}

/** Mapa de cor da caneca decorativa por índice de mesa. Grid 4 colunas:
 *  índice 0 = linha 0 col 0 (esquerda topo), índice 6 = linha 1 col 2.
 *  Pra adicionar / mudar canecas, edite esse map. */
const MUG_COLOR_BY_DESK_INDEX = new Map<number, "blue" | "black">([
  [0, "blue"],
  [6, "black"],
]);

interface DeskSurfacesTopProps {
  deskCount: number;
  occupiedDesks: Set<number>;
  deskTasks: Map<number, string>;
  monitorTexture: Texture | null;
  coffeeMugTexture: Texture | null;
  staplerTexture: Texture | null;
  deskLampTexture: Texture | null;
  penHolderTexture: Texture | null;
  magic8BallTexture: Texture | null;
  rubiksCubeTexture: Texture | null;
  rubberDuckTexture: Texture | null;
  thermosTexture: Texture | null;
  blueMugTexture: Texture | null;
  blackMugTexture: Texture | null;
}

/**
 * Renders monitors and desk decorations (in front of agent arms).
 */
export function DeskSurfacesTop({
  deskCount,
  occupiedDesks,
  deskTasks,
  monitorTexture,
  coffeeMugTexture,
  staplerTexture,
  deskLampTexture,
  penHolderTexture,
  magic8BallTexture,
  rubiksCubeTexture,
  rubberDuckTexture,
  thermosTexture,
  blueMugTexture,
  blackMugTexture,
}: DeskSurfacesTopProps): ReactNode {
  const desks = useDeskPositions(deskCount, occupiedDesks);

  return (
    <>
      {desks.map((desk, i) => (
        // zIndex = desk.y + 80 (mesmo da mesa). Compete com personagens no
        // Y-sort: foot.y maior → personagem cobre; foot.y menor → personagem
        // coberto. Pedro 2026-06-06: regra precisa valer pra todos (Pedro,
        // gestor, Claudius, agents).
        <pixiContainer key={i} x={desk.x} y={desk.y} zIndex={desk.y + 80}>
          {/* Monitor + glow LCD - DESABILITADO (Pedro pediu sala sem computador,
              2026-06-04). Pra reativar, troca `false &&` por só `monitorTexture &&`. */}
          {false && monitorTexture && (
            <>
              {/* Glow azul-acinzentado da tela LCD ligada. */}
              <LightGlow
                radiusX={36}
                radiusY={22}
                color={0x99c6ff}
                alpha={0.35}
                blurStrength={14}
                x={-45}
                y={22}
                blendMode="add"
              />
              <pixiSprite
                texture={monitorTexture}
                anchor={0.5}
                x={-45}
                y={27}
                scale={0.08}
              />
            </>
          )}
          {/* Acessórios das mesas DESABILITADOS (Pedro 2026-06-04 — mesa
              nova já tem computador integrado, sem mais bibelôs).
              Pra reativar, troca `false &&` por só a checagem original. */}
          {false && getDeskItem(i) === "mug" && coffeeMugTexture && (
            <pixiSprite texture={coffeeMugTexture} anchor={0.5} x={50} y={40} scale={0.025} tint={ACCESSORY_TINTS[i % ACCESSORY_TINTS.length]} />
          )}
          {false && getDeskItem(i) === "stapler" && staplerTexture && (
            <pixiSprite texture={staplerTexture} anchor={0.5} x={50} y={43} scale={0.19} />
          )}
          {false && getDeskItem(i) === "lamp" && deskLampTexture && (
            <pixiSprite texture={deskLampTexture} anchor={0.5} x={50} y={29} scale={0.35} />
          )}
          {false && getDeskItem(i) === "penholder" && penHolderTexture && (
            <pixiSprite texture={penHolderTexture} anchor={0.5} x={54} y={38} scale={0.22} />
          )}
          {false && getDeskItem(i) === "8ball" && magic8BallTexture && (
            <pixiSprite texture={magic8BallTexture} anchor={0.5} x={54} y={42} scale={0.162} />
          )}
          {false && getDeskItem(i) === "rubiks" && rubiksCubeTexture && (
            <pixiSprite texture={rubiksCubeTexture} anchor={0.5} x={52} y={42} scale={0.16} />
          )}
          {false && getDeskItem(i) === "duck" && rubberDuckTexture && (
            <pixiSprite texture={rubberDuckTexture} anchor={0.5} x={52} y={42} scale={0.16} />
          )}
          {false && getDeskItem(i) === "thermos" && thermosTexture && (
            <pixiSprite texture={thermosTexture} anchor={0.5} x={52} y={40} scale={0.36} />
          )}
          {/* Caneca decorativa nas mesas mapeadas em MUG_COLOR_BY_DESK_INDEX.
              Variação de cor (azul/preto) escolhida por mesa. */}
          {(() => {
            const color = MUG_COLOR_BY_DESK_INDEX.get(i);
            if (!color) return null;
            const tex = color === "blue" ? blueMugTexture : blackMugTexture;
            if (!tex) return null;
            return (
              <pixiSprite
                texture={tex}
                anchor={{ x: 0.5, y: 1 }}
                x={30}
                y={68}
                scale={0.048}
              />
            );
          })()}
          {/* Task marquee on desk surface - only for occupied desks */}
          <DeskMarquee text={deskTasks.get(i + 1) ?? ""} />
        </pixiContainer>
      ))}
    </>
  );
}
