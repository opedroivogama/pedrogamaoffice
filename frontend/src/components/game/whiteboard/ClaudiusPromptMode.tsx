"use client";

/**
 * ClaudiusPromptMode - Mode 12: prompt ativo do Claudius como ticker grande.
 *
 * Substitui o leitor verde que ficava na mesa do Claudius. Mostra o
 * `boss.currentTask` (último prompt do Pedro) rolando como ticker estilo
 * terminal, com header "PROMPT" e barra de status. Quando não há prompt,
 * exibe placeholder informando que o Claudius está ocioso.
 */

import type { Graphics } from "pixi.js";
import { useCallback, type ReactNode } from "react";
import { useGameStore } from "@/stores/gameStore";
import { MarqueeText } from "../MarqueeText";

const PANEL_WIDTH = 290;

export function ClaudiusPromptMode(): ReactNode {
  const bossTask = useGameStore((s) => s.boss.currentTask);
  const bossState = useGameStore((s) => s.boss.backendState);

  const drawTerminalBg = useCallback((g: Graphics) => {
    g.clear();
    // Moldura escura do "terminal"
    g.roundRect(20, 10, PANEL_WIDTH, 110, 4);
    g.fill({ color: 0x0a0f0a, alpha: 0.95 });
    g.stroke({ width: 1, color: 0x1f3d1f });
    // LED indicator (verde se tem prompt, vermelho/escuro se idle)
    g.circle(34, 24, 3);
    g.fill(bossTask ? 0x22ff66 : 0x553030);
  }, [bossTask]);

  return (
    <pixiContainer>
      <pixiGraphics draw={drawTerminalBg} />

      {/* Header label */}
      <pixiContainer x={165} y={24} scale={0.5}>
        <pixiText
          text="◤ CLAUDIUS // PROMPT ATIVO ◢"
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 18,
            fontWeight: "bold",
            fill: "#00ff88",
          }}
          resolution={2}
        />
      </pixiContainer>

      {/* Ticker do prompt (rola se for grande) */}
      {bossTask ? (
        <pixiContainer x={165} y={60}>
          <MarqueeText text={`> ${bossTask}`} width={PANEL_WIDTH - 24} color="#7CFFB2" />
        </pixiContainer>
      ) : (
        <pixiContainer x={165} y={60} scale={0.5}>
          <pixiText
            text="— sem prompt ativo —"
            anchor={0.5}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 20,
              fill: "#3a5a3a",
              fontStyle: "italic",
            }}
            resolution={2}
          />
        </pixiContainer>
      )}

      {/* Status line */}
      <pixiContainer x={165} y={100} scale={0.5}>
        <pixiText
          text={`STATE: ${bossState.toUpperCase()}`}
          anchor={0.5}
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 16,
            fill: "#5fa97a",
          }}
          resolution={2}
        />
      </pixiContainer>
    </pixiContainer>
  );
}
