"use client";

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
import { useCallback, useEffect, useRef, useState } from "react";
import { useRadioStore } from "@/stores/radioStore";

// ============================================================================
// TYPES
// ============================================================================

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (arg: string | { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (arg: string | { videoId: string; startSeconds?: number }) => void;
  setVolume: (v: number) => void;
  mute: () => void;
  unMute: () => void;
  getVideoData: () => { title?: string };
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    element: string | HTMLElement,
    options: {
      height?: string | number;
      width?: string | number;
      videoId?: string;
      playerVars?: Record<string, unknown>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface Track {
  id: string; // YouTube video ID
  url: string;
  title?: string;
}

interface RadioState {
  playlist: Track[];
  currentIndex: number;
  volume: number;
  muted: boolean;
  videoHidden: boolean;
}

const STORAGE_KEY = "ambient_radio_v1";

const DEFAULT_STATE: RadioState = {
  playlist: [],
  currentIndex: 0,
  volume: 50,
  muted: false,
  videoHidden: false,
};

// ============================================================================
// HELPERS
// ============================================================================

function extractVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
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

const PREF_API = "http://localhost:8000/api/v1/preferences/radio_playlist";

function loadLocal(): RadioState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

function saveLocal(s: RadioState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

async function loadRemote(): Promise<RadioState | null> {
  try {
    const res = await fetch(PREF_API);
    if (!res.ok) return null;
    const data = (await res.json()) as { value: string | null };
    if (!data.value) return null;
    return { ...DEFAULT_STATE, ...JSON.parse(data.value) };
  } catch {
    return null;
  }
}

async function saveRemote(s: RadioState): Promise<void> {
  try {
    await fetch(PREF_API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: JSON.stringify(s) }),
    });
  } catch {
    /* ignore — localStorage still acts as offline cache */
  }
}

let apiLoadPromise: Promise<YTNamespace> | null = null;

function loadYouTubeAPI(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("ssr"));
  }
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
  });
  return apiLoadPromise;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AmbientRadio(): React.ReactNode {
  const [state, setState] = useState<RadioState>(DEFAULT_STATE);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTitle, setCurrentTitle] = useState<string>("");
  const [newUrl, setNewUrl] = useState("");
  const [showPlaylist, setShowPlaylist] = useState(true);

  const playerRef = useRef<YTPlayer | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const setScenePlaying = useRadioStore((s) => s.setPlaying);

  // Mirror isPlaying to the shared store so the in-scene radio sprite
  // can react (emit music notes etc.). Also factor in muted state.
  useEffect(() => {
    setScenePlaying(isPlaying && !state.muted);
  }, [isPlaying, state.muted, setScenePlaying]);

  const [hydrated, setHydrated] = useState(false);

  // Hydrate from backend on mount. Fall back to localStorage if API fails,
  // and migrate localStorage → backend the first time the backend is empty.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remote = await loadRemote();
      if (cancelled) return;
      if (remote) {
        setState(remote);
      } else {
        const local = loadLocal();
        if (local) {
          setState(local);
          // Backfill backend from existing localStorage state
          void saveRemote(local);
        }
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist state changes — localStorage immediately (offline cache),
  // backend asynchronously. Skip until hydration finishes so we don't
  // overwrite remote state with the default before the load completes.
  useEffect(() => {
    if (!hydrated) return;
    saveLocal(state);
    void saveRemote(state);
  }, [state, hydrated]);

  // Initialize YouTube player. We append a child div inside wrapperRef and
  // give that to YT.Player — YT replaces the element with an iframe, which
  // would otherwise conflict with React's reconciliation if we used the
  // wrapper directly.
  useEffect(() => {
    if (!wrapperRef.current) return;
    let destroyed = false;

    // YT.Player wants a DOM element ID *string*, not a DOM node. Generate a
    // unique id, set it on the target div, then pass the id string. Passing
    // the node directly causes "Invalid video id" in the current widget API.
    const target = document.createElement("div");
    const targetId = `yt-player-${Math.random().toString(36).slice(2, 10)}`;
    target.id = targetId;
    wrapperRef.current.appendChild(target);

    loadYouTubeAPI().then((YT) => {
      if (destroyed) return;
      const initial = stateRef.current;

      playerRef.current = new YT.Player(targetId, {
        height: "180",
        width: "320",
        // No videoId at construction — the YT widget API rejects empty/missing
        // ids with "Invalid video id". We cue the first track in onReady instead.
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
        },
        events: {
          onReady: (e) => {
            e.target.setVolume(initial.volume);
            if (initial.muted) e.target.mute();
            setIsReady(true);
            const first = stateRef.current.playlist[stateRef.current.currentIndex];
            if (first && /^[a-zA-Z0-9_-]{11}$/.test(first.id)) {
              try {
                e.target.cueVideoById({ videoId: first.id });
              } catch (err) {
                console.warn("[radio] cueVideoById failed", err);
              }
            }
            const data = e.target.getVideoData();
            if (data?.title) setCurrentTitle(data.title);
          },
          onStateChange: (e) => {
            if (!window.YT) return;
            const PS = window.YT.PlayerState;
            if (e.data === PS.PLAYING) {
              setIsPlaying(true);
              const data = e.target.getVideoData();
              if (data?.title) setCurrentTitle(data.title);
            } else if (e.data === PS.PAUSED) {
              setIsPlaying(false);
            } else if (e.data === PS.ENDED) {
              setIsPlaying(false);
              // Auto-advance
              setState((s) => {
                if (s.playlist.length === 0) return s;
                return {
                  ...s,
                  currentIndex: (s.currentIndex + 1) % s.playlist.length,
                };
              });
            }
          },
        },
      });
    });

    return () => {
      destroyed = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      try {
        target.remove();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Sync volume / mute
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    // Curva quadrática: audição humana é logarítmica, slider linear soa "alto"
    // até o final e cai de repente. x² dá taper perceptual mais natural.
    const perceptual = Math.round((state.volume / 100) ** 4 * 100);
    playerRef.current.setVolume(perceptual);
    // YT IFrame: setVolume(0) sozinho não silencia totalmente — precisa de mute().
    if (state.muted || state.volume === 0) playerRef.current.mute();
    else playerRef.current.unMute();
  }, [state.volume, state.muted, isReady]);

  // Load current track when index changes. We guard track.id strictly because
  // YT.Player.loadVideoById throws "Invalid video id" on undefined/empty input,
  // and we want it to be a clean no-op for empty playlists.
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    const track = state.playlist[state.currentIndex];
    if (!track) return;
    const id = track.id?.trim();
    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
      console.warn("[radio] skipping invalid video id:", track.id);
      return;
    }
    // Use the object form — the string form has been flaky in recent widget
    // API releases (throws "Invalid video id" on otherwise valid 11-char IDs).
    playerRef.current.loadVideoById({ videoId: id });
  }, [state.currentIndex, state.playlist, isReady]);

  // Track persistence: capture title once available
  useEffect(() => {
    if (!isReady) return;
    const interval = setInterval(() => {
      if (!playerRef.current) return;
      const data = playerRef.current.getVideoData();
      if (data?.title && data.title !== currentTitle) {
        setCurrentTitle(data.title);
        setState((s) => {
          const next = [...s.playlist];
          if (next[s.currentIndex] && next[s.currentIndex].title !== data.title) {
            next[s.currentIndex] = { ...next[s.currentIndex], title: data.title };
            return { ...s, playlist: next };
          }
          return s;
        });
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [isReady, currentTitle]);

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const togglePlay = useCallback(() => {
    if (!playerRef.current || state.playlist.length === 0) return;
    if (isPlaying) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  }, [isPlaying, state.playlist.length]);

  const next = useCallback(() => {
    setState((s) => {
      if (s.playlist.length === 0) return s;
      return { ...s, currentIndex: (s.currentIndex + 1) % s.playlist.length };
    });
  }, []);

  const prev = useCallback(() => {
    setState((s) => {
      if (s.playlist.length === 0) return s;
      return {
        ...s,
        currentIndex:
          (s.currentIndex - 1 + s.playlist.length) % s.playlist.length,
      };
    });
  }, []);

  const addTrack = useCallback(() => {
    const id = extractVideoId(newUrl);
    if (!id) return;
    setState((s) => ({
      ...s,
      playlist: [...s.playlist, { id, url: newUrl.trim() }],
    }));
    setNewUrl("");
  }, [newUrl]);

  const removeTrack = useCallback((idx: number) => {
    setState((s) => {
      const next = s.playlist.filter((_, i) => i !== idx);
      let currentIndex = s.currentIndex;
      if (idx < currentIndex) currentIndex--;
      if (currentIndex >= next.length) currentIndex = 0;
      return { ...s, playlist: next, currentIndex };
    });
  }, []);

  const selectTrack = useCallback((idx: number) => {
    setState((s) => ({ ...s, currentIndex: idx }));
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  const currentTrack = state.playlist[state.currentIndex];
  const displayTitle =
    currentTitle ||
    currentTrack?.title ||
    (currentTrack ? `Faixa ${state.currentIndex + 1}` : "Sem músicas");

  return (
    <div className="w-full h-full bg-jp-surface-1 overflow-hidden flex flex-col">
      {/* Status strip (accordion above has the title; this just shows playback) */}
      <div className="flex items-center justify-end px-3 py-1 bg-jp-surface-2 border-b border-jp-border-light/30">
        <div className="text-[10px] text-jp-fg-dim font-mono uppercase tracking-wider">
          {isPlaying ? "● tocando" : "○ pausado"}
        </div>
      </div>

      {/* Video — height collapses to 0 when hidden, but iframe stays alive for audio */}
      <div
        style={{
          height: state.videoHidden ? 0 : 180,
          transition: "height 200ms ease",
          overflow: "hidden",
        }}
        className="bg-black relative"
      >
        <div ref={wrapperRef} className="w-full h-full" />
      </div>

      {/* Now playing + controls */}
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

        {/* Transport controls */}
        <div className="flex items-center justify-center gap-2 mt-2">
          <button
            onClick={prev}
            disabled={state.playlist.length === 0}
            aria-label="Anterior"
            className="p-1.5 text-jp-fg-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <SkipBack size={16} />
          </button>
          <button
            onClick={togglePlay}
            disabled={state.playlist.length === 0}
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
            disabled={state.playlist.length === 0}
            aria-label="Próxima"
            className="p-1.5 text-jp-fg-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <SkipForward size={16} />
          </button>
        </div>

        {/* Volume + toggles */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => setState((s) => ({ ...s, muted: !s.muted }))}
            aria-label={state.muted ? "Ativar som" : "Silenciar"}
            className="text-jp-fg-muted hover:text-white transition-colors"
          >
            {state.muted || state.volume === 0 ? (
              <VolumeX size={14} />
            ) : (
              <Volume2 size={14} />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={state.volume}
            onChange={(e) =>
              setState((s) => ({ ...s, volume: Number(e.target.value) }))
            }
            className="flex-grow accent-jp-gold"
            aria-label="Volume"
          />
          <button
            onClick={() =>
              setState((s) => ({ ...s, videoHidden: !s.videoHidden }))
            }
            aria-label={state.videoHidden ? "Mostrar vídeo" : "Ocultar vídeo"}
            title={state.videoHidden ? "Mostrar vídeo" : "Ocultar vídeo"}
            className="text-jp-fg-muted hover:text-white transition-colors"
          >
            {state.videoHidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {/* Playlist toggle */}
      <button
        onClick={() => setShowPlaylist((v) => !v)}
        className="px-3 py-2 text-[11px] text-jp-fg-dim hover:text-jp-fg-muted uppercase tracking-wider flex items-center justify-between transition-colors"
      >
        <span>Playlist ({state.playlist.length})</span>
        <span>{showPlaylist ? "−" : "+"}</span>
      </button>

      {showPlaylist && (
        <div className="px-3 pb-3 max-h-64 overflow-y-auto">
          {/* Add input */}
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

          {/* List */}
          {state.playlist.length === 0 ? (
            <div className="text-[11px] text-jp-fg-dim italic text-center py-3">
              Adicione um link YouTube acima
            </div>
          ) : (
            <ul className="space-y-1">
              {state.playlist.map((track, i) => (
                <li
                  key={`${track.id}-${i}`}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                    i === state.currentIndex
                      ? "bg-jp-gold/10 text-jp-gold"
                      : "text-jp-fg-muted hover:bg-jp-surface-2"
                  }`}
                >
                  <button
                    onClick={() => selectTrack(i)}
                    className="flex-grow text-left truncate font-mono"
                    title={track.title ?? track.url}
                  >
                    {i === state.currentIndex && isPlaying ? "▶ " : ""}
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
