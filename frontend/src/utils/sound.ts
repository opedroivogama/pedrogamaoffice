"use client";

// ============================================================================
// SOUND — bipe sintético via Web Audio (sem arquivo .mp3 no bundle)
// ============================================================================
//
// Usado por attentionStore.processEvent pra alertar o Pedro quando um terminal
// pede resposta (permission_request, notification). Dois tons agudos curtos
// em sequência — distintivo o suficiente pra furar o ambiente, mas curto pra
// não irritar quando bipa várias vezes seguidas.
//
// Web Audio é lazy: AudioContext só nasce no primeiro `playAttentionBeep()`
// (precisa de gesto do usuário pra não tropeçar na política do browser; o
// primeiro clique no painel destrava). Se o browser bloquear (resume()
// rejeitado), o util só engole — não quebra a UI.

type BeepStyle = "alert" | "soft";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    return null;
  }
  return audioCtx;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  durationMs: number,
  gain = 0.18,
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const start = ctx.currentTime + startAt;
  const end = start + durationMs / 1000;
  // Envelope ADSR mínimo pra não dar clique no início/fim
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + 0.01);
  env.gain.linearRampToValueAtTime(0, end);
  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

export function playAttentionBeep(style: BeepStyle = "alert"): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
  if (style === "alert") {
    // Dois tons crescentes — sino curto chamativo
    playTone(ctx, 880, 0, 120);
    playTone(ctx, 1175, 0.16, 160);
  } else {
    // Um tom único, mais suave
    playTone(ctx, 660, 0, 130, 0.12);
  }
}
