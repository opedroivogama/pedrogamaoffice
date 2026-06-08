import { useState, useEffect } from "react";
import { Assets, Texture, Rectangle } from "pixi.js";

export type Direction = "down" | "left" | "right" | "up";

export interface CharacterSprite {
  down: Texture[];
  left: Texture[];
  right: Texture[];
  up: Texture[];
}

const SHEET_NAMES = ["char_7", "char_8", "char_9", "char_10"] as const;
type SheetName = (typeof SHEET_NAMES)[number];

const FRAME_SIZE = 64;
const FRAMES_PER_DIR = 4;

const ROW_ORDER: Direction[] = ["down", "left", "right", "up"];

interface UseCharacterSpritesResult {
  sprites: Record<SheetName, CharacterSprite | null>;
  loaded: boolean;
}

function buildDirectionFrames(baseTexture: Texture): CharacterSprite {
  const result: CharacterSprite = { down: [], left: [], right: [], up: [] };
  for (let row = 0; row < ROW_ORDER.length; row++) {
    const dir = ROW_ORDER[row];
    for (let col = 0; col < FRAMES_PER_DIR; col++) {
      const frame = new Texture({
        source: baseTexture.source,
        frame: new Rectangle(
          col * FRAME_SIZE,
          row * FRAME_SIZE,
          FRAME_SIZE,
          FRAME_SIZE,
        ),
      });
      result[dir].push(frame);
    }
  }
  return result;
}

export function useCharacterSprites(): UseCharacterSpritesResult {
  const [sprites, setSprites] = useState<
    Record<SheetName, CharacterSprite | null>
  >(() => ({ char_7: null, char_8: null, char_9: null, char_10: null }));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(
          SHEET_NAMES.map(async (name) => {
            const base: Texture = await Assets.load(
              `/sprites/characters/${name}.png`,
            );
            base.source.scaleMode = "nearest";
            return [name, buildDirectionFrames(base)] as const;
          }),
        );
        if (cancelled) return;
        const next: Record<SheetName, CharacterSprite | null> = {
          char_7: null,
          char_8: null,
          char_9: null,
          char_10: null,
        };
        for (const [name, frames] of entries) next[name] = frames;
        setSprites(next);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { sprites, loaded };
}

export interface DefaultCharacterTextures {
  idle: Texture | null;
  typing: Texture | null;
  typingEyeLeft: Texture | null;
  user: Texture | null;
  userSuit: Texture | null;
  cyborg: Texture | null;
  chromeDummy: Texture | null;
  /** Default character walk-cycle (down/south): left foot forward. */
  stepLeft: Texture | null;
  /** Default character walk-cycle (down/south): right foot forward. */
  stepRight: Texture | null;
  /** Default character idle in side (left-facing) 3/4 profile. */
  sideIdle: Texture | null;
  /** Default character side walk step 1. */
  sideStep1: Texture | null;
  /** Default character side walk step 2. */
  sideStep2: Texture | null;
  /** Default character idle viewed from behind (UP direction). */
  backIdle: Texture | null;
  /** Default character back walk step 1. */
  backStep1: Texture | null;
  /** Default character back walk step 2. */
  backStep2: Texture | null;
  /** Chrome dummy walk-cycle (down): left foot forward. */
  chromeDummyStepLeft: Texture | null;
  /** Chrome dummy walk-cycle (down): right foot forward. */
  chromeDummyStepRight: Texture | null;
  /** Chrome dummy idle in side (left-facing) 3/4 profile. */
  chromeDummySideIdle: Texture | null;
  /** Chrome dummy side walk step 1. */
  chromeDummySideStep1: Texture | null;
  /** Chrome dummy side walk step 2. */
  chromeDummySideStep2: Texture | null;
  /** Chrome dummy idle viewed from behind (UP direction). */
  chromeDummyBackIdle: Texture | null;
  /** Chrome dummy back walk step 1. */
  chromeDummyBackStep1: Texture | null;
  /** Chrome dummy back walk step 2. */
  chromeDummyBackStep2: Texture | null;
  /** CLAUDE_GOLD south rotation — matte gold humanoid AI (used for Claude boss). */
  claudeGoldIdle: Texture | null;
  /** CLAUDE_GOLD walk-south frame with left foot forward. */
  claudeGoldStepLeft: Texture | null;
  /** CLAUDE_GOLD walk-south frame with right foot forward. */
  claudeGoldStepRight: Texture | null;
  /** CLAUDE_GOLD east-facing idle (WanderingBoss flips horizontally for west). */
  claudeGoldSideIdle: Texture | null;
  /** CLAUDE_GOLD walk-east step 1. */
  claudeGoldSideStep1: Texture | null;
  /** CLAUDE_GOLD walk-east step 2. */
  claudeGoldSideStep2: Texture | null;
  /** CLAUDE_GOLD north-facing idle (back view). */
  claudeGoldBackIdle: Texture | null;
  /** CLAUDE_GOLD walk-north step 1. */
  claudeGoldBackStep1: Texture | null;
  /** CLAUDE_GOLD walk-north step 2. */
  claudeGoldBackStep2: Texture | null;
  /** AI_GOLD breathing-idle south frames (4 frames cycled for subtle breathing). */
  claudeGoldIdleFrames: (Texture | null)[];
  /** CLAUDE_GOLD south-east rotation (static, sem walk animation). */
  claudeGoldSEIdle: Texture | null;
  /** CLAUDE_GOLD south-west rotation. */
  claudeGoldSWIdle: Texture | null;
  /** CLAUDE_GOLD north-east rotation. */
  claudeGoldNEIdle: Texture | null;
  /** CLAUDE_GOLD north-west rotation. */
  claudeGoldNWIdle: Texture | null;
  /** AI_SILVER south rotation — silver Mark-II prototype variant for agents. */
  aiSilverIdle: Texture | null;
  /** AI_SILVER walk-south frame 1 (left foot). */
  aiSilverStepLeft: Texture | null;
  /** AI_SILVER walk-south frame 4 (right foot). */
  aiSilverStepRight: Texture | null;
  /** AI_SILVER east-facing side idle (AgentSprite flips for west). */
  aiSilverSideIdle: Texture | null;
  /** AI_SILVER walk-east step 1. */
  aiSilverSideStep1: Texture | null;
  /** AI_SILVER walk-east step 2. */
  aiSilverSideStep2: Texture | null;
  /** AI_SILVER north-facing back idle. */
  aiSilverBackIdle: Texture | null;
  /** AI_SILVER walk-north step 1. */
  aiSilverBackStep1: Texture | null;
  /** AI_SILVER walk-north step 2. */
  aiSilverBackStep2: Texture | null;
  /** AI_SILVER breathing-idle south frames (4 cycled). */
  aiSilverIdleFrames: (Texture | null)[];
  /** AI_COPPER south rotation — copper variant pra representar terminais
   *  Claude externos. Mesmo modelo do silver, tint cobre. */
  aiCopperIdle: Texture | null;
  /** AI_COPPER walk-south frame 1 (left foot). */
  aiCopperStepLeft: Texture | null;
  /** AI_COPPER walk-south frame 4 (right foot). */
  aiCopperStepRight: Texture | null;
  /** AI_COPPER east-facing side idle (AgentSprite flips for west). */
  aiCopperSideIdle: Texture | null;
  /** AI_COPPER walk-east step 1. */
  aiCopperSideStep1: Texture | null;
  /** AI_COPPER walk-east step 2. */
  aiCopperSideStep2: Texture | null;
  /** AI_COPPER north-facing back idle. */
  aiCopperBackIdle: Texture | null;
  /** AI_COPPER walk-north step 1. */
  aiCopperBackStep1: Texture | null;
  /** AI_COPPER walk-north step 2. */
  aiCopperBackStep2: Texture | null;
  /** AI_COPPER breathing-idle south frames (4 cycled). */
  aiCopperIdleFrames: (Texture | null)[];
}

export function useDefaultCharacterTexture(): DefaultCharacterTextures {
  const [textures, setTextures] = useState<DefaultCharacterTextures>({
    idle: null,
    typing: null,
    typingEyeLeft: null,
    user: null,
    userSuit: null,
    cyborg: null,
    chromeDummy: null,
    stepLeft: null,
    stepRight: null,
    sideIdle: null,
    sideStep1: null,
    sideStep2: null,
    backIdle: null,
    backStep1: null,
    backStep2: null,
    chromeDummyStepLeft: null,
    chromeDummyStepRight: null,
    chromeDummySideIdle: null,
    chromeDummySideStep1: null,
    chromeDummySideStep2: null,
    chromeDummyBackIdle: null,
    chromeDummyBackStep1: null,
    chromeDummyBackStep2: null,
    claudeGoldIdle: null,
    claudeGoldStepLeft: null,
    claudeGoldStepRight: null,
    claudeGoldSideIdle: null,
    claudeGoldSideStep1: null,
    claudeGoldSideStep2: null,
    claudeGoldBackIdle: null,
    claudeGoldBackStep1: null,
    claudeGoldBackStep2: null,
    claudeGoldIdleFrames: [],
    claudeGoldSEIdle: null,
    claudeGoldSWIdle: null,
    claudeGoldNEIdle: null,
    claudeGoldNWIdle: null,
    aiSilverIdle: null,
    aiSilverStepLeft: null,
    aiSilverStepRight: null,
    aiSilverSideIdle: null,
    aiSilverSideStep1: null,
    aiSilverSideStep2: null,
    aiSilverBackIdle: null,
    aiSilverBackStep1: null,
    aiSilverBackStep2: null,
    aiSilverIdleFrames: [],
    aiCopperIdle: null,
    aiCopperStepLeft: null,
    aiCopperStepRight: null,
    aiCopperSideIdle: null,
    aiCopperSideStep1: null,
    aiCopperSideStep2: null,
    aiCopperBackIdle: null,
    aiCopperBackStep1: null,
    aiCopperBackStep2: null,
    aiCopperIdleFrames: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          idleBase,
          typingBase,
          eyeLeftBase,
          userBase,
          userSuitBase,
          cyborgBase,
          chromeDummyBase,
          stepLeftBase,
          stepRightBase,
          sideIdleBase,
          sideStep1Base,
          sideStep2Base,
          backIdleBase,
          backStep1Base,
          backStep2Base,
          chromeStepLeftBase,
          chromeStepRightBase,
          chromeSideIdleBase,
          chromeSideStep1Base,
          chromeSideStep2Base,
          chromeBackIdleBase,
          chromeBackStep1Base,
          chromeBackStep2Base,
          claudeGoldIdleBase,
          claudeGoldStepLeftBase,
          claudeGoldStepRightBase,
          claudeGoldSideIdleBase,
          claudeGoldSideStep1Base,
          claudeGoldSideStep2Base,
          claudeGoldBackIdleBase,
          claudeGoldBackStep1Base,
          claudeGoldBackStep2Base,
          claudeGoldIdle0Base,
          claudeGoldIdle1Base,
          claudeGoldIdle2Base,
          claudeGoldIdle3Base,
          claudeGoldSEBase,
          claudeGoldSWBase,
          claudeGoldNEBase,
          claudeGoldNWBase,
          aiSilverIdleBase,
          aiSilverStepLeftBase,
          aiSilverStepRightBase,
          aiSilverSideIdleBase,
          aiSilverSideStep1Base,
          aiSilverSideStep2Base,
          aiSilverBackIdleBase,
          aiSilverBackStep1Base,
          aiSilverBackStep2Base,
          aiSilverIdle0Base,
          aiSilverIdle1Base,
          aiSilverIdle2Base,
          aiSilverIdle3Base,
          aiCopperIdleBase,
          aiCopperStepLeftBase,
          aiCopperStepRightBase,
          aiCopperSideIdleBase,
          aiCopperSideStep1Base,
          aiCopperSideStep2Base,
          aiCopperBackIdleBase,
          aiCopperBackStep1Base,
          aiCopperBackStep2Base,
          aiCopperIdle0Base,
        ] = (await Promise.all([
          Assets.load("/sprites/characters/default.png"),
          Assets.load("/sprites/characters/default_typing.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/default_typing_eyeleft.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/user.png").catch(() => null),
          Assets.load("/sprites/characters/PEDRO/rotations/south.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/cyborg.png").catch(() => null),
          Assets.load("/sprites/characters/chrome_dummy.png").catch(() => null),
          Assets.load("/sprites/characters/default_step_left.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/default_step_right.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/default_side_idle.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/default_side_step1.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/default_side_step2.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/default_back_idle.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/default_back_step1.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/default_back_step2.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/chrome_dummy_step_left.png?v=3").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/chrome_dummy_step_right.png?v=3").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/chrome_dummy_side_idle.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/chrome_dummy_side_step1.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/chrome_dummy_side_step2.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/chrome_dummy_back_idle.png").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/chrome_dummy_back_step1.png?v=3").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/chrome_dummy_back_step2.png?v=3").catch(
            () => null,
          ),
          Assets.load("/sprites/characters/AI_GOLD_HELMET/rotations/south.png").catch(
            () => null,
          ),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/animations/walk-v3/SOUTH/frame_001.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/animations/walk-v3/SOUTH/frame_004.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/animations/walk-v3/EAST/frame_000.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/animations/walk-v3/EAST/frame_001.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/animations/walk-v3/EAST/frame_004.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/animations/walk-v3/NORTH/frame_000.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/animations/walk-v3/NORTH/frame_001.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/animations/walk-v3/NORTH/frame_004.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/animations/idle/SOUTH/frame_000.png",
          ).catch(() => null),
          // Idle do Claudius é estático: 1 frame. Os outros 3 do gerador eram
          // quase idênticos e causavam tremidinha. Slots mantidos pra não
          // quebrar o destructuring posicional do Promise.all abaixo.
          Promise.resolve(null),
          Promise.resolve(null),
          Promise.resolve(null),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/rotations/south-east.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/rotations/south-west.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/rotations/north-east.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_GOLD_HELMET/rotations/north-west.png",
          ).catch(() => null),
          Assets.load("/sprites/characters/AI_SILVER/rotations/south.png").catch(
            () => null,
          ),
          Assets.load(
            "/sprites/characters/AI_SILVER/animations/walk-v3/SOUTH/frame_001.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_SILVER/animations/walk-v3/SOUTH/frame_004.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_SILVER/animations/walk-v3/WEST/frame_000.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_SILVER/animations/walk-v3/WEST/frame_001.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_SILVER/animations/walk-v3/WEST/frame_004.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_SILVER/animations/walk-v3/NORTH/frame_000.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_SILVER/animations/walk-v3/NORTH/frame_001.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_SILVER/animations/walk-v3/NORTH/frame_004.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_SILVER/animations/idle/SOUTH/frame_000.png",
          ).catch(() => null),
          // Idle do agente é estático: 1 frame. Mesmo motivo do Claudius —
          // os outros 3 do gerador eram quase idênticos e causavam tremidinha.
          Promise.resolve(null),
          Promise.resolve(null),
          Promise.resolve(null),
          // ── AI_COPPER (terminais Claude externos — irmão cobre do AI_SILVER) ──
          Assets.load("/sprites/characters/AI_COPPER/rotations/south.png").catch(
            () => null,
          ),
          Assets.load(
            "/sprites/characters/AI_COPPER/animations/walk-v3/SOUTH/frame_001.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_COPPER/animations/walk-v3/SOUTH/frame_004.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_COPPER/animations/walk-v3/WEST/frame_000.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_COPPER/animations/walk-v3/WEST/frame_001.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_COPPER/animations/walk-v3/WEST/frame_004.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_COPPER/animations/walk-v3/NORTH/frame_000.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_COPPER/animations/walk-v3/NORTH/frame_001.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_COPPER/animations/walk-v3/NORTH/frame_004.png",
          ).catch(() => null),
          Assets.load(
            "/sprites/characters/AI_COPPER/animations/idle/SOUTH/frame_000.png",
          ).catch(() => null),
        ])) as [
          Texture,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          // +10 pro AI_COPPER (idle + 8 walk + idleFrame0)
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
          Texture | null,
        ];

        idleBase.source.scaleMode = "nearest";
        let typing: Texture | null = null;
        if (typingBase) {
          typingBase.source.scaleMode = "nearest";
          typing = typingBase;
        }
        let typingEyeLeft: Texture | null = null;
        if (eyeLeftBase) {
          eyeLeftBase.source.scaleMode = "nearest";
          typingEyeLeft = eyeLeftBase;
        }
        let user: Texture | null = null;
        if (userBase) {
          userBase.source.scaleMode = "nearest";
          user = userBase;
        }
        let userSuit: Texture | null = null;
        if (userSuitBase) {
          userSuitBase.source.scaleMode = "nearest";
          userSuit = userSuitBase;
        }
        let cyborg: Texture | null = null;
        if (cyborgBase) {
          cyborgBase.source.scaleMode = "nearest";
          cyborg = cyborgBase;
        }
        let chromeDummy: Texture | null = null;
        if (chromeDummyBase) {
          chromeDummyBase.source.scaleMode = "nearest";
          chromeDummy = chromeDummyBase;
        }
        let stepLeft: Texture | null = null;
        if (stepLeftBase) {
          stepLeftBase.source.scaleMode = "nearest";
          stepLeft = stepLeftBase;
        }
        let stepRight: Texture | null = null;
        if (stepRightBase) {
          stepRightBase.source.scaleMode = "nearest";
          stepRight = stepRightBase;
        }
        let sideIdle: Texture | null = null;
        if (sideIdleBase) {
          sideIdleBase.source.scaleMode = "nearest";
          sideIdle = sideIdleBase;
        }
        let sideStep1: Texture | null = null;
        if (sideStep1Base) {
          sideStep1Base.source.scaleMode = "nearest";
          sideStep1 = sideStep1Base;
        }
        let sideStep2: Texture | null = null;
        if (sideStep2Base) {
          sideStep2Base.source.scaleMode = "nearest";
          sideStep2 = sideStep2Base;
        }
        let backIdle: Texture | null = null;
        if (backIdleBase) {
          backIdleBase.source.scaleMode = "nearest";
          backIdle = backIdleBase;
        }
        let backStep1: Texture | null = null;
        if (backStep1Base) {
          backStep1Base.source.scaleMode = "nearest";
          backStep1 = backStep1Base;
        }
        let backStep2: Texture | null = null;
        if (backStep2Base) {
          backStep2Base.source.scaleMode = "nearest";
          backStep2 = backStep2Base;
        }
        const assignNearest = (t: Texture | null): Texture | null => {
          if (t) t.source.scaleMode = "nearest";
          return t;
        };
        const chromeDummyStepLeft = assignNearest(chromeStepLeftBase);
        const chromeDummyStepRight = assignNearest(chromeStepRightBase);
        const chromeDummySideIdle = assignNearest(chromeSideIdleBase);
        const chromeDummySideStep1 = assignNearest(chromeSideStep1Base);
        const chromeDummySideStep2 = assignNearest(chromeSideStep2Base);
        const chromeDummyBackIdle = assignNearest(chromeBackIdleBase);
        const chromeDummyBackStep1 = assignNearest(chromeBackStep1Base);
        const chromeDummyBackStep2 = assignNearest(chromeBackStep2Base);
        const claudeGoldIdle = assignNearest(claudeGoldIdleBase);
        const claudeGoldStepLeft = assignNearest(claudeGoldStepLeftBase);
        const claudeGoldStepRight = assignNearest(claudeGoldStepRightBase);
        const claudeGoldSideIdle = assignNearest(claudeGoldSideIdleBase);
        const claudeGoldSideStep1 = assignNearest(claudeGoldSideStep1Base);
        const claudeGoldSideStep2 = assignNearest(claudeGoldSideStep2Base);
        const claudeGoldBackIdle = assignNearest(claudeGoldBackIdleBase);
        const claudeGoldBackStep1 = assignNearest(claudeGoldBackStep1Base);
        const claudeGoldBackStep2 = assignNearest(claudeGoldBackStep2Base);
        const claudeGoldIdleFrames = [
          assignNearest(claudeGoldIdle0Base),
          assignNearest(claudeGoldIdle1Base),
          assignNearest(claudeGoldIdle2Base),
          assignNearest(claudeGoldIdle3Base),
        ];
        const claudeGoldSEIdle = assignNearest(claudeGoldSEBase);
        const claudeGoldSWIdle = assignNearest(claudeGoldSWBase);
        const claudeGoldNEIdle = assignNearest(claudeGoldNEBase);
        const claudeGoldNWIdle = assignNearest(claudeGoldNWBase);
        const aiSilverIdle = assignNearest(aiSilverIdleBase);
        const aiSilverStepLeft = assignNearest(aiSilverStepLeftBase);
        const aiSilverStepRight = assignNearest(aiSilverStepRightBase);
        const aiSilverSideIdle = assignNearest(aiSilverSideIdleBase);
        const aiSilverSideStep1 = assignNearest(aiSilverSideStep1Base);
        const aiSilverSideStep2 = assignNearest(aiSilverSideStep2Base);
        const aiSilverBackIdle = assignNearest(aiSilverBackIdleBase);
        const aiSilverBackStep1 = assignNearest(aiSilverBackStep1Base);
        const aiSilverBackStep2 = assignNearest(aiSilverBackStep2Base);
        const aiSilverIdleFrames = [
          assignNearest(aiSilverIdle0Base),
          assignNearest(aiSilverIdle1Base),
          assignNearest(aiSilverIdle2Base),
          assignNearest(aiSilverIdle3Base),
        ];
        const aiCopperIdle = assignNearest(aiCopperIdleBase);
        const aiCopperStepLeft = assignNearest(aiCopperStepLeftBase);
        const aiCopperStepRight = assignNearest(aiCopperStepRightBase);
        const aiCopperSideIdle = assignNearest(aiCopperSideIdleBase);
        const aiCopperSideStep1 = assignNearest(aiCopperSideStep1Base);
        const aiCopperSideStep2 = assignNearest(aiCopperSideStep2Base);
        const aiCopperBackIdle = assignNearest(aiCopperBackIdleBase);
        const aiCopperBackStep1 = assignNearest(aiCopperBackStep1Base);
        const aiCopperBackStep2 = assignNearest(aiCopperBackStep2Base);
        // Idle estático: 1 frame só (mesmo motivo do silver).
        const aiCopperIdleFrames = [assignNearest(aiCopperIdle0Base)];

        if (!cancelled)
          setTextures({
            idle: idleBase,
            typing,
            typingEyeLeft,
            user,
            userSuit,
            cyborg,
            chromeDummy,
            stepLeft,
            stepRight,
            sideIdle,
            sideStep1,
            sideStep2,
            backIdle,
            backStep1,
            backStep2,
            chromeDummyStepLeft,
            chromeDummyStepRight,
            chromeDummySideIdle,
            chromeDummySideStep1,
            chromeDummySideStep2,
            chromeDummyBackIdle,
            chromeDummyBackStep1,
            chromeDummyBackStep2,
            claudeGoldIdle,
            claudeGoldStepLeft,
            claudeGoldStepRight,
            claudeGoldSideIdle,
            claudeGoldSideStep1,
            claudeGoldSideStep2,
            claudeGoldBackIdle,
            claudeGoldBackStep1,
            claudeGoldBackStep2,
            claudeGoldIdleFrames,
            claudeGoldSEIdle,
            claudeGoldSWIdle,
            claudeGoldNEIdle,
            claudeGoldNWIdle,
            aiSilverIdle,
            aiSilverStepLeft,
            aiSilverStepRight,
            aiSilverSideIdle,
            aiSilverSideStep1,
            aiSilverSideStep2,
            aiSilverBackIdle,
            aiSilverBackStep1,
            aiSilverBackStep2,
            aiSilverIdleFrames,
            aiCopperIdle,
            aiCopperStepLeft,
            aiCopperStepRight,
            aiCopperSideIdle,
            aiCopperSideStep1,
            aiCopperSideStep2,
            aiCopperBackIdle,
            aiCopperBackStep1,
            aiCopperBackStep2,
            aiCopperIdleFrames,
          });
      } catch {
        // ignore — fallback to chibi
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return textures;
}

export function pickCharacterSheet(seed: string): SheetName {
  let hash = 0;
  for (let i = 0; i < seed.length; i++)
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return SHEET_NAMES[Math.abs(hash) % SHEET_NAMES.length];
}

export { SHEET_NAMES };
export type { SheetName };
