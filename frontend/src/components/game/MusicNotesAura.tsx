"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTick } from "@pixi/react";
import { useRadioStore } from "@/stores/radioStore";

interface Note {
  id: number;
  bornAt: number;
  offsetX: number;
  drift: number;
  symbol: "♪" | "♫" | "♩";
}

const NOTE_LIFETIME_MS = 2200;
const NOTE_SPAWN_MS = 650;

interface MusicNotesAuraProps {
  /** y inicial das notas (relativo ao container). Default -40 = acima do
   *  ponto de ancoragem, bom pra rádios apoiados no chão/mesa. */
  baseY?: number;
}

/**
 * Aura de notas musicais que sobem e desaparecem quando o rádio toca.
 * Lê `isPlaying` do radioStore — qualquer instância renderizada vai animar
 * notas durante o playback. Use posicionada no container do rádio que
 * deve "emitir" as notas.
 */
export function MusicNotesAura({
  baseY = -40,
}: MusicNotesAuraProps = {}): ReactNode {
  const isPlaying = useRadioStore((s) => s.isPlaying);
  const [notes, setNotes] = useState<Note[]>([]);
  const lastSpawnRef = useRef(0);
  const noteIdRef = useRef(0);
  const elapsedRef = useRef(0);
  const [now, setNow] = useState(0);

  useTick((ticker) => {
    elapsedRef.current += ticker.deltaMS;
    const t = elapsedRef.current;
    setNow(t);

    if (isPlaying && t - lastSpawnRef.current >= NOTE_SPAWN_MS) {
      lastSpawnRef.current = t;
      const symbols: Note["symbol"][] = ["♪", "♫", "♩"];
      const newNote: Note = {
        id: noteIdRef.current++,
        bornAt: t,
        offsetX: (Math.random() - 0.5) * 18,
        drift: Math.random() * Math.PI * 2,
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
      };
      setNotes((prev) => [...prev, newNote]);
    }

    if (Math.random() < 0.02) {
      setNotes((prev) =>
        prev.filter((n) => t - n.bornAt < NOTE_LIFETIME_MS),
      );
    }
  });

  return (
    <>
      {notes.map((note) => {
        const age = now - note.bornAt;
        const t = age / NOTE_LIFETIME_MS;
        if (t >= 1) return null;
        const y = baseY - t * 36;
        const x = note.offsetX + Math.sin(t * Math.PI * 2 + note.drift) * 6;
        const alpha = 1 - t;
        return (
          <pixiContainer key={note.id} x={x} y={y} alpha={alpha} scale={0.85}>
            <pixiText
              text={note.symbol}
              anchor={0.5}
              resolution={2}
              style={{
                fontSize: 40,
                fill: 0xf4d57a,
                fontFamily: "serif",
                fontWeight: "bold",
                stroke: { width: 4, color: 0x1a1a18 },
              }}
            />
          </pixiContainer>
        );
      })}
    </>
  );
}
