---
name: pixellab-character
description: >
  Generate a full chibi pixel art character for the Jurídico Pro painel (escritorio online)
  via the PixelLab MCP — rotations in 8 directions + 8-direction walk cycles (v3 mode) +
  breathing-idle. Auto-curates frames, deploys to `frontend/public/sprites/characters/<NAME>/`,
  saves backup + manifest in `sprites-pipeline/<NAME>/` inside the project (NEVER on Desktop).
  Wires into useCharacterSprites + WanderingBoss/BossSprite
  on request. Distinct from the upstream `character-sprite` skill that uses Nano Banana.
triggers:
  - novo personagem pixellab
  - criar character pixellab
  - sprite chibi pixellab
  - new pixellab character
  - generate character idle and walks via pixellab
  - claude office pixellab sprite
---

# PixelLab Character Generator (Jurídico Pro painel)

End-to-end workflow that produces a game-ready chibi character (matching Pedro's art style)
using PixelLab MCP, then deploys the curated sprites into the `escritorio online` project.

## When to use

- User wants a new character (boss, agent, NPC) in the painel
- Needs all 8 walk directions + idle (Vision/Pedro style, chibi proportions)
- Wants the sprite uploaded to `frontend/public/sprites/characters/<NAME>/` and ready for `useCharacterSprites.ts`

## Inputs

Ask the user (or infer from context):
- **NAME** (folder slug, UPPERCASE_UNDERSCORE, e.g. `AI_GOLD`, `LAURA_RECEP`)
- **PROMPT** (rich description; mention "chibi pixel art", references like Vision/JARVIS for stylistic anchors, distinguishing features, color palette)
- **Reference** (optional): existing character_id to use as `create_character_state` source (preserves silhouette + pose)

## Art-style invariants

- `mode`: `v3` (highest fidelity, costs 2-9 generations for create + 7/dir for walks)
- `size`: `128` (max — yields canvas ~228-240px depending on prompt)
- `view`: `low top-down` (matches Pedro, default for the game)
- `proportions`: `{"type":"preset","name":"default"}` (chibi — NEVER `heroic` for this game; it produces non-chibi adult that breaks the style)
- `text_guidance_scale`: `12` (bumped from default 8 so detailed prompts are honored)
- For walks: `mode=v3`, `frame_count=8`, `action_description="walking forward with imposing presence, legs visibly stepping alternately, arms swinging at sides, clear stride motion"`
- For idle: `template_animation_id=breathing-idle` (1 generation, 4 frames, south only)

## Process

### 1. Create character

Call `mcp__pixellab__create_character` with the inputs above. Returns `character_id`. Status `processing`, ETA ~3-5 min.

**Variant flow** (alternate face/armor of an existing char): use `mcp__pixellab__create_character_state(character_id=<source>, edit_description="...")` instead — ~30-90s, preserves body and group.

### 2. Wait + preview

Poll `https://backblaze.pixellab.ai/file/pixellab-characters/<owner>/<id>/rotations/south.png` (the owner ID is in any existing manifest; common: `b1d97831-da3e-4ead-9147-f35263438357`). Use Bash `run_in_background` with `until curl -sS -f <url> -o /dev/null; do sleep 30; done`.

When ready, download south.png and `Read` it as image to show the user. **STOP HERE for visual approval** unless user pre-approved.

### 3. Generate walks + idle

Once approved, queue both:
```
mcp__pixellab__animate_character(
  character_id=<id>, mode="v3",
  action_description="walking forward with imposing presence, legs visibly stepping alternately, arms swinging at sides, clear stride motion",
  directions=["south","east","west","north","south-east","south-west","north-east","north-west"],
  frame_count=8, animation_name="walk-v3"
)
mcp__pixellab__animate_character(
  character_id=<id>, template_animation_id="breathing-idle",
  directions=["south"], animation_name="idle-breathing"
)
```

Walks = 64 generations (8 dir × 8 frames produces 9 = 1 ref + 8 animated). Idle = 1 generation.

**PixelLab job-slot cap is 8 concurrent.** If `animate_character` returns `need 1 job slots but only 0 available`, wait for at least one walk to finish before queueing the idle.

ETA: ~5-7 min for walks (parallel but queue throttled), +3 min for idle.

### 4. Wait for completion

The `download` endpoint (`https://api.pixellab.ai/mcp/characters/<id>/download`) gives **false positives** during this flow (returns 200 between jobs). Authoritative source: call `mcp__pixellab__get_character(character_id=<id>)` and check `pending jobs (N):` line. If 0 pending → done.

For polling: use Bash with `run_in_background: true` and `sleep 240 && echo done`. Don't chain short sleeps (blocked by harness).

### 5. Download to backup

Create `escritorio online/sprites-pipeline/<NAME>/` inside the project (NOT on Desktop) with:
- `rotations/` — 8 PNGs (one per direction)
- `animations/walk_<direction>_v3/` — 9 frames per direction (0-8)
- `animations/idle/` — 4 frames (0-3)
- `manifest.json` — character_id, animation_ids, prompt, deploy path, size

If iterating (V2, V3, …), move the previous version to `sprites-pipeline/_old/<NAME> V<N>/` before creating the new one. Stray intermediate PNGs (mobília, cleanup tests, no-halo previews) go in `sprites-pipeline/_mobilia/` — never on the Desktop.

Download URLs follow these patterns:
```
rotations:  /file/pixellab-characters/<owner>/<id>/rotations/<dir>.png
animation:  /file/pixellab-characters/<owner>/<id>/animations/<anim_id>/<dir>/<N>.png
```

Use `curl -sS -o "<path>" "<url>"` in a bash loop. PowerShell `ForEach-Object -Parallel` is NOT available on PS 5.1; use `Start-Job` if needed.

### 6. Curate + deploy

Deploy folder: `escritorio online/frontend/public/sprites/characters/<NAME>/`

Structure mirrors PEDRO:
```
<NAME>/
  rotations/                    ← copy backup/rotations/ as-is
  animations/
    walk-v3/
      SOUTH/   frame_000..005   ← curated cycle
      EAST/    frame_000..005
      ...all 8 directions
    idle/
      SOUTH/   frame_000..003   ← copy idle 0,1,2,3
```

**Curation rule** for walks (use the **same indices** for all directions to keep cycles in sync):
- frame_000 ← source 0 (neutral / reference)
- frame_001 ← source 2 (left foot forward)
- frame_002 ← source 3 (cross / mid-stride)
- frame_003 ← source 4 (neutral)
- frame_004 ← source 7 (right foot forward)
- frame_005 ← source 8 (return to neutral)

This is the bilateral stride that worked for PEDRO and AI_GOLD.

**Folder names**: NEVER use spaces in deploy paths (Vite serves `public/` direct but encoded URLs are clunkier — use `_` separator like `AI_GOLD`, `CLAUDE_GOLD`).

### 7. Wire into code (optional — do only if user asks)

For boss/Claude-like characters:
1. **`frontend/src/hooks/useCharacterSprites.ts`**: Add `<name>Idle`, `<name>StepLeft/Right`, `<name>SideIdle/Step1/Step2`, `<name>BackIdle/Step1/Step2`, and `<name>IdleFrames: Texture[]` to `DefaultCharacterTextures`. Add corresponding `Assets.load(...)` calls and tuple type entries.
2. **`frontend/src/components/game/OfficeGame.tsx`**: Destructure new textures, pass them to `<BossSprite ... characterRenderSize={SIZE} characterIdleFrames={...} />` and `<WanderingBoss textures={...} idleFrames={...} />`.
3. **`characterRenderSize`**: use the actual canvas px from the manifest (PixelLab returns 228 or 240 depending on prompt). Pass dynamic: `characterRenderSize={<name>IdleTexture ? <size> : 128}`.
4. **Side-direction convention**: `WanderingBoss` flips horizontally for `west`, so `sideIdle` must be authored **east-facing** — use `rotations/east.png` or `walk-v3/EAST/frame_000.png`.

For agent/NPC characters (non-boss): different path — they use `AgentSprite` which expects flat PNGs (default/chrome_dummy pattern). Don't auto-wire; ask user for the target hook/component.

## Cost reference

For one full character (1 create + 1 idle + 8 walks):
- create: 3 generations (v3)
- idle: 1 generation (template)
- walks: 64 generations (7/dir × 8)
- **Total: ~68 generations** (~3.4% of a 2000/month Tier 1 plan)

## Gotchas

- **State variants** (`create_character_state`) inherit the source's group. Use them for "same character, different face/armor" (e.g., visor open vs closed) — saves 56 generations vs a fresh `create_character` for the second look.
- **Job-slot cap is 8.** Queue walks before idle, or queue them across two `animate_character` calls.
- **`download` endpoint poll is unreliable.** Trust `get_character` `pending jobs` line, not HTTP 200/423.
- **Background-bash sleep limits.** Harness blocks long leading sleep. Use `run_in_background: true` for waits ≥60s.
- **Helmet/visor edits**: prompt with phrases like "extend the gold helmet downward to fully cover the mouth and chin, forming a closed full-face visor" + `use_color_palette_from_reference: true` to keep colors locked to the source.
- **AI presence requires explicit anti-baby cues** ("sharp adult angular face NOT baby", "imposing posture", references to Vision/JARVIS/Dr Manhattan). Without these the chibi default tends to look infantile.

## Existing reference deployments

These were built with this exact workflow and serve as templates:
- `frontend/public/sprites/characters/PEDRO/` — chibi suit-and-beard human (template Pedro)
- `frontend/public/sprites/characters/CLAUDE_GOLD/` — first AI attempt (bronze, smooth skin) — kept as backup
- `frontend/public/sprites/characters/AI_GOLD/` — current Claude boss (Vision-style gold armor + visor open)
- `frontend/public/sprites/characters/AI_GOLD_HELMET/` — same body with sealed full-face visor

Backup/pipeline source lives in `sprites-pipeline/<NAME>/` inside the project. Historical backups (PEDRO, CLAUDE GOLD, AI GOLD, AI GOLD HELMET) were originally on the Desktop but have been consolidated under `sprites-pipeline/_old/` during the 2026-06-06 cleanup.
