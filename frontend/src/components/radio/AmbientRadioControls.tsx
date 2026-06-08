"use client";

/**
 * AmbientRadioControls — UI completa do rádio (controles + playlist).
 *
 * NÃO cria iframe. O <AmbientRadioPlayer/> singleton dá conta disso. Esta
 * UI lê state do `radioStore` e dispara actions. Renderiza um <div> "slot"
 * que se registra no store — quando este slot é o de maior prioridade
 * visível, o player move o iframe físico pra dentro dele.
 *
 * Pode ser renderizada em quantos lugares precisar (sidebar, modal). Todas
 * as cópias mostram o mesmo state e controlam o mesmo player.
 */

import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRadioStore, type SlotKind } from "@/stores/radioStore";

function extractVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1).split("/")[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      if (u.pathname.startsWith("/embed/")) {
        return u.pathname.slice(7).split("/")[0] || null;
      }
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.slice(8).split("/")[0] || null;
      }
    }
  } catch {
    /* fallthrough */
  }
  return null;
}

export interface AmbientRadioControlsProps {
  /**
   * Qual destino esta UI representa. Determina a prioridade do slot:
   * tv > modal > sidebar. Se mais de uma UI estiver visível, o iframe
   * vai pra de maior prioridade.
   */
  slotKind: SlotKind;
}

export function AmbientRadioControls({
  slotKind,
}: AmbientRadioControlsProps): React.ReactNode {
  const playlist = useRadioStore((s) => s.playlist);
  const currentIndex = useRadioStore((s) => s.currentIndex);
  const volume = useRadioStore((s) => s.volume);
  const muted = useRadioStore((s) => s.muted);
  const videoHidden = useRadioStore((s) => s.videoHidden);
  const isPlaying = useRadioStore((s) => s.isPlaying);
  const currentTitle = useRadioStore((s) => s.currentTitle);

  const togglePlay = useRadioStore((s) => s.togglePlay);
  const next = useRadioStore((s) => s.next);
  const prev = useRadioStore((s) => s.prev);
  const selectTrack = useRadioStore((s) => s.selectTrack);
  const addTrackToStore = useRadioStore((s) => s.addTrack);
  const removeTrack = useRadioStore((s) => s.removeTrack);
  const setVolume = useRadioStore((s) => s.setVolume);
  const toggleMuted = useRadioStore((s) => s.toggleMuted);
  const toggleVideoHidden = useRadioStore((s) => s.toggleVideoHidden);
  const registerSlot = useRadioStore((s) => s.registerSlot);
  const unregisterSlot = useRadioStore((s) => s.unregisterSlot);

  const [newUrl, setNewUrl] = useState("");
  const [showPlaylist, setShowPlaylist] = useState(true);
  const slotId = useId();
  const slotRef = useRef<HTMLDivElement | null>(null);

  // Registra o slot no store. O player escuta e move iframe pra cá quando
  // este for o slot de maior prioridade visível.
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    registerSlot(slotId, { kind: slotKind, element: el });
    return () => unregisterSlot(slotId);
  }, [slotId, slotKind, registerSlot, unregisterSlot]);

  const addTrack = useCallback(() => {
    const id = extractVideoId(newUrl);
    if (!id) return;
    addTrackToStore({ id, url: newUrl.trim() });
    setNewUrl("");
  }, [newUrl, addTrackToStore]);

  const currentTrack = playlist[currentIndex];
  const displayTitle =
    currentTitle ||
    currentTrack?.title ||
    (currentTrack ? `Faixa ${currentIndex + 1}` : "Sem músicas");

  return (
    <div className="w-full h-full bg-jp-surface-1 overflow-hidden flex flex-col">
      <div className="flex items-center justify-end px-3 py-1 bg-jp-surface-2 border-b border-jp-border-light/30">
        <div className="text-[10px] text-jp-fg-dim font-mono uppercase tracking-wider">
          {isPlaying ? "● tocando" : "○ pausado"}
        </div>
      </div>

      {/* Slot do iframe — height colapsa quando vídeo oculto, mas o iframe
          NÃO é destruído (continua tocando audio). */}
      <div
        style={{
          height: videoHidden ? 0 : 180,
          transition: "height 200ms ease",
          overflow: "hidden",
        }}
        className="bg-black relative"
      >
        <div ref={slotRef} className="w-full h-full" />
      </div>

      {/* Now playing + transport */}
      <div className="px-3 py-2 border-b border-jp-border-light/30">
        <div className="text-[11px] text-jp-fg-dim uppercase tracking-wider mb-1">
          Tocando agora
        </div>
        <div
          className="text-xs text-jp-fg-muted font-mono truncate"
          title={displayTitle}
        >
          {displayTitle}
        </div>

        <div className="flex items-center justify-center gap-2 mt-2">
          <button
            onClick={prev}
            disabled={playlist.length === 0}
            aria-label="Anterior"
            className="p-1.5 text-jp-fg-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <SkipBack size={16} />
          </button>
          <button
            onClick={togglePlay}
            disabled={playlist.length === 0}
            aria-label={isPlaying ? "Pausar" : "Tocar"}
            className="p-2 rounded-full bg-jp-gold/15 hover:bg-jp-gold/25 text-jp-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isPlaying ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </button>
          <button
            onClick={next}
            disabled={playlist.length === 0}
            aria-label="Próxima"
            className="p-1.5 text-jp-fg-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <SkipForward size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={toggleMuted}
            aria-label={muted ? "Ativar som" : "Silenciar"}
            className="text-jp-fg-muted hover:text-white transition-colors"
          >
            {muted || volume === 0 ? (
              <VolumeX size={14} />
            ) : (
              <Volume2 size={14} />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="flex-grow accent-jp-gold"
            aria-label="Volume"
          />
          <button
            onClick={toggleVideoHidden}
            aria-label={videoHidden ? "Mostrar vídeo" : "Ocultar vídeo"}
            title={videoHidden ? "Mostrar vídeo" : "Ocultar vídeo"}
            className="text-jp-fg-muted hover:text-white transition-colors"
          >
            {videoHidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <button
        onClick={() => setShowPlaylist((v) => !v)}
        className="px-3 py-2 text-[11px] text-jp-fg-dim hover:text-jp-fg-muted uppercase tracking-wider flex items-center justify-between transition-colors"
      >
        <span>Playlist ({playlist.length})</span>
        <span>{showPlaylist ? "−" : "+"}</span>
      </button>

      {showPlaylist && (
        <div className="px-3 pb-3 max-h-64 overflow-y-auto">
          <div className="flex items-center gap-1 mb-2">
            <input
              type="text"
              placeholder="Cole link YouTube..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTrack();
              }}
              className="flex-grow min-w-0 bg-jp-surface-2 border border-jp-border-light/30 rounded px-2 py-1 text-xs text-jp-fg-muted placeholder:text-jp-fg-dim focus:outline-none focus:border-jp-gold/50"
            />
            <button
              onClick={addTrack}
              disabled={!extractVideoId(newUrl)}
              aria-label="Adicionar"
              className="p-1.5 bg-jp-gold/15 hover:bg-jp-gold/25 text-jp-gold rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>

          {playlist.length === 0 ? (
            <div className="text-[11px] text-jp-fg-dim italic text-center py-3">
              Adicione um link YouTube acima
            </div>
          ) : (
            <ul className="space-y-1">
              {playlist.map((track, i) => (
                <li
                  key={`${track.id}-${i}`}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                    i === currentIndex
                      ? "bg-jp-gold/10 text-jp-gold"
                      : "text-jp-fg-muted hover:bg-jp-surface-2"
                  }`}
                >
                  <button
                    onClick={() => selectTrack(i)}
                    className="flex-grow text-left truncate font-mono"
                    title={track.title ?? track.url}
                  >
                    {i === currentIndex && isPlaying ? "▶ " : ""}
                    {track.title ?? track.url}
                  </button>
                  <button
                    onClick={() => removeTrack(i)}
                    aria-label="Remover"
                    className="text-jp-fg-dim hover:text-rose-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
