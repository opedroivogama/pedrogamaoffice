/**
 * TrashCanSprite Component
 *
 * Renders a procedurally drawn mesh wire trash can that visually represents
 * context window utilization. Shows crumpled paper filling up as context increases.
 */

"use client";

import { memo, useMemo, useCallback } from "react";
import { Graphics, TextStyle, Texture } from "pixi.js";

// ============================================================================
// TYPES
// ============================================================================

export interface TrashCanSpriteProps {
  x: number;
  y: number;
  contextUtilization: number; // 0.0 to 1.0
  isCompacting?: boolean; // True when compaction animation is active
  isStomping?: boolean; // True when boss is stomping on trash can (squish effect)
  /** Sprite da lixeira de grade (179×240 fonte). Se null, cai num fallback
   *  procedural antigo (mantido por backwards-compat — não chega a ser
   *  exercitado em produção porque a textura sempre carrega). */
  texture?: Texture | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Trash can dimensions — tamanho de renderização do sprite. Mantém proporção
// do PNG fonte (179:240 ≈ 0.745) escalado pra ~52px de altura, próximo das
// dimensões procedurais antigas pra não quebrar layout.
const CAN_WIDTH = 50; // largura visível do sprite
const CAN_HEIGHT = 67; // altura visível do sprite (mantém ratio do PNG)
const RIM_HEIGHT = 4;

// Região da ABERTURA da lixeira no sprite — onde os papéis aparecem por cima
// pra dar ilusão de enchimento. Medido visualmente no PNG (top da abertura
// está logo abaixo da rim metálica; bottom é onde o fundo interno escurece).
// Coords em pixel local (origem = centro do sprite por causa do anchor=0.5).
const OPENING_TOP_Y = -CAN_HEIGHT / 2 + 8; // logo abaixo da rim
const OPENING_BOTTOM_Y = -CAN_HEIGHT / 2 + 32; // até ~48% da altura
const OPENING_HALF_WIDTH_TOP = 17;
const OPENING_HALF_WIDTH_BOTTOM = 13; // estreita por perspectiva

// Colors
const PAPER_COLORS = [0xf5f5f0, 0xebe8e0, 0xfafaf5, 0xe8e5dd, 0xf0ede5];
const PAPER_SHADOW = 0xd0cdc5;
// Fallback wireframe colors (só usados se texture==null)
const WIRE_COLOR = 0x4a4a4a;
const WIRE_HIGHLIGHT = 0x6a6a6a;
const RIM_COLOR = 0x3a3a3a;
const CAN_TOP_WIDTH = 50;

// Colors for percentage text based on fill level
const FILL_COLORS: Record<number, number> = {
  0: 0x22c55e, // Green - empty/low
  1: 0x84cc16, // Lime - 25%
  2: 0xeab308, // Yellow - 50%
  3: 0xf97316, // Orange - 75%
  4: 0xef4444, // Red - full
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getFrameIndex(utilization: number): number {
  if (utilization <= 0.1) return 0;
  if (utilization <= 0.3) return 1;
  if (utilization <= 0.55) return 2;
  if (utilization <= 0.8) return 3;
  return 4;
}

// Seeded random for consistent paper positions
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

/**
 * Desenha só os papéis crumplados (dentro da abertura + overflow) sobre
 * o sprite da lixeira. Os papéis aparecem por cima do sprite mas só
 * dentro da região da abertura — ilusão de enchimento.
 */
function drawPapersOnly(g: Graphics, utilization: number): void {
  g.clear();
  const fillLevel = Math.min(Math.max(utilization, 0), 1.0);
  const rand = seededRandom(42);

  // Papéis DENTRO da abertura — sobem do fundo até o topo conforme fillLevel
  if (utilization > 0.05) {
    const openingHeight = OPENING_BOTTOM_Y - OPENING_TOP_Y;
    const fillHeight = openingHeight * fillLevel;
    const fillTop = OPENING_BOTTOM_Y - fillHeight;

    const numPapers = Math.floor(3 + fillLevel * 12);
    for (let i = 0; i < numPapers; i++) {
      const paperY = fillTop + rand() * fillHeight * 0.9;
      // Interpola largura da abertura conforme profundidade
      const t = (paperY - OPENING_TOP_Y) / openingHeight; // 0=top, 1=bottom
      const halfWidthAtY =
        OPENING_HALF_WIDTH_TOP +
        (OPENING_HALF_WIDTH_BOTTOM - OPENING_HALF_WIDTH_TOP) * t;
      const paperX = (rand() - 0.5) * halfWidthAtY * 1.6;
      const paperSize = 3 + rand() * 5;
      const colorIdx = Math.floor(rand() * PAPER_COLORS.length);
      drawCrumpledPaper(
        g,
        paperX,
        paperY,
        paperSize,
        PAPER_COLORS[colorIdx],
        rand,
      );
    }
  }

  // Overflow — papéis saindo pela rim quando >85%
  if (utilization > 0.85) {
    // Avança o RNG passando pelos papéis internos (5 chamadas por paper)
    const numPapers = Math.floor(3 + fillLevel * 12);
    for (let i = 0; i < numPapers; i++) {
      rand();
      rand();
      rand();
      rand();
      rand();
    }
    const overflowCount = Math.floor((utilization - 0.85) * 20);
    for (let i = 0; i < overflowCount; i++) {
      const paperX = (rand() - 0.5) * OPENING_HALF_WIDTH_TOP * 1.5;
      const paperY = OPENING_TOP_Y - rand() * 12;
      const paperSize = 4 + rand() * 4;
      const colorIdx = Math.floor(rand() * PAPER_COLORS.length);
      drawCrumpledPaper(
        g,
        paperX,
        paperY,
        paperSize,
        PAPER_COLORS[colorIdx],
        rand,
      );
    }
  }
}

/**
 * Fallback procedural completo (wireframe + papéis) — só é usado quando
 * a textura não carregou. Em runtime a textura SEMPRE carrega, então
 * esse caminho serve só como safety net.
 */
function drawTrashCanFallback(g: Graphics, utilization: number): void {
  g.clear();

  const halfWidth = CAN_WIDTH / 2;
  const halfTopWidth = CAN_TOP_WIDTH / 2;
  const topY = -CAN_HEIGHT / 2;
  const bottomY = CAN_HEIGHT / 2;

  // Draw the mesh pattern (back layer first)
  const meshRows = 6;
  const meshCols = 8;

  // Vertical wires
  for (let i = 0; i <= meshCols; i++) {
    const t = i / meshCols;
    const topX = -halfTopWidth + t * CAN_TOP_WIDTH;
    const bottomX = -halfWidth + t * CAN_WIDTH;

    g.moveTo(topX, topY + RIM_HEIGHT);
    g.lineTo(bottomX, bottomY);
    g.stroke({ width: 1, color: WIRE_COLOR, alpha: 0.8 });
  }

  // Horizontal wires (curved to show depth)
  for (let i = 1; i < meshRows; i++) {
    const t = i / meshRows;
    const y = topY + RIM_HEIGHT + t * (CAN_HEIGHT - RIM_HEIGHT);
    const widthAtY = halfTopWidth - (halfTopWidth - halfWidth) * t;

    // Draw slight curve for 3D effect
    g.moveTo(-widthAtY, y);
    g.quadraticCurveTo(0, y + 2, widthAtY, y);
    g.stroke({ width: 1, color: WIRE_COLOR, alpha: 0.7 });
  }

  // Draw crumpled paper balls based on utilization (INSIDE the can - drawn before front frame)
  // Store random generator state to draw overflow papers later (after rim)
  const fillLevel = Math.min(Math.max(utilization, 0), 1.0);
  const rand = seededRandom(42);

  if (utilization > 0.05) {
    const fillHeight = (CAN_HEIGHT - RIM_HEIGHT - 8) * fillLevel;
    const fillTop = bottomY - fillHeight;

    // Generate paper balls inside the can
    const numPapers = Math.floor(3 + fillLevel * 12);

    for (let i = 0; i < numPapers; i++) {
      const paperY = fillTop + rand() * fillHeight * 0.9;
      const widthAtY =
        halfWidth +
        ((halfTopWidth - halfWidth) * (bottomY - paperY)) / CAN_HEIGHT;
      const paperX = (rand() - 0.5) * widthAtY * 1.6;
      const paperSize = 4 + rand() * 6;
      const colorIdx = Math.floor(rand() * PAPER_COLORS.length);

      // Draw crumpled paper ball (irregular shape)
      drawCrumpledPaper(
        g,
        paperX,
        paperY,
        paperSize,
        PAPER_COLORS[colorIdx],
        rand,
      );
    }
  }

  // Draw outer frame (front wires - slightly thicker for depth)
  // Left edge
  g.moveTo(-halfTopWidth, topY + RIM_HEIGHT);
  g.lineTo(-halfWidth, bottomY);
  g.stroke({ width: 2, color: WIRE_HIGHLIGHT });

  // Right edge
  g.moveTo(halfTopWidth, topY + RIM_HEIGHT);
  g.lineTo(halfWidth, bottomY);
  g.stroke({ width: 2, color: WIRE_HIGHLIGHT });

  // Bottom edge (curved) - extended 3px down for visual thickness
  const bottomExtension = 3;
  g.moveTo(-halfWidth, bottomY + bottomExtension);
  g.quadraticCurveTo(
    0,
    bottomY + bottomExtension + 3,
    halfWidth,
    bottomY + bottomExtension,
  );
  g.stroke({ width: 2, color: WIRE_COLOR });

  // Connect sides to extended bottom
  g.moveTo(-halfWidth, bottomY);
  g.lineTo(-halfWidth, bottomY + bottomExtension);
  g.stroke({ width: 2, color: WIRE_HIGHLIGHT });

  g.moveTo(halfWidth, bottomY);
  g.lineTo(halfWidth, bottomY + bottomExtension);
  g.stroke({ width: 2, color: WIRE_HIGHLIGHT });

  // Rim at top (rolled edge)
  g.ellipse(0, topY + RIM_HEIGHT / 2, halfTopWidth, RIM_HEIGHT);
  g.fill(RIM_COLOR);
  g.stroke({ width: 1.5, color: WIRE_HIGHLIGHT });

  // Inner rim shadow
  g.ellipse(0, topY + RIM_HEIGHT / 2 + 1, halfTopWidth - 2, RIM_HEIGHT - 1);
  g.stroke({ width: 1, color: 0x2a2a2a, alpha: 0.5 });

  // Draw overflowing papers AFTER rim (so they appear on top)
  if (utilization > 0.85) {
    // Advance random state to match where we left off (skip the inside papers)
    const numPapers = Math.floor(3 + fillLevel * 12);
    for (let i = 0; i < numPapers; i++) {
      rand();
      rand();
      rand();
      rand();
      rand(); // Match the 5 rand() calls per paper
    }

    const overflowCount = Math.floor((utilization - 0.85) * 20);
    for (let i = 0; i < overflowCount; i++) {
      const paperX = (rand() - 0.5) * halfTopWidth * 1.5;
      const paperY = topY - rand() * 15;
      const paperSize = 5 + rand() * 5;
      const colorIdx = Math.floor(rand() * PAPER_COLORS.length);
      drawCrumpledPaper(
        g,
        paperX,
        paperY,
        paperSize,
        PAPER_COLORS[colorIdx],
        rand,
      );
    }
  }
}

function drawCrumpledPaper(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  rand: () => number,
): void {
  // Draw an irregular crumpled paper shape
  const points = 6;
  const vertices: { x: number; y: number }[] = [];

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = size * (0.6 + rand() * 0.4);
    vertices.push({
      x: x + Math.cos(angle) * r,
      y: y + Math.sin(angle) * r * 0.7, // Slightly flattened
    });
  }

  // Draw shadow
  g.moveTo(vertices[0].x + 1, vertices[0].y + 1);
  for (let i = 1; i < vertices.length; i++) {
    g.lineTo(vertices[i].x + 1, vertices[i].y + 1);
  }
  g.closePath();
  g.fill({ color: PAPER_SHADOW, alpha: 0.5 });

  // Draw paper
  g.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    g.lineTo(vertices[i].x, vertices[i].y);
  }
  g.closePath();
  g.fill(color);

  // Add crumple lines
  if (size > 5) {
    g.moveTo(x - size * 0.3, y - size * 0.2);
    g.lineTo(x + size * 0.2, y + size * 0.1);
    g.stroke({ width: 0.5, color: PAPER_SHADOW, alpha: 0.4 });
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

function TrashCanSpriteComponent({
  x,
  y,
  contextUtilization,
  isCompacting = false,
  isStomping = false,
  texture,
}: TrashCanSpriteProps) {
  const frameIndex = useMemo(
    () => getFrameIndex(contextUtilization),
    [contextUtilization],
  );

  const percentage = Math.round(contextUtilization * 100);
  const textColor = FILL_COLORS[frameIndex] ?? 0x888888;

  // Squish when stomping, normal otherwise
  const squishScale = useMemo(() => {
    if (isStomping) {
      return { x: 1.15, y: 0.85 };
    }
    return { x: 1, y: 1 };
  }, [isStomping]);

  // Compute shake values directly from props (deterministic based on contextUtilization)
  const { shakeOffset, shakeRotation } = useMemo(() => {
    if (isStomping) {
      // Create deterministic "random" based on contextUtilization
      const seed = contextUtilization * 12345;
      return {
        shakeOffset: (seed % 400) / 100 - 2, // Range: -2 to 2
        shakeRotation: ((seed * 7) % 100) / 1000 - 0.05, // Range: -0.05 to 0.05
      };
    }
    return { shakeOffset: 0, shakeRotation: 0 };
  }, [isStomping, contextUtilization]);

  // Papéis sobre o sprite (preenchimento da abertura + overflow)
  const drawPapersCallback = useCallback(
    (g: Graphics) => drawPapersOnly(g, contextUtilization),
    [contextUtilization],
  );

  // Fallback procedural quando a textura não carrega (não exercitado em runtime)
  const drawFallbackCallback = useCallback(
    (g: Graphics) => drawTrashCanFallback(g, contextUtilization),
    [contextUtilization],
  );

  // Render text at 2x resolution for crisp display, then scale down
  const textStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: "monospace",
        fontSize: 22, // 2x for crisp rendering
        fontWeight: "bold",
        fill: textColor,
        align: "center",
      }),
    [textColor],
  );

  const labelStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: "monospace",
        fontSize: 16, // 2x for crisp rendering
        fill: 0x666666,
        align: "center",
      }),
    [],
  );

  // Compaction label style (shows during animation)
  const compactingStyle = useMemo(
    () =>
      new TextStyle({
        fontFamily: "monospace",
        fontSize: 18, // 2x for crisp rendering
        fontWeight: "bold",
        fill: 0xff6b6b, // Red/coral color for attention
        align: "center",
      }),
    [],
  );

  return (
    <pixiContainer
      x={x + shakeOffset}
      y={y}
      rotation={shakeRotation}
      scale={squishScale}
    >
      {/* Lixeira: sprite da grade metálica + papéis crumplados por cima
          da abertura. Fallback procedural se textura não carregou. */}
      {texture ? (
        <pixiSprite
          texture={texture}
          anchor={0.5}
          width={CAN_WIDTH}
          height={CAN_HEIGHT}
        />
      ) : (
        <pixiGraphics draw={drawFallbackCallback} />
      )}
      {/* Papéis sobre a abertura — ilusão de enchimento por dentro */}
      <pixiGraphics draw={drawPapersCallback} />

      {/* Context percentage label - rendered at 2x and scaled to 0.5 for crisp text */}
      <pixiText
        text={`${percentage}%`}
        anchor={0.5}
        y={CAN_HEIGHT / 2 + 10}
        scale={0.5}
        style={textStyle}
      />
      <pixiText
        text={isCompacting ? "compacting..." : "context"}
        anchor={0.5}
        y={CAN_HEIGHT / 2 + 18}
        scale={0.5}
        style={isCompacting ? compactingStyle : labelStyle}
      />
    </pixiContainer>
  );
}

export const TrashCanSprite = memo(TrashCanSpriteComponent);
