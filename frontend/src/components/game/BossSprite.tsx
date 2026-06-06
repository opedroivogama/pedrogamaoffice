/**
 * BossSprite Component
 *
 * Renders the boss character at their desk with state-based coloring.
 * Uses sprites for desk, chair, keyboard, monitor, and phone like agent desks.
 */

"use client";

import { memo, useMemo, useState, useCallback, type ReactNode } from "react";
import { useTick } from "@pixi/react";
import { Graphics, TextStyle, Texture, Rectangle } from "pixi.js";
import type { BossState, BubbleContent, Position } from "@/types";
import { MarqueeText } from "./MarqueeText";
import { ICON_MAP } from "./shared/iconMap";
import { drawBubble, drawIconBadge } from "./shared/drawBubble";
import { drawRightArm, drawLeftArm } from "./shared/drawArm";
import { drawChibi } from "./shared/drawChibi";
import { ContactShadow } from "./ContactShadow";
import { truncateBubbleText } from "@/utils/bubbleText";
import { useAttentionStore } from "@/stores/attentionStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useGameStore } from "@/stores/gameStore";

// ============================================================================
// TYPES
// ============================================================================

export interface BossSpriteProps {
  position: Position;
  state: BossState;
  bubble: BubbleContent | null;
  inUseBy: "arrival" | "departure" | null;
  currentTask: string | null;
  chairTexture: Texture | null;
  deskTexture: Texture | null;
  keyboardTexture: Texture | null;
  monitorTexture: Texture | null;
  phoneTexture: Texture | null;
  headsetTexture: Texture | null;
  sunglassesTexture: Texture | null;
  characterTexture?: Texture | null;
  characterTypingTexture?: Texture | null;
  characterTypingEyeLeftTexture?: Texture | null;
  characterIdleFrames?: (Texture | null)[] | null; // optional breathing-idle frames cycled when sprite is rendered (overrides characterTexture).
  bodyTint?: number; // optional PIXI tint applied to the body sprite (e.g., 0xB8972A for gold)
  characterRenderSize?: number; // visual size in px (default 128). Bump for sources with empty canvas padding (e.g. PixelLab 228 sprites).
  renderBubble?: boolean; // Whether to render bubble (default true)
  isTyping?: boolean; // Whether boss is typing (animates arms)
  /** True when Claudius is actively producing a response and thus blocked
   *  for new messages. Drives the ⚔️🔨🛡️ work indicator over his head. */
  isWorking?: boolean;
  isAway?: boolean; // Whether boss is away from desk (hides body, shows only furniture)
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BOSS_WIDTH = 48; // 1.5 blocks × 32px
const BOSS_HEIGHT = 80; // 2.5 blocks × 32px
const STROKE_WIDTH = 4;

/** Distância vertical (px) entre o centro da badge "Claudius" e o centro
 *  do WorkIndicator (⚔️🔨🛡️) que fica acima dela. Constante exportada
 *  pra OfficeGame poder usar o mesmo gap no WanderingBoss. */
export const CLAUDIUS_WORK_INDICATOR_GAP = 33;

/** Idle secundário — período em segundos entre um "suspiro/alongamento" e o
 *  próximo. Pedro pediu 30s. Mantém o personagem visualmente vivo sem
 *  competir com o breathing-idle contínuo. */
export const SECONDARY_IDLE_PERIOD_S = 30;
/** Duração do "suspiro" em segundos. */
export const SECONDARY_IDLE_DURATION_S = 1.8;
/** Amplitude do stretch Y no pico do suspiro (0.06 = +6%). */
export const SECONDARY_IDLE_AMPLITUDE = 0.06;

// State colors for the boss (kept for reference, not currently used)
const _STATE_COLORS: Record<BossState, number> = {
  idle: 0x2d3748, // Gray
  phone_ringing: 0xfbbf24, // Yellow
  on_phone: 0xfbbf24, // Yellow
  receiving: 0x06b6d4, // Cyan - receiving user input
  working: 0xef4444, // Red - active
  delegating: 0x8b5cf6, // Purple - spawning agents
  waiting_permission: 0xf97316, // Orange - waiting for permission
  reviewing: 0x3b82f6, // Blue - reviewing agent work
  completing: 0x22c55e, // Green - finishing up
};

// ============================================================================
// DRAWING FUNCTIONS
// ============================================================================

function drawBossBody(g: Graphics, _state: BossState): void {
  g.clear();

  // Chibi/Pokemon-GBA style. Boss anchor is centered (y=0 is body center),
  // so feet sit at +38. Distinct hair tone (Claude-orange) to set the boss
  // apart from regular agents.
  drawChibi(g, {
    shirtColor: 0x1f2937,
    hairColor: 0xc97a3f,
    feetY: 38,
    variant: "boss",
  });
}

function drawFallbackChair(g: Graphics): void {
  g.clear();
  g.circle(0, 15, 25);
  g.fill(0x4a5568);
  g.stroke({ width: 2, color: 0x2d3748 });
}

function drawFallbackDesk(g: Graphics): void {
  g.clear();
  g.rect(-70, 15, 140, 80);
  g.fill(0x5d3a1e);
  g.stroke({ width: 4, color: 0x3d2a1e });
}

// ============================================================================
// BUBBLE COMPONENT
// ============================================================================

interface BubbleProps {
  content: BubbleContent;
  yOffset: number;
}

function Bubble({ content, yOffset }: BubbleProps): ReactNode {
  const { type = "thought", icon } = content;
  const text = truncateBubbleText(content.text);

  // Convert icon name to emoji if needed
  const iconEmoji = icon ? (ICON_MAP[icon] ?? icon) : undefined;

  // Icon badge constants
  const badgeRadius = 16; // Radius of the circular badge

  // Calculate bubble dimensions — Montserrat 700, dimensões reduzidas ~20%
  // a pedido do Pedro (a versão anterior ficou rústica/grande demais).
  const charWidth = 8;
  const paddingH = 32;
  const maxW = 256;
  const rawWidth = text.length * charWidth + paddingH;
  const bWidth = Math.min(maxW, Math.max(88, rawWidth));
  const capacity = (bWidth - paddingH) / charWidth;
  const lines = Math.max(1, Math.ceil(text.length / capacity));
  const bHeight = 35 + lines * 16;

  // Text style at 2x for sharp rendering.
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
      {/* Text rendered at 2x and scaled down for sharpness */}
      <pixiContainer x={-bWidth / 2 + 15} y={-bHeight / 2} scale={0.5}>
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
// WORK INDICATOR — emoji pill acima do Claudius quando ele está produzindo
// ============================================================================

/**
 * Indicador visual de "Claudius está trabalhando E bloqueado pra mensagens".
 * Pill preta com borda dourada igual à badge "Claudius", contendo:
 *   ⚔️  🔨  🛡️
 * Espada+escudo sinalizam que ele tá em batalha (não dá pra interromper);
 * o martelo no meio é o ícone de trabalho.
 *
 * Tem um pulso suave de alpha pra puxar o olhar sem ficar piscando agressivo.
 */
export function WorkIndicator(): ReactNode {
  const [pulse, setPulse] = useState(0);
  useTick((ticker) => {
    setPulse((p) => p + ticker.deltaTime * 0.06);
  });
  const alpha = 0.85 + Math.sin(pulse) * 0.15; // 0.7 .. 1.0

  const pillW = 180;
  const pillH = 56;

  const drawPill = (g: Graphics) => {
    g.clear();
    g.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 18);
    g.fill({ color: 0x0e0e0e, alpha: 0.92 });
    g.stroke({ color: 0xb8972a, width: 3 });
  };

  const emojiStyle: Partial<TextStyle> = {
    fontFamily:
      '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
    fontSize: 38,
    fill: 0xffffff,
  };

  return (
    <pixiContainer alpha={alpha}>
      <pixiGraphics draw={drawPill} />
      <pixiText text="⚔️" anchor={0.5} x={-50} y={1} style={emojiStyle} resolution={2} />
      <pixiText text="🔨" anchor={0.5} x={0} y={1} style={emojiStyle} resolution={2} />
      <pixiText text="🛡️" anchor={0.5} x={50} y={1} style={emojiStyle} resolution={2} />
    </pixiContainer>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function BossSpriteComponent({
  position,
  state,
  bubble,
  inUseBy: _inUseBy,
  currentTask,
  chairTexture,
  deskTexture,
  keyboardTexture,
  monitorTexture,
  phoneTexture: _phoneTexture,
  headsetTexture,
  sunglassesTexture,
  characterTexture,
  characterTypingTexture,
  characterTypingEyeLeftTexture,
  characterIdleFrames,
  bodyTint,
  characterRenderSize = 128,
  renderBubble = true,
  isTyping = false,
  isWorking = false,
  isAway = false,
}: BossSpriteProps): ReactNode {
  const openFocusPopup = useAttentionStore((s) => s.openFocusPopup);
  const clickToFocusEnabled = usePreferencesStore((s) => s.clickToFocusEnabled);

  // Animation state for typing
  const [typingTime, setTypingTime] = useState(0);

  // Always-on animation accumulator. Drives idle "breathing" oscillation
  // (visible both when sitting and standing) and the legacy chibi-fallback
  // arm wave (gated separately by isTyping inside the arm draw callbacks).
  useTick((ticker) => {
    setTypingTime((t) => t + ticker.deltaTime * 0.05);
  });

  // Calculate arm animation offsets (subtle, out of phase for natural look)
  const rightArmOffset = isTyping ? Math.sin(typingTime * 8) * 2 : 0;
  const leftArmOffset = isTyping
    ? Math.sin(typingTime * 8 + Math.PI * 0.7) * 2
    : 0;

  // Idle secundário — a cada 30s aplica um stretch Y suave (peak 1.06x) por
  // 1.8s pra quebrar a monotonia do breathing-idle, simulando um suspiro/
  // alongamento. Placeholder até termos sprite dedicado.
  // typingTime acumula a deltaTime*0.05 → 1 unit = 1/3 s.
  const secondaryPhase = ((typingTime / 3) % SECONDARY_IDLE_PERIOD_S);
  const inSecondaryIdle = secondaryPhase < SECONDARY_IDLE_DURATION_S;
  const secondaryStretchY = inSecondaryIdle
    ? 1 + SECONDARY_IDLE_AMPLITUDE *
      Math.sin((secondaryPhase / SECONDARY_IDLE_DURATION_S) * Math.PI)
    : 1;

  // Shirt-slides-over-pants model: full body translates ±2 px; pants are a
  // separate STATIC overlay rendered on top. The seam is invisible because
  // both sprites have identical content in the overlap region (uniform pants
  // color near the waist) and the static overlay always wins z-order.
  const splitHalves = useMemo(() => {
    const cut = (t: Texture | null | undefined, waist: number) => {
      if (!t) return null;
      return {
        waist,
        pantsH: 128 - waist,
        full: t,
        pants: new Texture({
          source: t.source,
          frame: new Rectangle(0, waist, 128, 128 - waist),
        }),
      };
    };
    return {
      idle: cut(characterTexture, 95),
      typing: cut(characterTypingTexture, 90),
    };
  }, [characterTexture, characterTypingTexture]);

  // Render path do Claudius sentado: pra preservar o brilho dourado idêntico
  // ao em pé, NÃO criamos Texture cropada (Pixi escala/sample-a diferente
  // texturas com `frame` + width/height assimétricos, o que dessatura o tint).
  // Usamos a textura full direto e empurramos a base do sprite pra abaixo do
  // tampo da mesa, deixando o desk cobrir naturalmente as pernas via z-order.
  // O cabeça/tronco que ficam visíveis acima da mesa preservam o tint exato.
  const SEATED_HIDE_RATIO = 0.42; // 42% do sprite fica escondido atrás da mesa

  // Memoize draw callbacks
  const drawBossCallback = useMemo(
    () => (g: Graphics) => drawBossBody(g, state),
    [state],
  );

  // Boss arm params: body half-width 22px, shoulder at y=0, keyboard at y=32
  const bossArmParams = useMemo(
    () => ({
      bodyHalfWidth: (BOSS_WIDTH - STROKE_WIDTH) / 2,
      startY: 0,
      endY: 32,
      handColor: 0x1f2937,
    }),
    [],
  );

  // Arm draw callbacks need to be recreated when animation changes
  const drawRightArmCallback = useCallback(
    (g: Graphics) =>
      drawRightArm(g, { ...bossArmParams, animOffset: rightArmOffset }),
    [bossArmParams, rightArmOffset],
  );

  const drawLeftArmCallback = useCallback(
    (g: Graphics) =>
      drawLeftArm(g, { ...bossArmParams, animOffset: leftArmOffset }),
    [bossArmParams, leftArmOffset],
  );

  const bubbleOffset = -80;

  const handleBossTap = useCallback(() => {
    if (!clickToFocusEnabled) return;
    const canvas = document.querySelector(".pixi-canvas-container canvas");
    if (!canvas) return;
    const rect = (canvas as HTMLElement).getBoundingClientRect();
    const scale = rect.width / 1280;
    const screenX = rect.left + position.x * scale;
    const screenY = rect.top + position.y * scale;
    openFocusPopup("boss", screenX, screenY);
  }, [clickToFocusEnabled, position.x, position.y, openFocusPopup]);

  return (
    <pixiContainer
      x={position.x}
      y={position.y}
      onPointerTap={handleBossTap}
      interactive={clickToFocusEnabled}
    >
      {/* Drop shadow sob a mesa do boss (vai pro chão, atrás da cadeira).
          y subido de 80→60 (Pedro 2026-06-06): conjunto da mesa do boss
          sobe 20px pra não cortar no limite inferior da sala. */}
      <ContactShadow width={170} height={26} y={50} alpha={0.4} />

      {/* Chair - behind everything. y subido de 30→10 (acompanha o conjunto). */}
      {chairTexture ? (
        <pixiSprite
          texture={chairTexture}
          anchor={0.5}
          x={5}
          y={0}
          scale={0.1386}
        />
      ) : (
        <pixiGraphics draw={drawFallbackChair} />
      )}

      {/* Boss character (body + accessories) - hidden when away from desk.
          y subido de 6→-14 (acompanha conjunto da mesa). */}
      {!isAway && (
        <pixiContainer y={-24}>
          {/* Boss body — sentado, sempre cropado pra mostrar só do peito
              pra cima. Sem o crop, sprites grandes (240px) mostram pernas
              abaixo da mesa. Match com SEATED_CROP_RATIO usado nas
              cadeiras dos outros personagens (chairs.ts: 0.58). */}
          {(() => {
            // Mesmo pipeline visual que o WanderingBoss em pé: textura full
            // sem crop, width=height (sem distorção). A base do sprite é
            // empurrada pra abaixo do tampo da mesa (y=4) por SEATED_HIDE_RATIO,
            // assim a metade inferior fica escondida atrás do desk via z-order
            // (desk renderiza depois neste container). Tint dourado intacto.
            const validIdleFrames = characterIdleFrames?.filter(
              (t): t is Texture => t != null,
            );
            const activeTexture =
              validIdleFrames && validIdleFrames.length > 0
                ? validIdleFrames[
                    Math.floor(typingTime * 1.5) % validIdleFrames.length
                  ]
                : isTyping && characterTypingTexture
                  ? characterTypingTexture
                  : characterTexture;
            if (!activeTexture) {
              return <pixiGraphics draw={drawBossCallback} />;
            }
            const hideOffset = characterRenderSize * SEATED_HIDE_RATIO;
            // Wrap em container pra aplicar scale.y do idle secundário sem
            // brigar com width/height explícitos do sprite. Origem do
            // container = posição dos pés (anchor.y=1 do sprite), então
            // scale.y estende pra cima como um alongamento.
            return (
              <pixiContainer
                x={5}
                y={4 + hideOffset}
                scale={{ x: 1, y: secondaryStretchY }}
              >
                <pixiSprite
                  texture={activeTexture}
                  anchor={{ x: 0.5, y: 1 }}
                  x={0}
                  y={0}
                  width={characterRenderSize}
                  height={characterRenderSize}
                  tint={bodyTint ?? 0xffffff}
                />
              </pixiContainer>
            );
          })()}

          {/* Sunglasses - boss always looks cool (drawn before arms) */}
          {sunglassesTexture && (
            <pixiSprite
              texture={sunglassesTexture}
              anchor={0.5}
              x={0}
              y={-19}
              scale={{ x: 0.036, y: 0.04 }}
              tint={0x000000}
            />
          )}
        </pixiContainer>
      )}

      {/* Desk surface - Mesa do boss no MESMO padrão das outras (Pedro 2026-06-04):
          scale 0.21 (era 0.105), x=-25 y=-25 (y subido de -5→-25 a pedido
          do Pedro 2026-06-06 — conjunto sobe 20px pra não cortar). */}
      {deskTexture ? (
        <pixiSprite
          texture={deskTexture}
          anchor={{ x: 0.5, y: 0 }}
          x={-25}
          y={-35}
          scale={0.21}
        />
      ) : (
        <pixiGraphics draw={drawFallbackDesk} />
      )}

      {/* Keyboard do boss DESABILITADO (Pedro 2026-06-04 — mesa nova já tem
          computador integrado). Pra reativar, troca `false &&` por só `keyboardTexture &&`. */}
      {false && keyboardTexture && (
        <pixiSprite
          texture={keyboardTexture}
          anchor={0.5}
          x={0}
          y={22}
          scale={0.04}
        />
      )}

      {/* Arms - hidden when away from desk or when using character sprite */}
      {!isAway && !characterTexture && (
        <pixiContainer y={6}>
          <pixiGraphics draw={drawRightArmCallback} />
          <pixiGraphics draw={drawLeftArmCallback} />
        </pixiContainer>
      )}

      {/* Headset - hidden when away from desk */}
      {!isAway && headsetTexture && (
        <pixiSprite
          texture={headsetTexture}
          anchor={0.5}
          x={0}
          y={6 - 20}
          scale={{ x: 0.66825, y: 0.675 }}
        />
      )}

      {/* Monitor do boss DESABILITADO (Pedro 2026-06-04). */}
      {false && monitorTexture && (
        <pixiSprite
          texture={monitorTexture}
          anchor={0.5}
          x={-45}
          y={7}
          scale={0.08}
        />
      )}

      {/* Boss label - hidden when away from desk.
          Dark pill com borda dourada.
          Posicionamento empírico (2026-06-04): Pedro pediu pra aproximar
          a badge do sprite sentado pra ficar proporcional ao gap do
          WanderingBoss em pé (y=-187, sprite 128px). Sentado o sprite é
          240px com 42% escondido + padding superior do PNG gold, então
          o cropping deixava a badge muito longe da cabeça visível.
          Valor atual y=-78 mantém ~30-40px de gap percebido. */}
      {!isAway && (
        <pixiContainer x={5} y={-78}>
          <pixiGraphics
            draw={(g) => {
              const label = "Claudius";
              // Mesma proporção da badge do WanderingBoss / UserAvatar:
              // sem container scale=0.5, render direto no tamanho final
              // pra evitar downscale (que dessaturava o dourado).
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
      )}

      {/* Indicador de trabalho do Claudius — fica acima da badge "Claudius".
          Aparece quando `isWorking` é true (boss.backendState working /
          delegating / receiving) — ou seja, ele está produzindo E bloqueado
          pra novas mensagens. ⚔️🔨🛡️ deixa óbvio que não dá pra
          interromper agora. y=-250: ~50px acima da badge (y=-200). */}
      {!isAway && isWorking && (
        <pixiContainer
          x={5}
          y={-78 - CLAUDIUS_WORK_INDICATOR_GAP}
          scale={0.5}
        >
          <WorkIndicator />
        </pixiContainer>
      )}

      {/* Task marquee on desk - scrolling user prompt */}
      {currentTask && (
        <pixiContainer x={0} y={70}>
          <MarqueeText text={currentTask} width={115} color="#00ff88" />
        </pixiContainer>
      )}

      {/* Bubble - only render if renderBubble is true and boss is at desk */}
      {renderBubble && bubble && !isAway && (
        <Bubble content={bubble} yOffset={bubbleOffset} />
      )}

      {/* Plumbob não renderiza aqui — só aparece sobre o Claudius em pé
          (WanderingBoss). Sentado a mesa já indica visualmente onde ele
          está, então o diamante na mesa ficaria redundante. */}
    </pixiContainer>
  );
}

export const BossSprite = memo(BossSpriteComponent);

// Export Bubble component for use in top-level bubbles layer
export { Bubble as BossBubble };

// ============================================================================
// MOBILE BOSS COMPONENT (for walking around the office)
// ============================================================================

export interface MobileBossProps {
  position: Position;
  jumpOffset?: number; // Vertical offset for jump animation
  scale?: number; // Scale factor for boss body
  sunglassesTexture: Texture | null;
  headsetTexture: Texture | null;
}

function MobileBossComponent({
  position,
  jumpOffset = 0,
  scale = 1.0,
  sunglassesTexture,
  headsetTexture,
}: MobileBossProps): ReactNode {
  const drawBossCallback = useMemo(
    () => (g: Graphics) => drawBossBody(g, "working"),
    [],
  );

  return (
    <pixiContainer x={position.x} y={position.y + jumpOffset} scale={scale}>
      {/* Boss body */}
      <pixiGraphics draw={drawBossCallback} />

      {/* Sunglasses */}
      {sunglassesTexture && (
        <pixiSprite
          texture={sunglassesTexture}
          anchor={0.5}
          x={0}
          y={-19}
          scale={{ x: 0.036, y: 0.04 }}
          tint={0x000000}
        />
      )}

      {/* Headset */}
      {headsetTexture && (
        <pixiSprite
          texture={headsetTexture}
          anchor={0.5}
          x={0}
          y={-20}
          scale={{ x: 0.66825, y: 0.675 }}
        />
      )}

      {/* Boss label — same pill style as Pedro's. Subido pra -58 pra
          acompanhar o BossSprite estático (-100). */}
      <pixiContainer y={-58} scale={0.5}>
        <pixiGraphics
          draw={(g) => {
            const label = "Claudius";
            const pillW = Math.max(112, label.length * 22 + 40);
            const pillH = 44;
            g.clear();
            g.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 14);
            g.fill({ color: 0x0e0e0e, alpha: 0.9 });
            g.stroke({ color: 0xb8972a, width: 3 });
          }}
        />
        <pixiText
          text="Claudius"
          anchor={0.5}
          style={{
            fontFamily: "monospace",
            fontSize: 36,
            fill: 0xfde7b0,
            fontWeight: "bold",
          }}
          resolution={2}
        />
      </pixiContainer>
    </pixiContainer>
  );
}

export const MobileBoss = memo(MobileBossComponent);
