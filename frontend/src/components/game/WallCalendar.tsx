"use client";

import { Graphics, type Texture } from "pixi.js";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useCalendarModalStore } from "@/stores/calendarModalStore";

// Dimensões alvo. Procedural usa 120x155 (aspect 0.77). Sprite tem aspect 0.706,
// então com width=120 a altura natural fica 170 (15px mais alto).
const FRAME_WIDTH = 120;
const FRAME_HEIGHT_PROCEDURAL = 155;
const FRAME_HEIGHT_SPRITE = 170;

/**
 * WallCalendar — poster de parede no estilo "page-a-day", drop-in pro
 * EmployeeOfTheMonth (mesmo retângulo 120x155). Header dourado mostra o mês
 * corrente, miolo mostra o número do dia gigante + dia da semana, base mostra
 * "AGENDA". Click abre o `CalendarModal` com o Google Calendar embarcado.
 */

const MONTHS_PT = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

const WEEKDAYS_PT = [
  "DOMINGO",
  "SEGUNDA",
  "TERÇA",
  "QUARTA",
  "QUINTA",
  "SEXTA",
  "SÁBADO",
];

interface WallCalendarProps {
  /** Quando presente, substitui a moldura procedural. Texto continua sendo
   *  desenhado por código, mas posicionado pras placas do sprite. */
  frameTexture?: Texture | null;
}

export function WallCalendar({ frameTexture }: WallCalendarProps = {}): ReactNode {
  const open = useCalendarModalStore((s) => s.open);
  const useSprite = !!frameTexture;
  const height = useSprite ? FRAME_HEIGHT_SPRITE : FRAME_HEIGHT_PROCEDURAL;
  // Recompõe a cada minuto pra virar o dia sem reload.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const day = now.getDate();
  const month = MONTHS_PT[now.getMonth()] ?? "";
  const year = now.getFullYear();
  const weekday = WEEKDAYS_PT[now.getDay()] ?? "";

  const drawFrame = useCallback((g: Graphics) => {
    g.clear();

    // ----- Sombra densa em camadas (estilo Whiteboard/sprites) -----
    g.roundRect(7, 7, 120, 155, 5);
    g.fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(5, 5, 120, 155, 5);
    g.fill({ color: 0x000000, alpha: 0.25 });

    // ----- Moldura externa chanfrada: dark → mid → light → cream -----
    // Camada escura (borda mais externa)
    g.roundRect(0, 0, 120, 155, 5);
    g.fill(0x3a2d18);
    // Camada mid-tone (faixa marrom 2px pra dentro)
    g.roundRect(2, 2, 116, 151, 4);
    g.fill(0x8b7355);
    // Highlight superior/esquerdo (cantos claros pra dar relevo)
    g.roundRect(3, 3, 114, 1, 1);
    g.fill(0xc4a875);
    g.roundRect(3, 3, 1, 149, 1);
    g.fill(0xc4a875);
    // Interior cream (papel)
    g.roundRect(4, 4, 112, 147, 3);
    g.fill(0xf5f0e6);

    // ----- Header dourado com profundidade -----
    // Sombra inferior do header (cria sensação de pestana)
    g.rect(8, 32, 104, 2);
    g.fill({ color: 0x000000, alpha: 0.4 });
    // Corpo do header
    g.rect(8, 8, 104, 24);
    g.fill(0xb8972a); // JP Gold Primary
    // Highlight superior (faixa 1px mais clara)
    g.rect(8, 8, 104, 2);
    g.fill(0xdaa520);
    // Linha de sombra inferior dentro do header
    g.rect(8, 30, 104, 2);
    g.fill(0x8b6f1f);
    // Stroke fino escuro pra fechar
    g.rect(8, 8, 104, 24);
    g.stroke({ width: 1, color: 0x6a5414 });

    // Binding rings (furos do espiral) — dois círculos escuros na faixa
    // cream acima do header (y=4..8), simulando espiral metálico.
    g.circle(40, 6, 2);
    g.fill(0x2a2a2a);
    g.circle(80, 6, 2);
    g.fill(0x2a2a2a);
    // Brilho metálico nos furos
    g.circle(39.5, 5.5, 0.7);
    g.fill(0xbababa);
    g.circle(79.5, 5.5, 0.7);
    g.fill(0xbababa);

    // ----- Página do dia (área escura) com moldura embutida -----
    // Sombra externa da página (rebaixada na parede do poster)
    g.rect(14, 41, 92, 92);
    g.fill(0x2a2a2a);
    // Página interna
    g.rect(15, 42, 90, 90);
    g.fill(0x141414);
    // Highlight superior interno (1px) — sugere borda chanfrada interna
    g.rect(15, 42, 90, 1);
    g.fill(0x000000);
    // Vinheta clara no centro pra destacar o número (radial-ish via dois rects)
    g.rect(25, 55, 70, 60);
    g.fill({ color: 0xffd700, alpha: 0.03 });
    // Stroke dourado da borda da página
    g.rect(15, 42, 90, 90);
    g.stroke({ width: 2, color: 0xdaa520 });

    // ----- Faixa vermelha no topo da página (calendário de mesa) -----
    g.rect(15, 42, 90, 7);
    g.fill(0xc23030);
    // Highlight da faixa vermelha (1px no topo)
    g.rect(15, 42, 90, 1);
    g.fill(0xe04a4a);
    // Sombra inferior da faixa
    g.rect(15, 48, 90, 1);
    g.fill(0x7a1818);

    // ----- Plate inferior dourado ("AGENDA") com profundidade -----
    // Sombra superior do plate (separa da página)
    g.rect(8, 137, 104, 2);
    g.fill({ color: 0x000000, alpha: 0.4 });
    g.rect(8, 139, 104, 12);
    g.fill(0xdaa520);
    // Highlight superior do plate
    g.rect(8, 139, 104, 1);
    g.fill(0xf2c84b);
    // Sombra inferior interna
    g.rect(8, 150, 104, 1);
    g.fill(0xa67e16);

    // ----- Cantos decorativos dourados na página (mantém + reforça) -----
    const cornerSize = 9;
    // Top-left
    g.moveTo(15, 42 + cornerSize);
    g.lineTo(15, 42);
    g.lineTo(15 + cornerSize, 42);
    g.stroke({ width: 2, color: 0xffd700 });
    // Top-right
    g.moveTo(105 - cornerSize, 42);
    g.lineTo(105, 42);
    g.lineTo(105, 42 + cornerSize);
    g.stroke({ width: 2, color: 0xffd700 });
    // Bottom-left
    g.moveTo(15, 132 - cornerSize);
    g.lineTo(15, 132);
    g.lineTo(15 + cornerSize, 132);
    g.stroke({ width: 2, color: 0xffd700 });
    // Bottom-right
    g.moveTo(105 - cornerSize, 132);
    g.lineTo(105, 132);
    g.lineTo(105, 132 - cornerSize);
    g.stroke({ width: 2, color: 0xffd700 });
  }, []);

  // Overlay invisível cobrindo o poster inteiro. Usa alpha 0.001 em vez de 0
  // — alpha 0 não conta como hit no PIXI v8, mas alpha mínimo sim.
  const drawHitArea = useCallback((g: Graphics) => {
    g.clear();
    g.rect(0, 0, FRAME_WIDTH, height);
    g.fill({ color: 0x000000, alpha: 0.001 });
  }, [height]);

  // Posições Y dos textos. Procedural (120x155): mantidas como antes.
  // Sprite (120x170): recalibradas pras placas do PNG novo —
  //   placa superior centro ≈y=27, painel preto centro ≈y=94,
  //   placa inferior centro ≈y=154.
  const yMonth = useSprite ? 20 : 14;
  const yYear = useSprite ? 31 : 34;
  const yDay = useSprite ? 84 : 88;
  const yWeekday = useSprite ? 115 : 122;
  const yAgenda = useSprite ? 144 : 144;

  return (
    <pixiContainer eventMode="static" cursor="pointer" onPointerDown={open}>
      {useSprite ? (
        <pixiSprite
          texture={frameTexture!}
          x={0}
          y={0}
          width={FRAME_WIDTH}
          height={FRAME_HEIGHT_SPRITE}
        />
      ) : (
        <pixiGraphics draw={drawFrame} />
      )}

      {/* Header — mês + ano */}
      <pixiContainer x={60} y={yMonth} scale={0.5}>
        <pixiText
          text={month}
          anchor={0.5}
          style={{
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: 22,
            fontWeight: "bold",
            fill: "#1a1a1a",
            dropShadow: {
              color: "#ffffff",
              blur: 0,
              distance: 1,
              angle: Math.PI / 4,
              alpha: 0.4,
            },
          }}
          resolution={2}
        />
      </pixiContainer>
      <pixiContainer x={60} y={yYear} scale={0.5}>
        <pixiText
          text={String(year)}
          anchor={0.5}
          style={{
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: 14,
            fontWeight: "bold",
            fill: "#1a1a1a",
          }}
          resolution={2}
        />
      </pixiContainer>

      {/* Dia gigante no centro da "página" */}
      <pixiContainer x={60} y={yDay} scale={0.5}>
        <pixiText
          text={String(day).padStart(2, "0")}
          anchor={0.5}
          style={{
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: 72,
            fontWeight: "bold",
            fill: "#ffd700",
            stroke: { color: "#5a4410", width: 4, join: "round" },
            dropShadow: {
              color: "#000000",
              blur: 2,
              distance: 3,
              angle: Math.PI / 4,
              alpha: 0.8,
            },
          }}
          resolution={2}
        />
      </pixiContainer>

      {/* Dia da semana abaixo do número */}
      <pixiContainer x={60} y={yWeekday} scale={0.5}>
        <pixiText
          text={weekday}
          anchor={0.5}
          style={{
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: 15,
            fontWeight: "bold",
            fill: "#daa520",
          }}
          resolution={2}
        />
      </pixiContainer>

      {/* Name plate — equivalente ao "CLAUDINHO" do poster original */}
      <pixiContainer x={60} y={yAgenda} scale={0.5}>
        <pixiText
          text="AGENDA"
          anchor={0.5}
          style={{
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: 20,
            fontWeight: "bold",
            fill: "#1a1a1a",
          }}
          resolution={2}
        />
      </pixiContainer>

      {/* Overlay de hit — alpha 0.001 (invisível pro olho, visível pro PIXI). */}
      <pixiGraphics draw={drawHitArea} />
    </pixiContainer>
  );
}
