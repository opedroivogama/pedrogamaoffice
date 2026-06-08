"use client";

/**
 * AmbientRadioPlayer — singleton invisível que gerencia o player de
 * YouTube do rádio ambiente.
 *
 * Renderizado UMA vez no app root. Cria o iframe via YT.Player API,
 * mantém ele vivo permanentemente, e move (via appendChild) pra dentro
 * do slot ativo (sidebar / modal / TV do quadro) conforme registrado
 * em `radioStore.slots`. Lê state do store e aplica mudanças via API
 * (play/pause/volume/mute/seek). Persiste state em localStorage +
 * backend (mesma rota de antes).
 *
 * NÃO renderiza UI. UI fica em `AmbientRadioControls`.
 */

import { useEffect, useRef } from "react";
import {
  useRadioStore,
  pickActiveSlot,
  getPersistedSnapshot,
  type RadioTrack,
} from "@/stores/radioStore";

// ============================================================================
// YouTube IFrame API types
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

// ============================================================================
// Persistence
// ============================================================================

const STORAGE_KEY = "ambient_radio_v1";
const PREF_API = "http://localhost:8000/api/v1/preferences/radio_playlist";

interface Persisted {
  playlist: RadioTrack[];
  currentIndex: number;
  volume: number;
  muted: boolean;
  videoHidden: boolean;
}

function loadLocal(): Partial<Persisted> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLocal(s: Persisted) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

async function loadRemote(): Promise<Partial<Persisted> | null> {
  try {
    const res = await fetch(PREF_API);
    if (!res.ok) return null;
    const data = (await res.json()) as { value: string | null };
    if (!data.value) return null;
    return JSON.parse(data.value);
  } catch {
    return null;
  }
}

async function saveRemote(s: Persisted): Promise<void> {
  try {
    await fetch(PREF_API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: JSON.stringify(s) }),
    });
  } catch {
    /* ignore */
  }
}

// ============================================================================
// YouTube API loader
// ============================================================================

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
// Singleton guard (Strict Mode runs effects twice in dev)
// ============================================================================

let singletonMounted = false;

// ============================================================================
// COMPONENT
// ============================================================================

export function AmbientRadioPlayer(): null {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  // Mount: cria o host fixed no body + target div + YT.Player.
  // CHAVE: o iframe NUNCA muda de parent depois de criado — Chrome reinicia
  // o vídeo quando reparenteia iframe. Em vez disso, o iframe vive
  // permanentemente neste host (position:fixed direto no body) e é
  // reposicionado via left/top/width/height pra cobrir o slot ativo.
  useEffect(() => {
    if (singletonMounted) return;
    singletonMounted = true;

    const host = document.createElement("div");
    host.setAttribute("data-radio-iframe-host", "true");
    host.style.position = "fixed";
    host.style.left = "-9999px";
    host.style.top = "-9999px";
    host.style.width = "320px";
    host.style.height = "180px";
    host.style.pointerEvents = "none";
    host.style.zIndex = "10";
    document.body.appendChild(host);
    hostRef.current = host;

    const target = document.createElement("div");
    const targetId = `yt-player-${Math.random().toString(36).slice(2, 10)}`;
    target.id = targetId;
    host.appendChild(target);
    targetRef.current = target;

    let destroyed = false;

    // Hidrata state ANTES de iniciar o player (pra cue correto na 1ª faixa).
    void (async () => {
      const store = useRadioStore.getState();
      const remote = await loadRemote();
      if (destroyed) return;
      if (remote) {
        store.hydrateFromPersisted(remote);
      } else {
        const local = loadLocal();
        if (local) {
          store.hydrateFromPersisted(local);
          // Backfill remoto a partir do localStorage
          void saveRemote(getPersistedSnapshot(useRadioStore.getState()));
        }
      }
      store.setHydrated(true);

      const YT = await loadYouTubeAPI();
      if (destroyed) return;

      const initial = useRadioStore.getState();

      playerRef.current = new YT.Player(targetId, {
        height: "180",
        width: "320",
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
            e.target.setVolume(perceptualVolume(initial.volume));
            if (initial.muted) e.target.mute();
            useRadioStore.getState().setIsReady(true);
            const first = initial.playlist[initial.currentIndex];
            if (first && /^[a-zA-Z0-9_-]{11}$/.test(first.id)) {
              try {
                e.target.cueVideoById({ videoId: first.id });
              } catch {
                /* ignore */
              }
            }
            // Captura o iframe criado pelo YT (substituiu o target div)
            const iframe = host.querySelector("iframe");
            if (iframe instanceof HTMLIFrameElement) {
              iframeRef.current = iframe;
            }
            const data = e.target.getVideoData();
            if (data?.title) useRadioStore.getState().setCurrentTitle(data.title);
          },
          onStateChange: (e) => {
            if (!window.YT) return;
            const PS = window.YT.PlayerState;
            const store = useRadioStore.getState();
            if (e.data === PS.PLAYING) {
              store.setPlaying(true);
              const data = e.target.getVideoData();
              if (data?.title) store.setCurrentTitle(data.title);
            } else if (e.data === PS.PAUSED) {
              store.setPlaying(false);
            } else if (e.data === PS.ENDED) {
              store.setPlaying(false);
              store.next();
            }
          },
        },
      });
    })();

    return () => {
      destroyed = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      iframeRef.current = null;
      try {
        host.remove();
      } catch {
        /* ignore */
      }
      hostRef.current = null;
      targetRef.current = null;
      singletonMounted = false;
    };
  }, []);

  // ============================================================================
  // Sincronização state → player (volume, mute, faixa)
  // ============================================================================

  const volume = useRadioStore((s) => s.volume);
  const muted = useRadioStore((s) => s.muted);
  const currentIndex = useRadioStore((s) => s.currentIndex);
  const playlist = useRadioStore((s) => s.playlist);
  const isReady = useRadioStore((s) => s.isReady);
  const isPlaying = useRadioStore((s) => s.isPlaying);
  const hydrated = useRadioStore((s) => s.hydrated);

  // Volume / mute
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    playerRef.current.setVolume(perceptualVolume(volume));
    if (muted || volume === 0) playerRef.current.mute();
    else playerRef.current.unMute();
  }, [volume, muted, isReady]);

  // Track change
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    const track = playlist[currentIndex];
    if (!track) return;
    const id = track.id?.trim();
    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) return;
    playerRef.current.loadVideoById({ videoId: id });
  }, [currentIndex, playlist, isReady]);

  // Play / Pause vindo do store (botões clicados no UI)
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    // Só dispara playVideo/pauseVideo se o estado REAL do player divergir
    // — evita loop: store change → effect → API call → onStateChange → store change.
    // YT API não tem getPlayerState exposto facilmente; confiamos no isPlaying
    // como única fonte de verdade e deixamos onStateChange reconciliar.
    if (isPlaying) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
  }, [isPlaying, isReady]);

  // ============================================================================
  // Captura título periodicamente
  // ============================================================================

  useEffect(() => {
    if (!isReady) return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const data = player.getVideoData();
      const store = useRadioStore.getState();
      if (data?.title && data.title !== store.currentTitle) {
        store.setCurrentTitle(data.title);
        // Salva título na faixa correspondente da playlist
        useRadioStore.setState((s) => {
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
  }, [isReady]);

  // ============================================================================
  // Persiste mudanças (após hidratar)
  // ============================================================================

  useEffect(() => {
    if (!hydrated) return;
    const snap = getPersistedSnapshot(useRadioStore.getState());
    saveLocal(snap);
    void saveRemote(snap);
  }, [hydrated, playlist, currentIndex, volume, muted]);

  // ============================================================================
  // Roteamento de slot (move iframe entre sidebar / modal / TV)
  // ============================================================================

  const slots = useRadioStore((s) => s.slots);

  // Roteamento "sem mover": o host (com o iframe dentro) é position:fixed
  // no body. A cada frame, calculamos o rect do slot ativo e ajustamos
  // left/top/width/height do host pra cobrir esse slot. Como o iframe
  // não muda de parent, o vídeo nunca reinicia ao alternar (TV ⇄ sidebar
  // ⇄ modal) — mantém o tempo atual e o playback.
  useEffect(() => {
    const host = hostRef.current;
    const iframe = iframeRef.current;
    if (!host) return;
    let raf = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const active = pickActiveSlot(slots);
      if (!active || !active.element.isConnected) {
        // Sem slot ativo — esconde fora da tela. O iframe continua tocando
        // (audio segue), só não aparece visualmente.
        host.style.left = "-9999px";
        host.style.top = "-9999px";
        host.style.width = "320px";
        host.style.height = "180px";
        host.style.visibility = "hidden";
        host.style.pointerEvents = "none";
      } else {
        const r = active.element.getBoundingClientRect();
        // Slot com tamanho zero (videoHidden, panel collapsed, etc.):
        // continua audio mas esconde visualmente.
        if (r.width <= 0 || r.height <= 0) {
          host.style.left = "-9999px";
          host.style.top = "-9999px";
          host.style.visibility = "hidden";
          host.style.pointerEvents = "none";
        } else {
          host.style.left = `${r.left}px`;
          host.style.top = `${r.top}px`;
          host.style.width = `${r.width}px`;
          host.style.height = `${r.height}px`;
          host.style.visibility = "visible";
          // Modal precisa estar acima do backdrop dele (z-index do Modal
          // costuma ser ~50). TV/sidebar ficam em z-index normal.
          host.style.zIndex = active.kind === "modal" ? "60" : "10";
          host.style.pointerEvents = "auto";
        }
      }
      if (iframe) {
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "0";
        iframe.style.display = "block";
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [slots, isReady]);

  return null;
}

// ============================================================================
// Helpers
// ============================================================================

/** Curva quadrática (na verdade 4ª) pra audição humana logarítmica. */
function perceptualVolume(linear: number): number {
  return Math.round((linear / 100) ** 4 * 100);
}
