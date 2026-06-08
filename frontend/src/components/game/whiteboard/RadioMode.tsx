"use client";

/**
 * RadioMode — Mode 13: mostra no quadro a faixa que tá tocando no rádio.
 *
 * Lê do `radioStore` (alimentado pelo AmbientRadio): título da faixa,
 * posição na playlist, status playing/paused. Sem iframe — o vídeo
 * real fica no modal do rádio; aqui é só um display estilo "LCD" com
 * título marquee, contagem da playlist e ondinhas de áudio animadas
 * quando tocando.
 */

import type { Graphics } from "pixi.js";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRadioStore } from "@/stores/radioStore";
import { MarqueeText } from "../MarqueeText";

const PANEL_WIDTH = 290;
const BAR_COUNT = 12;

export function RadioMode(): ReactNode {
  const isPlaying = useRadioStore((s) => s.isPlaying);
  const title = useRadioStore((s) => s.currentTitle);
  const index = useRadioStore((s) => s.currentIndex);
  const length = useRadioStore((s) => s.playlist.length);

  // Tick pra animar as barrinhas de áudio quando playing.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isPlaying) return;
    let raf: number;
    let start = performance.now();
    const loop = (now: number) => {
      setTick((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const drawPanelBg = useCallback((g: Graphics) => {
    g.clear();
    // Moldura escura tipo LCD
    g.roundRect(20, 10, PANEL_WIDTH, 110, 4);
    g.fill({ color: 0x0a0a14, alpha: 0.95 });
    g.stroke({ width: 1, color: 0x2a2438 });
    // LED indicator (dourado fosco quando playing, vermelho-escuro quando paused)
    g.circle(34, 24, 3);
    g.fill(isPlaying ? 0xb8972a : 0x553030);
  }, [isPlaying]);

  // Barrinhas de áudio fake — senoides defasadas, congeladas quando paused.
  const drawWaves = useCallback((g: Graphics) => {
    g.clear();
    const baseY = 95;
    const barWidth = 8;
    const gap = 4;
    const totalWidth = BAR_COUNT * barWidth + (BAR_COUNT - 1) * gap;
    const startX = (PANEL_WIDTH + 40 - totalWidth) / 2;
    for (let i = 0; i < BAR_COUNT; i++) {
      const phase = tick * 4 + i * 0.6;
      const h = isPlaying
        ? 4 + Math.abs(Math.sin(phase)) * 18
        : 4;
      g.roundRect(startX + i * (barWidth + gap), baseY - h / 2, barWidth, h, 1);
      g.fill({ color: 0xb8972a, alpha: isPlaying ? 0.85 : 0.25 });
    }
  }, [tick, isPlaying]);

  const hasTrack = length > 0 && title.length > 0;
  const statusLabel = isPlaying ? "▶ TOCANDO" : "❚❚ PAUSADO";
  const counterLabel = hasTrack ? `${index + 1} / ${length}` : "—";

  return (
    <pixiContainer>
      <pixiGraphics draw={drawPanelBg} />

      {/* Header */}
      <pixiContainer x={165} y={24} scale={0.5}>
        <pixiText
          text="◤ RÁDIO // TOCANDO AGORA ◢"
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 18,
            fontWeight: "bold",
            fill: "#B8972A",
          }}
          resolution={2}
        />
      </pixiContainer>

      {/* Título marquee */}
      {hasTrack ? (
        <pixiContainer x={165} y={56}>
          <MarqueeText
            text={title}
            width={PANEL_WIDTH - 24}
            color="#F5DEB3"
          />
        </pixiContainer>
      ) : (
        <pixiContainer x={165} y={56} scale={0.5}>
          <pixiText
            text="— playlist vazia —"
            anchor={0.5}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 20,
              fill: "#5a4a30",
              fontStyle: "italic",
            }}
            resolution={2}
          />
        </pixiContainer>
      )}

      {/* Counter + status numa linha só */}
      <pixiContainer x={50} y={75} scale={0.5}>
        <pixiText
          text={counterLabel}
          anchor={{ x: 0, y: 0.5 }}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 16,
            fill: "#8a7a4a",
          }}
          resolution={2}
        />
      </pixiContainer>

      <pixiContainer x={280} y={75} scale={0.5}>
        <pixiText
          text={statusLabel}
          anchor={{ x: 1, y: 0.5 }}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 16,
            fill: isPlaying ? "#d4af37" : "#6a5a3a",
            fontWeight: "bold",
          }}
          resolution={2}
        />
      </pixiContainer>

      {/* Waveform */}
      <pixiGraphics draw={drawWaves} />
    </pixiContainer>
  );
}
