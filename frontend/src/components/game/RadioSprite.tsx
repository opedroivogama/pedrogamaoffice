"use client";

import { useCallback, type ReactNode } from "react";
import { type Graphics, type Texture } from "pixi.js";
import { ContactShadow } from "./ContactShadow";

interface RadioSpriteProps {
  x: number;
  y: number;
  /** Mesa pequena que serve de stand pro rádio. Quando vier `cornerTableTexture`,
   *  ela tem prioridade (arte nova de mesa de madeira). `deskTexture` é fallback. */
  deskTexture: Texture | null;
  cornerTableTexture?: Texture | null;
  radioTexture?: Texture | null;
}

// ============================================================================
// BOOMBOX — ISOMETRIC 3/4 VIEW (chunky pixel art)
// ============================================================================
// Vibrant orange body + purple side for depth, blue speaker grille, yellow
// knobs, handle on top, antenna. Heavy black outlines to read as pixel art.

// Vintage office palette — matches the printer/desktop equipment look.
const OUTLINE = 0x1a1815;
const BODY_MAIN = 0xe4dcc8;    // cream front/back face
const BODY_TOP = 0xc8bfa8;     // slightly darker top (light shadow)
const BODY_SIDE = 0xa8a092;    // darker side (deeper shadow)
const HANDLE = 0x3a3530;       // dark gray plastic handle
const PANEL_DARK = 0x3a3a3a;   // recessed grille panel
const PANEL_HI = 0x5a5a5a;     // vent slots highlight
const KNOB_DARK = 0x2a2620;
const KNOB_HI = 0xc4ad7a;      // brass-ish accent (antenna tip / port)
const CABLE = 0x1a1815;        // black cable

export function BoomboxIso(): ReactNode {
  const draw = useCallback((g: Graphics) => {
    g.clear();

    // Isometric BACK view, refined with thin 1px lines matching the printer
    // sprite's vintage office aesthetic. No speakers, display, or knobs.

    // ── LEFT SIDE FACE (depth shadow) ───────────────────────────────
    g.poly([-26, -16, -32, -22, -32, 2, -26, 8]);
    g.fill({ color: BODY_SIDE });
    g.stroke({ color: OUTLINE, width: 1 });

    // ── TOP FACE (lighter, depth offset to the left) ────────────────
    g.poly([26, -16, 20, -22, -32, -22, -26, -16]);
    g.fill({ color: BODY_TOP });
    g.stroke({ color: OUTLINE, width: 1 });
    // Subtle highlight along the top-front edge
    g.moveTo(-25, -16);
    g.lineTo(25, -16);
    g.stroke({ color: BODY_MAIN, width: 0.5, alpha: 0.6 });

    // ── BACK FACE (main body, cream) ────────────────────────────────
    g.rect(-26, -16, 52, 24);
    g.fill({ color: BODY_MAIN });
    g.stroke({ color: OUTLINE, width: 1 });

    // ── RECESSED VENT PANEL (dark grille with fine slots) ───────────
    g.rect(-18, -10, 36, 12);
    g.fill({ color: PANEL_DARK });
    g.stroke({ color: OUTLINE, width: 1 });
    // Fine horizontal vent slots — alternating dark + hi for grille texture
    for (let i = 0; i < 5; i++) {
      const slotY = -9 + i * 2.4;
      g.rect(-15, slotY, 30, 0.7);
      g.fill({ color: PANEL_HI });
    }
    // Tiny vertical separator in middle of grille
    g.rect(-0.5, -9, 1, 11);
    g.fill({ color: PANEL_HI, alpha: 0.4 });

    // ── HANDLE (top, dark plastic, fine outline) ────────────────────
    g.roundRect(-10, -30, 22, 9, 3);
    g.fill({ color: HANDLE });
    g.stroke({ color: OUTLINE, width: 1 });
    // Handle opening (the gap you'd grip)
    g.roundRect(-6, -27, 14, 3, 1.5);
    g.fill({ color: OUTLINE });

    // ── POWER CABLE PORT (small recessed circle) ────────────────────
    g.circle(-14, 3, 1.8);
    g.fill({ color: KNOB_DARK });
    g.stroke({ color: OUTLINE, width: 0.6 });

    // ── COILED POWER CABLE hanging from port (thin black) ───────────
    g.moveTo(-14, 4.5);
    g.bezierCurveTo(-19, 9, -10, 13, -16, 17);
    g.bezierCurveTo(-23, 21, -11, 24, -19, 27);
    g.stroke({ color: CABLE, width: 1 });

    // ── SCREWS (4 tiny corners of recessed panel) ───────────────────
    for (const [sx, sy] of [
      [-21, -12], [21, -12], [-21, 4], [21, 4],
    ] as const) {
      g.circle(sx, sy, 0.7);
      g.fill({ color: OUTLINE });
    }

    // ── SERIAL LABEL (small light rectangle, lower-right detail) ────
    g.rect(8, 3, 9, 3);
    g.fill({ color: BODY_TOP });
    g.stroke({ color: OUTLINE, width: 0.5 });

    // ── ANTENNA (back-LEFT, thin diagonal line up) ──────────────────
    g.moveTo(-28, -22);
    g.lineTo(-34, -38);
    g.stroke({ color: OUTLINE, width: 1 });
    g.circle(-34, -38, 1.3);
    g.fill({ color: KNOB_HI });
    g.stroke({ color: OUTLINE, width: 0.6 });
  }, []);

  return <pixiGraphics draw={draw} />;
}

// ============================================================================
// MAIN
// ============================================================================

export function RadioSprite({
  x,
  y,
  deskTexture,
  cornerTableTexture,
  radioTexture,
}: RadioSpriteProps): ReactNode {
  // Notas musicais migraram pro rádio de parede (FLOOR_RADIO_POSITION) —
  // veja <MusicNotesAura/> em OfficeGame.tsx. Esse rádio do canto continua
  // como objeto decorativo silencioso.

  // Boombox stays planted — it's a physical object on a desk. No bob.
  const bob = 0;

  return (
    <pixiContainer x={x} y={y} zIndex={y}>
      {/* Drop shadow sob a mesa do rádio. */}
      <ContactShadow width={88} height={22} y={62} alpha={0.4} />

      {/* Mesinha de canto — usa o sprite novo (corner-table.png, 720x719) quando
          disponível. Scale 0.05 dá ~36px de largura, perto do tamanho da
          desk antiga reduzida. Fallback pra desk.png antiga se ainda não
          carregou. */}
      {cornerTableTexture ? (
        <pixiSprite
          texture={cornerTableTexture}
          anchor={{ x: 0.5, y: 0 }}
          scale={0.1}
        />
      ) : deskTexture ? (
        <pixiSprite
          texture={deskTexture}
          anchor={{ x: 0.5, y: 0 }}
          scale={{ x: 0.105 * 0.6, y: 0.105 }}
        />
      ) : null}

      {/* Blue isometric radio sprite. Scale 0.0992 = 2× o tamanho original.
          anchor.y=0.79 = base REAL do rádio (medida no PNG): a imagem tem
          261px de padding transparente abaixo do rádio, então 0.85 estava
          fazendo ele flutuar. */}
      {radioTexture ? (
        <pixiSprite
          texture={radioTexture}
          anchor={{ x: 0.5, y: 0.79 }}
          y={18 + bob}
          scale={0.0992}
        />
      ) : (
        <pixiContainer y={15 + bob}>
          <BoomboxIso />
        </pixiContainer>
      )}
    </pixiContainer>
  );
}
