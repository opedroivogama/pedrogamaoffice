import { Graphics } from "pixi.js";

export interface ChibiParams {
  shirtColor: number;
  hairColor: number;
  feetY: number;
  variant?: "trainer" | "boss";
  hatColor?: number;
}

const PIXEL = 4;
const COLS = 12;
const ROWS = 19;

const TRAINER_TEMPLATE: string[] = [
  "............",
  "...oooooo...",
  "..ohhhhhho..",
  "..ohWhhWho..",
  "..ohhWWWho..",
  "..ooKKKKoo..",
  "..oKFFFFKo..",
  "..oFFFFFFo..",
  "..oFEFFEFo..",
  "..oFFFFFFo..",
  "..oFFMMFFo..",
  "...oFFFFo...",
  "...oCCCCo...",
  "..oSSCCSSo..",
  "..oSSSSSSo..",
  "..oSSSSSSo..",
  "..oPPPPPPo..",
  "..oPPooPPo..",
  "..oBBooBBo..",
];

const BOSS_TEMPLATE: string[] = [
  "............",
  "...oKKKKo...",
  "..oKKKKKKo..",
  "..oKhhhhKo..",
  "..oKKKKKKo..",
  "..oKFFFFKo..",
  "..oFFFFFFo..",
  "..oFEFFEFo..",
  "..oFFFFFFo..",
  "..oFFMMFFo..",
  "...oFFFFo...",
  "...oCCCCo...",
  "..oSSTTSSo..",
  "..oSSSTSSo..",
  "..oSSSTSSo..",
  "..oSSSSSSo..",
  "..oPPPPPPo..",
  "..oPPooPPo..",
  "..oBBooBBo..",
];

function buildPalette(
  shirtColor: number,
  hairColor: number,
  hatColor: number,
): Record<string, number> {
  return {
    o: 0x000000,
    h: hatColor,
    W: 0xf8f8f8,
    K: hairColor,
    F: 0xf8c890,
    E: 0x000000,
    M: 0x88503c,
    S: shirtColor,
    C: 0xf8f8f8,
    T: 0xc97a3f,
    P: 0x3a4a78,
    B: 0xb02020,
  };
}

export function drawChibi(g: Graphics, params: ChibiParams): void {
  const {
    shirtColor,
    hairColor,
    feetY,
    variant = "trainer",
    hatColor = 0xd02828,
  } = params;

  const template = variant === "boss" ? BOSS_TEMPLATE : TRAINER_TEMPLATE;
  const palette = buildPalette(shirtColor, hairColor, hatColor);

  const totalHeight = ROWS * PIXEL;
  const totalWidth = COLS * PIXEL;
  const startX = -totalWidth / 2;
  const startY = feetY - totalHeight;

  for (let row = 0; row < ROWS; row++) {
    const line = template[row];
    for (let col = 0; col < COLS; col++) {
      const ch = line[col];
      if (ch === "." || ch === " ") continue;
      const color = palette[ch];
      if (color === undefined) continue;
      g.rect(startX + col * PIXEL, startY + row * PIXEL, PIXEL, PIXEL);
      g.fill(color);
    }
  }
}
