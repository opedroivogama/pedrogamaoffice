"use client";

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useGameStore } from "@/stores/gameStore";
import { useRadioStore } from "@/stores/radioStore";
import { WHITEBOARD_POSITION } from "@/constants/positions";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";

/**
 * RadioVideoTV — slot HTML que vira a "tela" do quadro no modo RADIO (13).
 *
 * Registra um slot de prioridade alta (`tv`) no `radioStore`; o
 * `AmbientRadioPlayer` singleton move o iframe único pra dentro desse slot.
 * Quando o modo RADIO desativa, o slot é desregistrado e o iframe volta
 * pro próximo slot disponível (modal > sidebar > host invisível).
 *
 * Posicionamento (position:fixed + getBoundingClientRect do canvas):
 * acompanha pan/zoom do TransformWrapper. Renderizado FORA do
 * TransformWrapper pra evitar dupla transformação.
 *
 * Wheel/click: redirect pra TransformWrapper / cycle do whiteboard mode.
 */

const TV_OFFSET_X = 12;
const TV_OFFSET_Y = 42;
const TV_WIDTH_CANVAS = 306;
const TV_HEIGHT_CANVAS = 145;

interface CanvasGeom {
  left: number;
  top: number;
  width: number;
  height: number;
}

function useCanvasGeom(active: boolean): CanvasGeom | null {
  const [geom, setGeom] = useState<CanvasGeom | null>(null);

  useEffect(() => {
    if (!active) {
      setGeom(null);
      return;
    }

    let raf = 0;
    let stopped = false;
    let canvas: HTMLCanvasElement | null = null;
    let ro: ResizeObserver | null = null;

    const measure = () => {
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      setGeom((prev) => {
        if (
          prev &&
          prev.left === r.left &&
          prev.top === r.top &&
          prev.width === r.width &&
          prev.height === r.height
        ) {
          return prev;
        }
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });
    };

    const tick = () => {
      if (stopped) return;
      measure();
      raf = requestAnimationFrame(tick);
    };

    const attach = () => {
      if (stopped) return;
      canvas = document.querySelector(
        ".pixi-canvas-container canvas",
      ) as HTMLCanvasElement | null;
      if (!canvas) {
        raf = requestAnimationFrame(attach);
        return;
      }
      ro = new ResizeObserver(measure);
      ro.observe(canvas);
      measure();
      raf = requestAnimationFrame(tick);
    };

    attach();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active]);

  return geom;
}

export function RadioVideoTV(): ReactNode {
  const whiteboardMode = useGameStore((s) => s.whiteboardMode);
  const cycleMode = useGameStore((s) => s.cycleWhiteboardMode);
  const videoId = useRadioStore((s) =>
    s.playlist[s.currentIndex]?.id ?? null,
  );
  const registerSlot = useRadioStore((s) => s.registerSlot);
  const unregisterSlot = useRadioStore((s) => s.unregisterSlot);
  const active = whiteboardMode === 13 && !!videoId;
  const geom = useCanvasGeom(active);
  const slotId = useId();
  const slotElRef = useRef<HTMLDivElement | null>(null);

  // Callback ref: registra/desregistra quando o div entra/sai do DOM.
  // useEffect normal não funciona aqui porque o div só renderiza depois
  // de `active+geom`, e o effect roda antes do ref estar pronto.
  const slotRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      if (slotElRef.current && slotElRef.current !== el) {
        unregisterSlot(slotId);
      }
      slotElRef.current = el;
      if (el) {
        registerSlot(slotId, { kind: "tv", element: el });
      }
    },
    [slotId, registerSlot, unregisterSlot],
  );

  // Cleanup quando o componente desmonta.
  useEffect(() => {
    return () => {
      if (slotElRef.current) {
        unregisterSlot(slotId);
        slotElRef.current = null;
      }
    };
  }, [slotId, unregisterSlot]);

  const handleWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const tw = document.querySelector(
      ".react-transform-component",
    ) as HTMLElement | null;
    if (!tw) return;
    tw.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        clientX: e.clientX,
        clientY: e.clientY,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, []);

  const downPos = useRef<{ x: number; y: number } | null>(null);
  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    downPos.current = { x: e.clientX, y: e.clientY };
  }, []);
  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = downPos.current;
      downPos.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < 5) cycleMode();
    },
    [cycleMode],
  );

  if (!active || !geom) return null;

  const scaleX = geom.width / CANVAS_WIDTH;
  const scaleY = geom.height / CANVAS_HEIGHT;
  const left = geom.left + (WHITEBOARD_POSITION.x + TV_OFFSET_X) * scaleX;
  const top = geom.top + (WHITEBOARD_POSITION.y + TV_OFFSET_Y) * scaleY;
  const width = TV_WIDTH_CANVAS * scaleX;
  const height = TV_HEIGHT_CANVAS * scaleY;

  return (
    <div
      ref={slotRefCallback}
      id="radio-tv-slot"
      aria-hidden
      style={{
        position: "fixed",
        left,
        top,
        width,
        height,
        backgroundColor: "#000",
        overflow: "hidden",
        pointerEvents: "auto",
        zIndex: 10,
        cursor: "pointer",
      }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    />
  );
}
