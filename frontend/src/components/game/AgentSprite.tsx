/**
 * AgentSprite Component
 *
 * Renders a single agent character as a colored capsule with optional bubble.
 * Supports headset and sunglasses accessories.
 */

"use client";

import {
  memo,
  useMemo,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useTick } from "@pixi/react";
import { Graphics, TextStyle, Texture, Rectangle } from "pixi.js";
import type { Position, BubbleContent } from "@/types";
import type { AgentPhase } from "@/stores/gameStore";
import { useAttentionStore } from "@/stores/attentionStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { isInElevatorZone } from "@/systems/queuePositions";
import { ICON_MAP } from "./shared/iconMap";
import { drawBubble, drawIconBadge } from "./shared/drawBubble";
import { drawRightArm, drawLeftArm } from "./shared/drawArm";
import { drawChibi } from "./shared/drawChibi";
import { truncateBubbleText } from "@/utils/bubbleText";
import { useGameStore } from "@/stores/gameStore";
import { Plumbob } from "./Plumbob";

// ============================================================================
// TYPES
// ============================================================================

export interface AgentSpriteProps {
  id: string;
  name: string | null;
  color: string;
  number: number;
  position: Position;
  phase: AgentPhase;
  bubble: BubbleContent | null;
  headsetTexture?: Texture | null;
  sunglassesTexture?: Texture | null;
  characterTexture?: Texture | null;
  characterTypingTexture?: Texture | null;
  characterTypingEyeLeftTexture?: Texture | null;
  characterStepLeftTexture?: Texture | null;
  characterStepRightTexture?: Texture | null;
  characterSideIdleTexture?: Texture | null;
  characterSideStep1Texture?: Texture | null;
  characterSideStep2Texture?: Texture | null;
  characterBackIdleTexture?: Texture | null;
  characterBackStep1Texture?: Texture | null;
  characterBackStep2Texture?: Texture | null;
  characterIdleFrames?: (Texture | null)[] | null; // optional breathing-idle frames cycled when standing still (overrides characterTexture).
  characterRenderSize?: number; // visual size in px (default 128). Bump for sources with empty canvas padding (e.g. PixelLab 240 sprites).
  characterFeetOffsetY?: number; // px to shift sprite DOWN to compensate for empty canvas padding below the character's feet. Default 0 for tight sources, ~60 for PixelLab 240.
  renderBubble?: boolean; // Whether to render bubble (default true)
  renderLabel?: boolean; // Whether to render name label (default true)
  isTyping?: boolean; // Whether agent is typing (animates arms)
  /** Override do gate "sentado em cadeira" (esconde pernas via crop waist-up).
   *  Se omitido, o componente lê `entitySeats.has(id)` do gameStore — que é
   *  a fonte da verdade do sit flow ([[sit_flow_painel]]). Pedro 2026-06-08:
   *  cooper agente só pode ficar sem perna quando estiver de fato sentado. */
  isSeated?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const AGENT_WIDTH = 48; // 1.5 blocks × 32px (matches boss)
const AGENT_HEIGHT = 80; // 2.5 blocks × 32px (matches boss)
const STROKE_WIDTH = 4;

// ============================================================================
// DRAWING FUNCTIONS
// ============================================================================

function drawAgent(g: Graphics, color: string): void {
  g.clear();

  const colorNum = parseInt(color.replace("#", ""), 16) || 0xff6b6b;

  // Chibi/Pokemon-GBA style. Anchor: y=0 is center of bottom circle of the
  // legacy capsule (i.e. feet rest around y=+22). Keep this anchor so headset,
  // sunglasses, bubble and arm positions stay aligned.
  drawChibi(g, {
    shirtColor: colorNum,
    hairColor: pickHairColor(color),
    feetY: 22,
  });
}

function pickHairColor(seed: string): number {
  const palette = [0x2c1810, 0x3b2218, 0x6b3410, 0x4a2c12, 0x1a1a1a, 0x8b4513];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

// ============================================================================
// BUBBLE COMPONENT
// ============================================================================

interface BubbleProps {
  content: BubbleContent;
  yOffset: number;
  /** Override the default 60-char truncation. Used by Pedro/user bubbles
   *  which can hold longer prompts than agent/boss chatter. */
  maxChars?: number;
  /** Nome opcional renderizado como header pequeno no topo do balão.
   *  Usado pelos cobres pra "etiqueta de placa de mesa" (Pedro 2026-06-09):
   *  o nome da sessão sempre visível dentro do bubble, sem conflitar com
   *  o label flutuante acima da cabeça. */
  headerName?: string;
}

function Bubble({
  content,
  yOffset,
  maxChars,
  headerName,
}: BubbleProps): ReactNode {
  const { type = "thought", icon } = content;
  const text = truncateBubbleText(content.text, maxChars);

  // Convert icon name to emoji if needed
  const iconEmoji = icon ? (ICON_MAP[icon] ?? icon) : undefined;

  // Icon badge constants
  const badgeRadius = 16; // Radius of the circular badge

  // Dimensões -20% (pedido do Pedro). Igual ao BossSprite, mas maxW maior
  // porque o bubble do Pedro carrega prompts até 300 chars.
  const charWidth = 8;
  const paddingH = 32;
  const maxW = 368;
  // Garante que o bubble seja largo o suficiente pra header (nome) quando
  // o texto da operação é curto mas o nome é longo. Sem isso "Reparo -
  // Pastas" overflowa em bubble de 88px (Pedro 2026-06-09).
  const headerCharWidth = 6;
  const headerRawWidth = headerName
    ? headerName.length * headerCharWidth + paddingH
    : 0;
  const rawWidth = Math.max(text.length * charWidth + paddingH, headerRawWidth);
  const bWidth = Math.min(maxW, Math.max(88, rawWidth));
  const capacity = (bWidth - paddingH) / charWidth;
  const lines = Math.max(1, Math.ceil(text.length / capacity));
  // Header adiciona 18px no topo do bubble. drawBubble desenha pra cima do
  // anchor (y=0), então cresce o bubble inteiro sem mexer no texto da
  // operação — ele continua centralizado no MIDDLE do espaço ORIGINAL.
  const headerExtra = headerName ? 18 : 0;
  const bHeight = 35 + lines * 16 + headerExtra;

  // Montserrat 700 + letter-spacing pra legibilidade clara à distância.
  const textStyle = useMemo<Partial<TextStyle>>(
    () => ({
      fontFamily:
        '"Montserrat", "Segoe UI", system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
      fontSize: 27,
      fill: "#0e0e0e",
      fontWeight: "700",
      letterSpacing: 0.3,
      wordWrap: true,
      wordWrapWidth: (bWidth - 30) * 2,
      breakWords: true,
      align: "left",
      lineHeight: 32,
      stroke: { width: 0, color: 0x000000 },
    }),
    [bWidth],
  );

  // Icon style - larger emoji
  const iconStyle = useMemo<Partial<TextStyle>>(
    () => ({
      fontFamily:
        '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
      fontSize: 40, // Large emoji for badge
      fill: "#000000",
    }),
    [],
  );

  // Header style — nome da sessão no topo do bubble do cobre. Menor que
  // o texto da operação pra não competir visualmente; bronze JP pra dar
  // identidade.
  const headerStyle = useMemo<Partial<TextStyle>>(
    () => ({
      fontFamily:
        '"Montserrat", "Segoe UI", system-ui, sans-serif',
      fontSize: 22,
      fill: "#B8972A",
      fontWeight: "700",
      letterSpacing: 0.3,
    }),
    [],
  );

  return (
    <pixiContainer y={yOffset} x={45}>
      <pixiGraphics draw={(g) => drawBubble(g, bWidth, bHeight, type)} />
      {/* Icon badge on top-left corner of bubble */}
      {iconEmoji && (
        <pixiContainer x={-bWidth / 2 - 6} y={-bHeight + 6}>
          <pixiGraphics draw={(g) => drawIconBadge(g, badgeRadius)} />
          <pixiContainer scale={0.5} x={0} y={1}>
            <pixiText
              text={iconEmoji}
              anchor={0.5}
              style={iconStyle}
              resolution={2}
            />
          </pixiContainer>
        </pixiContainer>
      )}
      {/* Header opcional (cobres): nome da sessão no topo, em bronze JP.
          Renderizado a 2x e escalado pra ficar nítido. */}
      {headerName && (
        <pixiContainer x={0} y={-bHeight + 14} scale={0.5}>
          <pixiText
            text={headerName}
            anchor={0.5}
            style={headerStyle}
            resolution={2}
          />
        </pixiContainer>
      )}
      {/* Text rendered at 2x and scaled down for sharpness. Quando tem
          header, empurra pra BAIXO meio headerExtra pra texto continuar
          centrado na "área de operação" abaixo do header. */}
      <pixiContainer
        x={-bWidth / 2 + 15}
        y={-bHeight / 2 + headerExtra / 2}
        scale={0.5}
      >
        <pixiText
          text={text}
          anchor={{ x: 0, y: 0.5 }}
          style={textStyle}
          resolution={2}
        />
      </pixiContainer>
    </pixiContainer>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function AgentSpriteComponent({
  id,
  name,
  color,
  number: _number,
  position,
  phase: _phase,
  bubble,
  headsetTexture: _headsetTexture,
  sunglassesTexture,
  characterTexture,
  characterTypingTexture,
  characterTypingEyeLeftTexture,
  characterStepLeftTexture,
  characterStepRightTexture,
  characterSideIdleTexture,
  characterSideStep1Texture,
  characterSideStep2Texture,
  characterBackIdleTexture,
  characterBackStep1Texture,
  characterBackStep2Texture,
  characterIdleFrames,
  characterRenderSize = 128,
  characterFeetOffsetY = 0,
  renderBubble = true,
  renderLabel = true,
  isTyping = false,
  isSeated,
}: AgentSpriteProps): ReactNode {
  const clickToFocusEnabled = usePreferencesStore((s) => s.clickToFocusEnabled);
  const openFocusPopup = useAttentionStore((s) => s.openFocusPopup);
  const isControlled = useGameStore((s) => s.controlledEntityId === id);
  // Fonte da verdade do "sentado em cadeira": entitySeats (sit flow click +
  // confirm). Override por prop só pra casos sintéticos (demo walker) que
  // não passam pelo sit flow real. Pedro 2026-06-08: cooper agente só pode
  // ficar sem perna quando está numa cadeira — isTyping não é critério.
  const seatedFromStore = useGameStore((s) => s.entitySeats.has(id));
  const seated = isSeated ?? seatedFromStore;

  const typingYOffset = isTyping ? 14 : 0;

  // Walk-bob: when position changes between frames, the character "hops" with
  // a sinusoidal step rhythm. No bob when typing (sitting at desk).
  // Source positions update at ~25 Hz while useTick runs at ~60 Hz, so most
  // ticks see zero delta. A still-tick grace period keeps the walk cycle live
  // across those gaps; without it walkPhase resets every other tick and only
  // idle frames ever render.
  const prevPosRef = useRef(position);
  const stillTicksRef = useRef(0);
  const [walkPhase, setWalkPhase] = useState(0);
  const [idlePhase, setIdlePhase] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [moveDir, setMoveDir] = useState<"down" | "up" | "horizontal">("down");
  // facing=1 → sprite drawn as-is (side sprites are authored facing LEFT, so
  // this matches movement to the left). facing=-1 → scale.x mirrors the sprite
  // so it faces right when travel is rightward.
  const [facing, setFacing] = useState<1 | -1>(1);
  useTick((ticker) => {
    const prev = prevPosRef.current;
    const dx = position.x - prev.x;
    const dy = position.y - prev.y;
    const speed = Math.sqrt(dx * dx + dy * dy);
    // isTyping não bloqueia a detecção de movimento — cobres nascem com
    // isTyping=true e a flag não é resetada ao se moverem (departure/re-seat).
    // O crop "sentado" agora depende de entitySeats, não de isTyping, mas
    // mantemos a detecção de movimento aqui pra animar passos normalmente.
    if (speed > 0.1) {
      stillTicksRef.current = 0;
      if (!isMoving) setIsMoving(true);
      setWalkPhase((p) => p + ticker.deltaTime * 0.3);
      const nextDir: "down" | "up" | "horizontal" =
        Math.abs(dx) > Math.abs(dy)
          ? "horizontal"
          : dy < 0
            ? "up"
            : "down";
      if (nextDir !== moveDir) setMoveDir(nextDir);
      if (Math.abs(dx) > 0.5) {
        const nextFacing: 1 | -1 = dx > 0 ? -1 : 1;
        if (nextFacing !== facing) setFacing(nextFacing);
      }
    } else if (isMoving) {
      stillTicksRef.current += 1;
      // ~10 ticks ≈ 165 ms grace at 60 fps — covers the gap between 25 Hz
      // position updates while still ending the cycle promptly on real stops.
      if (stillTicksRef.current < 10) {
        setWalkPhase((p) => p + ticker.deltaTime * 0.3);
      } else {
        setIsMoving(false);
        setWalkPhase(0);
        stillTicksRef.current = 0;
      }
    } else {
      // Accumulate idle phase when standing still + not typing — drives breathing.
      if (!isTyping) setIdlePhase((p) => p + ticker.deltaTime * 0.05);
    }
    prevPosRef.current = position;
  });
  // Half-rectified sine → upward hops at ~3 steps/sec, amplitude 2 px.
  const walkBobY = isMoving ? -Math.abs(Math.sin(walkPhase)) * 2 : 0;

  // Walk frame cycling: when moving, alternate idle → step1 → idle → step2
  // about every 220 ms (Math.floor(walkPhase * 0.25) cycles 0-3).
  const walkFrameIndex = isMoving ? Math.floor(walkPhase * 0.25) % 4 : 0;
  // Breathing-idle cycle when standing still + not typing and idle frames provided.
  const validIdleFrames = characterIdleFrames?.filter(
    (t): t is Texture => t != null,
  );
  const idleFrameIndex =
    validIdleFrames && validIdleFrames.length > 0
      ? Math.floor(idlePhase * 1.5) % validIdleFrames.length
      : 0;
  const baseIdleTexture =
    isTyping && !isMoving && characterTypingTexture
      ? characterTypingTexture
      : !isMoving && validIdleFrames && validIdleFrames.length > 0
        ? validIdleFrames[idleFrameIndex]
        : characterTexture;
  let activeTexture: Texture | null | undefined = baseIdleTexture;
  if (isMoving) {
    if (moveDir === "horizontal" && characterSideIdleTexture) {
      // Side-view walk cycle
      if (walkFrameIndex === 1 && characterSideStep1Texture)
        activeTexture = characterSideStep1Texture;
      else if (walkFrameIndex === 3 && characterSideStep2Texture)
        activeTexture = characterSideStep2Texture;
      else activeTexture = characterSideIdleTexture;
    } else if (moveDir === "up" && characterBackIdleTexture) {
      // Back-view walk cycle
      if (walkFrameIndex === 1 && characterBackStep1Texture)
        activeTexture = characterBackStep1Texture;
      else if (walkFrameIndex === 3 && characterBackStep2Texture)
        activeTexture = characterBackStep2Texture;
      else activeTexture = characterBackIdleTexture;
    } else {
      // Down (front-facing) walk cycle
      if (walkFrameIndex === 1 && characterStepLeftTexture)
        activeTexture = characterStepLeftTexture;
      else if (walkFrameIndex === 3 && characterStepRightTexture)
        activeTexture = characterStepRightTexture;
      else activeTexture = characterTexture;
    }
  }

  // Seated crop: when the entity is seated in a chair (entitySeats / isSeated
  // override), render only the top portion (head + chest + waist) so the
  // legs/feet don't peek below the desk. Proportional to source dimensions so
  // it works for both 128px chrome dummies and 240px PixelLab sprites (~66%
  // of height keeps head+chest+waist). isTyping NÃO é critério aqui — o
  // cobre nasce com isTyping=true mas só pode ficar sem perna quando está
  // efetivamente sentado. Pedro 2026-06-08.
  const SEATED_CROP_RATIO = 85 / 128;
  const seatedTexture = useMemo(() => {
    const src = characterTypingTexture ?? characterTexture;
    if (!src) return null;
    const w = src.source.width;
    const h = src.source.height;
    return new Texture({
      source: src.source,
      frame: new Rectangle(0, 0, w, Math.round(h * SEATED_CROP_RATIO)),
    });
  }, [characterTypingTexture, characterTexture]);
  const seatedRenderHeight = characterRenderSize * SEATED_CROP_RATIO;

  // No drop shadow — pixel art chibi reads cleaner without one.
  const drawShadow = useCallback((g: Graphics) => {
    g.clear();
  }, []);

  // Memoize draw callback
  const drawCallback = useMemo(
    () => (g: Graphics) => drawAgent(g, color),
    [color],
  );

  // Click handler. For session-agents (id starts with "agent_session_"),
  // bypass the generic focus popup and switch to the underlying Claude
  // Code session directly. For regular agents, open the focus popup.
  const handlePointerTap = useCallback(() => {
    if (!clickToFocusEnabled) return;
    // Para os cobres (sessões Claude), abrir o popup que tem AMBOS os
    // botões: "focar terminal nativo" e "abrir sessão no painel". Antes
    // o click ia direto pra session switch, sem opção de focar o
    // terminal externo — que é justamente o que o Pedro quer pra os
    // cobres aguardando autorização (Pedro 2026-06-08).
    const canvas = document.querySelector(".pixi-canvas-container canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / 1280; // CANVAS_WIDTH = 1280
    const screenX = rect.left + position.x * scale;
    const screenY = rect.top + position.y * scale;
    openFocusPopup(id, screenX, screenY);
  }, [clickToFocusEnabled, id, position.x, position.y, openFocusPopup]);

  // Bubble offset for capsule rendering
  const bubbleOffset = -93;

  return (
    <pixiContainer
      x={position.x}
      y={position.y}
      onPointerTap={handlePointerTap}
      interactive={clickToFocusEnabled || id.startsWith("agent_session_")}
      cursor={id.startsWith("agent_session_") ? "pointer" : undefined}
    >
      {/* Drop shadow under the agent's feet (always on, behind body). */}
      <pixiGraphics draw={drawShadow} />

      {/* Agent body — static when idle/typing, hop-bobs when walking.
          Wrapped in a flip container so the sprite faces direction of travel.
          When seated in a chair, use the cropped texture (waist up only) so
          legs are hidden behind the desk → looks "seated". O !isMoving é
          salvaguarda contra glitch de re-seat (se o personagem ainda está
          fisicamente em movimento, mostra corpo inteiro até parar). */}
      <pixiContainer scale={{ x: facing, y: 1 }}>
        {seated && !isMoving && seatedTexture ? (
          <pixiSprite
            texture={seatedTexture}
            anchor={{ x: 0.5, y: 1 }}
            x={0}
            y={22 + characterFeetOffsetY + typingYOffset - (characterRenderSize - seatedRenderHeight)}
            width={characterRenderSize}
            height={seatedRenderHeight}
          />
        ) : activeTexture ? (
          <pixiSprite
            texture={activeTexture}
            anchor={{ x: 0.5, y: 1 }}
            x={0}
            y={22 + characterFeetOffsetY + typingYOffset + walkBobY}
            width={characterRenderSize}
            height={characterRenderSize}
          />
        ) : (
          <pixiGraphics draw={drawCallback} />
        )}
      </pixiContainer>

      {/* Sunglasses */}
      {sunglassesTexture && (
        <pixiSprite
          texture={sunglassesTexture}
          anchor={0.5}
          x={0}
          y={-37}
          scale={{ x: 0.036, y: 0.04 }}
        />
      )}

      {/* Agent name if present - hide when in elevator or when renderLabel is false */}
      {renderLabel && name && !isInElevatorZone(position) && (
        <pixiContainer y={-90} scale={0.5}>
          <pixiText
            text={name}
            anchor={0.5}
            style={{
              fontFamily: "monospace",
              fontSize: 24,
              fill: 0xffffff,
              fontWeight: "bold",
              stroke: { width: 4, color: 0x000000 },
            }}
            resolution={2}
          />
        </pixiContainer>
      )}

      {/* Bubble - hide when in elevator or when renderBubble is false */}
      {renderBubble && bubble && !isInElevatorZone(position) && (
        <Bubble content={bubble} yOffset={bubbleOffset} />
      )}

      {/* Plumbob foi pra PlumbobOverlay no OfficeGame (sempre acima de tudo). */}
    </pixiContainer>
  );
}

// ============================================================================
// AGENT ARMS COMPONENT (rendered separately after desk surfaces)
// ============================================================================

export interface AgentArmsProps {
  position: Position;
  isTyping: boolean;
}

function AgentArmsComponent({ position, isTyping }: AgentArmsProps): ReactNode {
  // Animation state for typing
  const [typingTime, setTypingTime] = useState(0);

  // Animate typing - oscillate hands up/down
  useTick((ticker) => {
    if (isTyping) {
      setTypingTime((t) => t + ticker.deltaTime * 0.15);
    } else if (typingTime !== 0) {
      setTypingTime(0);
    }
  });

  // Calculate arm animation offsets (subtle, out of phase for natural look)
  const rightArmOffset = isTyping ? Math.sin(typingTime * 8) * 2 : 0;
  const leftArmOffset = isTyping
    ? Math.sin(typingTime * 8 + Math.PI * 0.7) * 2
    : 0;

  // Agent arm params: body half-width 22px, shoulder at y=-16, keyboard at y=16
  const agentArmParams = useMemo(
    () => ({
      bodyHalfWidth: (AGENT_WIDTH - STROKE_WIDTH) / 2,
      startY: -16,
      endY: 16,
      handColor: 0x1f2937,
    }),
    [],
  );

  // Arm draw callbacks
  const drawRightArmCallback = useCallback(
    (g: Graphics) =>
      drawRightArm(g, { ...agentArmParams, animOffset: rightArmOffset }),
    [agentArmParams, rightArmOffset],
  );

  const drawLeftArmCallback = useCallback(
    (g: Graphics) =>
      drawLeftArm(g, { ...agentArmParams, animOffset: leftArmOffset }),
    [agentArmParams, leftArmOffset],
  );

  return (
    <pixiContainer x={position.x} y={position.y}>
      <pixiGraphics draw={drawRightArmCallback} />
      <pixiGraphics draw={drawLeftArmCallback} />
    </pixiContainer>
  );
}

export const AgentArms = memo(AgentArmsComponent);

// ============================================================================
// AGENT HEADSET COMPONENT (rendered after arms for correct z-order)
// ============================================================================

export interface AgentHeadsetProps {
  position: Position;
  headsetTexture: Texture;
}

function AgentHeadsetComponent({
  position,
  headsetTexture,
}: AgentHeadsetProps): ReactNode {
  return (
    <pixiSprite
      texture={headsetTexture}
      anchor={0.5}
      x={position.x}
      y={position.y - 38}
      scale={{ x: 0.66825, y: 0.675 }}
    />
  );
}

export const AgentHeadset = memo(AgentHeadsetComponent);

// ============================================================================
// AGENT LABEL COMPONENT (rendered separately for z-ordering)
// ============================================================================

export interface AgentLabelProps {
  name: string;
  position: Position;
}

function AgentLabelComponent({ name, position }: AgentLabelProps): ReactNode {
  // Floating name only — no pill background (reserved for player avatars).
  // Posição -130 (Pedro 2026-06-09: subiu pra ficar ACIMA do bubble do
  // cobre que mora em yOffset=-80 e cresce pra cima até ~-115).
  return (
    <pixiContainer x={position.x} y={position.y - 130}>
      <pixiText
        text={name}
        anchor={0.5}
        resolution={2}
        style={{
          fontFamily: "monospace",
          fontSize: 16,
          fill: 0xffffff,
          fontWeight: "bold",
          stroke: { width: 3, color: 0x000000 },
        }}
      />
    </pixiContainer>
  );
}

export const AgentLabel = memo(AgentLabelComponent);

export const AgentSprite = memo(AgentSpriteComponent);

// Export Bubble component for use in top-level bubbles layer
export { Bubble };
