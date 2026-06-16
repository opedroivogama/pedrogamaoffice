"use client";

import {
  ChevronUp,
  GitBranch,
  History,
  Maximize2,
  Minimize2,
  Plus,
  Send,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

import { usePreferencesStore } from "@/stores/preferencesStore";
import { useGameStore } from "@/stores/gameStore";

const API_BASE = "http://localhost:8000/api/v1/chat";
const PAGE_SIZE = 20;

type Role = "user" | "assistant";
type MessageKind = "main" | "btw";

interface ToolCall {
  id: string;
  name: string;
  status: "running" | "done";
}

interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  tools?: ToolCall[];
  /** Marca o balão como ainda streaming (mostra cursor). */
  streaming?: boolean;
  /** ISO timestamp — vem do DB; em msgs streaming do client é o momento local. */
  createdAt?: string;
  /** 'main' = turno normal; 'btw' = sidequest paralela (/btw), bolha com tom diferenciado. */
  kind?: MessageKind;
}

interface ThreadRecord {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
  last_message_at: string | null;
}

interface DbMessage {
  id: string;
  thread_id: string;
  role: Role;
  text: string;
  tools: Array<{ id?: string; name?: string }> | null;
  created_at: string;
  kind?: MessageKind;
}

type ServerEvent =
  | { type: "meta"; session_id: string; is_new: boolean; kind?: MessageKind }
  | { type: "claude"; event: ClaudeStreamEvent }
  | { type: "stderr"; text: string }
  | { type: "stdout_raw"; text: string }
  | { type: "error"; message: string }
  | { type: "done"; exit_code: number; session_id?: string };

interface ClaudeStreamEvent {
  type: string;
  subtype?: string;
  event?: {
    type: string;
    delta?: { type: string; text?: string };
    content_block?: { type: string; name?: string; id?: string };
    index?: number;
  };
  message?: {
    content?: Array<{ type: string; text?: string; name?: string; id?: string }>;
  };
}

function newId(): string {
  return crypto.randomUUID();
}

function dbToMessage(m: DbMessage): ChatMessage {
  // Dedup por id — mensagens no DB podem ter tools repetidas porque o
  // Claude Code emite o mesmo tool_use em mais de um evento (stream +
  // assistant snapshot), e o backend não dedupava na hora de gravar.
  const seen = new Set<string>();
  const tools: ToolCall[] = [];
  for (const t of m.tools ?? []) {
    const id = t.id ?? newId();
    if (seen.has(id)) continue;
    seen.add(id);
    tools.push({ id, name: t.name ?? "tool", status: "done" });
  }
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    tools: tools.length ? tools : undefined,
    createdAt: m.created_at,
    kind: m.kind ?? "main",
  };
}

export function ChatPanel(): React.ReactNode {
  // Modelo selecionado no badge do header (`ModelSelect`). Mandado em
  // cada `/chat/stream` pra trocar qual Claude responde aqui no Pergunte ao
  // Claude. Outras integrações (hooks, painel) NÃO usam isso — escopo
  // intencionalmente limitado a este painel.
  const claudeModel = usePreferencesStore((s) => s.claudeModel);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thread, setThread] = useState<ThreadRecord | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [threadList, setThreadList] = useState<ThreadRecord[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Modo /btw ativo: input fica editável mesmo durante stream do main, e
  // qualquer envio vira uma sidequest paralela (kind=btw). Toggle pelo
  // botão GitBranch no rodapé. Desliga sozinho depois de mandar a msg.
  const [btwMode, setBtwMode] = useState(false);

  // Close on Escape when expanded
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expanded]);

  // Sincroniza a thread atual com a sessionId que o painel pixel art tá
  // observando. O backend roda `claude --print --session-id={thread.id}`,
  // então os hooks emitem eventos em `/ws/{thread.id}`. Sem essa
  // sincronização, o WS do painel fica numa outra session e o balão do
  // Pedro nunca aparece quando mando msg pelo "Pergunte ao Claude".
  // `page.tsx` consome o pedido e aciona `setSessionId` do useSessions.
  useEffect(() => {
    if (!thread?.id) return;
    useGameStore.getState().requestSessionSwitch(thread.id);
    // Inicia o poller de transcript — msgs do terminal aparecem aqui via
    // session_transcript_message no WebSocket.
    fetch(`http://localhost:8000/api/v1/sessions/${thread.id}/watch-transcript`, {
      method: "POST",
    }).catch(() => {});
  }, [thread?.id]);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll só quando mensagem nova chega no fim (não quando carrega anterior)
  const lastMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scrollRef.current || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.id !== lastMsgIdRef.current || last.streaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      lastMsgIdRef.current = last.id;
    }
  }, [messages]);

  // ── Boot: carrega thread mais recente + última página de mensagens ──────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tr = await fetch(`${API_BASE}/threads?limit=1`);
        if (!tr.ok) throw new Error(`threads HTTP ${tr.status}`);
        const threads: ThreadRecord[] = await tr.json();
        if (!threads.length) {
          if (!cancelled) setIsInitializing(false);
          return;
        }
        const t = threads[0];
        const mr = await fetch(
          `${API_BASE}/threads/${t.id}/messages?limit=${PAGE_SIZE}`,
        );
        if (!mr.ok) throw new Error(`messages HTTP ${mr.status}`);
        const { messages: msgs, has_more } = (await mr.json()) as {
          messages: DbMessage[];
          has_more: boolean;
        };
        if (cancelled) return;
        // Backend retorna DESC (recente→antigo); invertemos pra exibir
        // antigo→recente (mais natural pra chat).
        const ordered = msgs.slice().reverse().map(dbToMessage);
        setThread(t);
        setMessages(ordered);
        setHasMore(has_more);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Escuta msgs do terminal (session_transcript_message → CustomEvent).
  useEffect(() => {
    if (!thread?.id) return;
    const handler = (e: Event) => {
      const { role, text } = (e as CustomEvent<{ role: string; text: string }>).detail ?? {};
      if (!text) return;
      setMessages((prev) => {
        const last = [...prev].reverse().find((m) => m.role === role);
        if (last?.text === text) return prev;
        return [
          ...prev,
          { id: newId(), role: role as "user" | "assistant", text, kind: "main" as const },
        ];
      });
    };
    window.addEventListener("terminal-chat-message", handler);
    return () => window.removeEventListener("terminal-chat-message", handler);
  }, [thread?.id]);

  const loadThread = useCallback(async (t: ThreadRecord) => {
    // Aborta stream em curso antes de trocar de contexto
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setError(null);
    try {
      const mr = await fetch(
        `${API_BASE}/threads/${t.id}/messages?limit=${PAGE_SIZE}`,
      );
      if (!mr.ok) throw new Error(`messages HTTP ${mr.status}`);
      const { messages: msgs, has_more } = (await mr.json()) as {
        messages: DbMessage[];
        has_more: boolean;
      };
      const ordered = msgs.slice().reverse().map(dbToMessage);
      setThread(t);
      setMessages(ordered);
      setHasMore(has_more);
      lastMsgIdRef.current = null;
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const openHistory = useCallback(async () => {
    setShowHistory(true);
    setIsLoadingThreads(true);
    try {
      const r = await fetch(`${API_BASE}/threads?limit=30`);
      if (!r.ok) throw new Error(`threads HTTP ${r.status}`);
      const threads: ThreadRecord[] = await r.json();
      setThreadList(threads);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoadingThreads(false);
    }
  }, []);

  const handleLoadOlder = useCallback(async () => {
    if (!thread || isLoadingOlder || !hasMore) return;
    const oldest = messages[0];
    if (!oldest?.createdAt) return;
    setIsLoadingOlder(true);
    try {
      const r = await fetch(
        `${API_BASE}/threads/${thread.id}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldest.createdAt)}`,
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { messages: msgs, has_more } = (await r.json()) as {
        messages: DbMessage[];
        has_more: boolean;
      };
      // Preserva posição de scroll: mede altura antes, ajusta depois.
      const sc = scrollRef.current;
      const prevHeight = sc?.scrollHeight ?? 0;
      const ordered = msgs.slice().reverse().map(dbToMessage);
      setMessages((prev) => [...ordered, ...prev]);
      setHasMore(has_more);
      requestAnimationFrame(() => {
        if (sc) sc.scrollTop = sc.scrollHeight - prevHeight;
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [thread, messages, isLoadingOlder, hasMore]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  }, []);

  const handleNewThread = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setThread(null);
    setIsStreaming(false);
    setError(null);
    setHasMore(false);
    lastMsgIdRef.current = null;
  }, []);

  // Abre a conversa atual num terminal nativo fora do UI — útil quando o
  // turno precisa de permissões maiores que o backend não consegue (escrita
  // em $env, mudança de PATH, sudo, etc). Reusa o endpoint de resume das
  // sessões pinadas — ele acha o CWD original pelo JSONL e roda
  // `claude --resume <id>` no Windows Terminal nativo.
  const [openingTerminal, setOpeningTerminal] = useState(false);
  const handleOpenInTerminal = useCallback(async () => {
    if (!thread?.id || openingTerminal) return;
    setOpeningTerminal(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/v1/sessions/${thread.id}/resume`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { detail?: string }
          | null;
        setError(`Falha ao abrir terminal: ${body?.detail ?? res.statusText}`);
      }
    } catch (err) {
      setError(`Falha ao abrir terminal: ${(err as Error).message}`);
    } finally {
      setOpeningTerminal(false);
    }
  }, [thread?.id, openingTerminal]);

  const handleDeleteThread = useCallback(async () => {
    if (!thread) return;
    if (!confirm(`Apagar essa conversa? (${thread.title})`)) return;
    try {
      await fetch(`${API_BASE}/threads/${thread.id}`, { method: "DELETE" });
    } catch {
      // best-effort
    }
    handleNewThread();
  }, [thread, handleNewThread]);

  const sendPrompt = useCallback(async (
    rawPrompt: string,
    kind: MessageKind = "main",
  ) => {
    const prompt = rawPrompt.trim();
    if (!prompt) return;
    // /btw é paralelo — só bloqueia se for main e já tiver main rodando.
    if (kind === "main" && isStreaming) return;
    // /btw exige uma thread principal já existente (pra ter contexto).
    if (kind === "btw" && !thread?.id) {
      setError("/btw requer uma conversa principal já iniciada.");
      return;
    }

    const sessionId = thread?.id ?? null;
    const userMsg: ChatMessage = { id: newId(), role: "user", text: prompt, kind };
    const assistantMsg: ChatMessage = {
      id: newId(),
      role: "assistant",
      text: "",
      streaming: true,
      tools: [],
      kind,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setError(null);
    // Só o turno "main" toma o lock de streaming — /btw roda em paralelo.
    if (kind === "main") setIsStreaming(true);

    // /btw NÃO mexe nos balões flutuantes do escritório — é sidequest
    // silenciosa, vive só dentro do painel. Só "main" espelha no avatar.
    if (kind === "main") {
      const store = useGameStore.getState();
      store.setUserAvatarBubble("pedro", prompt);
      store.updateBossBackendState("receiving");
      store.setBossBubbleContent(null);
    }

    const controller = new AbortController();
    // /btw tem AbortController próprio (não interrompe outros /btw nem o
    // main em curso); só o main grava o ref pro botão Stop usar.
    if (kind === "main") {
      abortRef.current = controller;
    }

    try {
      const res = await fetch(`${API_BASE}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          session_id: sessionId,
          is_new: sessionId === null,
          model: claudeModel,
          kind,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          for (const line of block.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            if (!payload) continue;
            try {
              const ev = JSON.parse(payload) as ServerEvent;
              processEvent(ev, assistantMsg.id, prompt, kind);
            } catch {
              // ignore malformed
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
      }
    } finally {
      if (kind === "main") {
        setIsStreaming(false);
        abortRef.current = null;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, streaming: false } : m,
        ),
      );
      // Só o main toca no estado do boss flutuante do painel.
      if (kind === "main") {
        useGameStore.getState().updateBossBackendState("idle");
      }
    }
  }, [isStreaming, thread, claudeModel]);

  const handleSend = useCallback(() => {
    const raw = input.trim();
    if (!raw) return;

    // Comandos /silent locais — interceptados antes de qualquer envio ao
    // Claude. Pedro 2026-06-09:
    //   /silent     → snapshot clean: limpa tudo da tela AGORA. Bubbles
    //                 futuros continuam aparecendo normal.
    //   /silenton   → liga modo silent: bubbles param de aparecer.
    //   /silentoff  → desliga modo silent.
    // Match case-insensitive, sem args.
    const silentCmd = raw.toLowerCase();
    if (silentCmd === "/silent") {
      useGameStore.getState().clearAllBubblesNow();
      setInput("");
      return;
    }
    if (silentCmd === "/silenton") {
      const s = useGameStore.getState();
      s.clearAllBubblesNow();
      s.setBubblesSilenced(true);
      setInput("");
      return;
    }
    if (silentCmd === "/silentoff") {
      useGameStore.getState().setBubblesSilenced(false);
      setInput("");
      return;
    }

    // Resolve kind: modo btw ativo OU prefixo /btw literal → sidequest;
    // caso contrário, turno main normal. O prefixo é stripado quando casa.
    const btwPrefixMatch = raw.match(/^\/btw[\s:]+([\s\S]+)$/i);
    const usingBtw = btwMode || btwPrefixMatch !== null;
    const prompt = btwPrefixMatch ? btwPrefixMatch[1] : raw;

    if (usingBtw) {
      // /btw requer thread principal — se não tem, manda como main pra
      // criar a conversa primeiro.
      if (!thread?.id) {
        setInput("");
        setBtwMode(false);
        if (isStreaming) return;
        void sendPrompt(prompt, "main");
        return;
      }
      setInput("");
      setBtwMode(false); // toggle one-shot — desliga depois de mandar
      void sendPrompt(prompt, "btw");
      return;
    }

    if (isStreaming) return; // main bloqueia se já tem main rodando
    setInput("");
    void sendPrompt(prompt, "main");
  }, [input, isStreaming, sendPrompt, btwMode, thread?.id]);

  const handleToggleBtw = useCallback(() => {
    // /btw exige thread principal pra ter snapshot — se não tem, ignora
    // o toggle e mantém modo main (mensagem do erro fica pro send dela).
    if (!thread?.id) {
      setError("/btw requer uma conversa principal já iniciada.");
      return;
    }
    setError(null);
    setBtwMode((v) => !v);
  }, [thread?.id]);

  const processEvent = useCallback(
    (ev: ServerEvent, assistantId: string, originalPrompt: string, kind: MessageKind = "main") => {
      if (ev.type === "meta") {
        // /btw NÃO cria thread nova — ele vive na thread principal já
        // existente. Só criamos stub local pra turnos main.
        if (ev.kind !== "btw") {
          setThread((prev) =>
            prev ?? {
              id: ev.session_id,
              title:
                originalPrompt.length > 80
                  ? originalPrompt.slice(0, 77) + "…"
                  : originalPrompt,
              message_count: 0,
              updated_at: new Date().toISOString(),
              last_message_at: null,
            },
          );
        }
        return;
      }
      if (ev.type === "error") {
        setError(ev.message);
        return;
      }
      if (ev.type === "stderr" || ev.type === "stdout_raw" || ev.type === "done") {
        return;
      }
      if (ev.type !== "claude") return;

      const c = ev.event;

      if (c.type === "stream_event") {
        const inner = c.event;
        if (!inner) return;
        if (
          inner.type === "content_block_delta" &&
          inner.delta?.type === "text_delta" &&
          inner.delta.text
        ) {
          const piece = inner.delta.text;
          let nextText = "";
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              nextText = m.text + piece;
              return { ...m, text: nextText };
            }),
          );
          // Espelha o texto incremental no balão flutuante do Claude —
          // mas só pra turno main. /btw é sidequest silenciosa: vive só
          // dentro do painel pra não atrapalhar o turno principal.
          if (nextText && kind === "main") {
            useGameStore.getState().setBossBubbleContent({
              type: "speech",
              text: nextText,
              persistent: true,
            });
          }
        } else if (
          inner.type === "content_block_start" &&
          inner.content_block?.type === "tool_use"
        ) {
          const toolName = inner.content_block.name ?? "tool";
          const toolId = inner.content_block.id ?? newId();
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const existing = m.tools ?? [];
              // Claude Code emite o mesmo tool_use.id em mais de um evento
              // (stream + assistant snapshot). Sem dedup vira "duplicate key"
              // no React.
              if (existing.some((t) => t.id === toolId)) return m;
              return {
                ...m,
                tools: [
                  ...existing,
                  { id: toolId, name: toolName, status: "running" },
                ],
              };
            }),
          );
        } else if (inner.type === "content_block_stop") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    tools: (m.tools ?? []).map((t) =>
                      t.status === "running" ? { ...t, status: "done" } : t,
                    ),
                  }
                : m,
            ),
          );
        }
        return;
      }

      if (c.type === "assistant" && c.message?.content) {
        const fullText = c.message.content
          .filter((b) => b.type === "text" && b.text)
          .map((b) => b.text)
          .join("");
        if (fullText) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && !m.text ? { ...m, text: fullText } : m,
            ),
          );
        }
      }
    },
    [],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const panel = (
    <div className="flex flex-col h-full min-h-0">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-2 px-2 py-1 text-[10px] font-mono text-jp-fg-dim border-b border-jp-divider-soft">
        <span className="truncate flex-1" title={thread?.title}>
          {thread ? thread.title : "nova conversa"}
        </span>
        {thread?.id && (
          <span
            className="shrink-0 px-1.5 py-0.5 rounded bg-jp-surface-2/40 border border-jp-divider-soft text-jp-fg-dim tracking-wider opacity-70"
            title={`session_id: ${thread.id}`}
          >
            #{thread.id.slice(-8)}
          </span>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={showHistory ? () => setShowHistory(false) : openHistory}
            className={`p-0.5 rounded hover:text-jp-fg ${showHistory ? "text-jp-gold-primary" : ""}`}
            title="Conversas anteriores"
          >
            <History className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleNewThread}
            disabled={isStreaming}
            className="p-0.5 rounded hover:text-jp-fg disabled:opacity-30"
            title="Nova conversa"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleOpenInTerminal}
            disabled={!thread || openingTerminal}
            className={`p-0.5 rounded hover:text-jp-gold-primary disabled:opacity-30 transition-colors ${
              openingTerminal ? "text-jp-gold-primary animate-pulse" : ""
            }`}
            title="Abrir essa conversa num terminal nativo (pra usar permissões maiores: sudo, $env, etc)"
          >
            <Terminal className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleDeleteThread}
            disabled={isStreaming || !thread}
            className="p-0.5 rounded hover:text-jp-fg disabled:opacity-30"
            title="Apagar conversa"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="p-0.5 rounded hover:text-jp-fg"
            title={expanded ? "Reduzir" : "Maximizar"}
          >
            {expanded ? (
              <Minimize2 className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {/* Painel de histórico de threads — sobrepõe a área de mensagens.
          Mostra título + última atividade; clique troca a thread atual. */}
      {showHistory && (
        <div className="border-b border-jp-divider-soft bg-jp-surface-1/95 max-h-64 overflow-y-auto">
          {isLoadingThreads ? (
            <div className="text-[11px] text-jp-fg-dim italic text-center py-3">
              carregando…
            </div>
          ) : threadList.length === 0 ? (
            <div className="text-[11px] text-jp-fg-dim italic text-center py-3">
              nenhuma conversa anterior
            </div>
          ) : (
            <ul className="divide-y divide-jp-divider-soft/50">
              {threadList.map((t) => {
                const isCurrent = thread?.id === t.id;
                const when = t.last_message_at ?? t.updated_at;
                const label = when
                  ? new Date(when).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isCurrent) loadThread(t);
                        setShowHistory(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 hover:bg-jp-surface-2/60 transition-colors ${
                        isCurrent ? "bg-jp-gold-primary/10" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[11px] truncate flex-1 ${
                            isCurrent
                              ? "text-jp-gold-primary font-medium"
                              : "text-jp-fg"
                          }`}
                          title={t.title}
                        >
                          {t.title || "(sem título)"}
                        </span>
                        <span className="text-[9px] font-mono text-jp-fg-dim shrink-0">
                          {t.message_count} · {label}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-2"
      >
        {hasMore && (
          <button
            type="button"
            onClick={handleLoadOlder}
            disabled={isLoadingOlder}
            className="w-full text-[10px] font-mono text-jp-fg-dim hover:text-jp-fg disabled:opacity-50 py-1 flex items-center justify-center gap-1 border border-dashed border-jp-divider-soft rounded"
          >
            <ChevronUp className="w-3 h-3" />
            {isLoadingOlder ? "carregando…" : "carregar anteriores"}
          </button>
        )}
        {!isInitializing && messages.length === 0 && (
          <div className="text-[11px] text-jp-fg-dim/70 italic text-center py-6">
            Pergunte algo ao Claude. Ele responde com acesso aos tools, skills e
            MCPs do projeto.
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {error && (
          <div className="text-[11px] text-red-400 italic px-2 py-1 border border-red-900/40 rounded bg-red-950/20">
            erro: {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className={`border-t p-2 flex gap-2 items-end transition-colors ${
          btwMode
            ? "border-jp-gold-primary/40 bg-jp-gold-primary/5"
            : "border-jp-divider-soft"
        }`}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          // No modo /btw o input fica liberado mesmo se o main estiver
          // streamando — a sidequest roda em paralelo, sem disputar lock.
          disabled={isStreaming && !btwMode}
          placeholder={
            btwMode
              ? "/btw — sidequest paralela (Enter envia, não polui o JSONL principal)"
              : "Pergunte ao Claude…  (Enter envia, Shift+Enter quebra linha)"
          }
          className={`flex-1 resize-none rounded px-2 py-1.5 text-xs text-jp-fg placeholder:text-jp-fg-dim/50 focus:outline-none disabled:opacity-50 transition-colors ${
            btwMode
              ? "bg-jp-surface-2/60 border border-dashed border-jp-gold-primary/50 focus:border-jp-gold-primary/80"
              : "bg-jp-surface-2/50 border border-jp-divider-soft focus:border-jp-gold-primary/60"
          }`}
        />
        <button
          type="button"
          onClick={handleToggleBtw}
          className={`p-2 rounded border transition-colors ${
            btwMode
              ? "bg-jp-gold-primary/30 border-jp-gold-primary/70 text-jp-gold-primary"
              : "bg-jp-surface-2/50 border-jp-divider-soft text-jp-fg-muted hover:text-jp-gold-primary hover:border-jp-gold-primary/40"
          }`}
          title={
            btwMode
              ? "Modo /btw ATIVO — próxima mensagem vai como sidequest paralela. Clique pra cancelar."
              : "Ativar modo /btw — manda sidequest paralela com snapshot da conversa, sem travar o turno principal."
          }
          aria-label="Modo /btw"
          aria-pressed={btwMode}
        >
          <GitBranch className="w-3.5 h-3.5" />
        </button>
        {isStreaming && !btwMode ? (
          <button
            type="button"
            onClick={handleStop}
            className="p-2 rounded bg-red-900/40 hover:bg-red-900/60 border border-red-900/60 text-red-200"
            title="Parar"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim()}
            className={`p-2 rounded border disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${
              btwMode
                ? "bg-jp-gold-primary/15 hover:bg-jp-gold-primary/25 border-dashed border-jp-gold-primary/40 text-jp-gold-primary"
                : "bg-jp-gold-primary/20 hover:bg-jp-gold-primary/30 border-jp-gold-primary/40 text-jp-gold-primary"
            }`}
            title={btwMode ? "Enviar como /btw (Enter)" : "Enviar (Enter)"}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  if (!expanded) return panel;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={() => setExpanded(false)}
    >
      <div
        className="flex flex-col bg-jp-ink border border-jp-divider rounded-xl shadow-2xl overflow-hidden"
        style={{ width: "min(900px, 90vw)", height: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {panel}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }): React.ReactNode {
  const isUser = message.role === "user";
  const isBtw = message.kind === "btw";

  // /btw vive em tom dourado mais apagado e borda tracejada — sinaliza
  // visualmente que é uma sidequest paralela, separada do fio principal.
  const bubbleColor = isBtw
    ? isUser
      ? "bg-jp-gold-primary/6 border border-dashed border-jp-gold-primary/25 text-jp-fg/85"
      : "bg-jp-surface-2/30 border border-dashed border-jp-gold-primary/20 text-jp-fg/85"
    : isUser
      ? "bg-jp-gold-primary/15 border border-jp-gold-primary/30 text-jp-fg"
      : "bg-jp-surface-2/70 border border-jp-divider-soft text-jp-fg";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded px-2 py-1.5 text-xs break-words chat-md ${bubbleColor}`}
        title={isBtw ? "/btw — sidequest paralela (não escreve no JSONL principal)" : undefined}
      >
        {isBtw && (
          <div className="text-[9px] font-mono uppercase tracking-wider text-jp-gold-primary/60 mb-0.5">
            /btw
          </div>
        )}
        {message.tools && message.tools.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {message.tools.map((t, i) => (
              <span
                key={`${t.id}-${i}`}
                className={`text-[9px] font-mono px-1 py-0.5 rounded border ${
                  t.status === "running"
                    ? "border-jp-gold-primary/40 text-jp-gold-primary animate-pulse"
                    : "border-jp-divider-soft text-jp-fg-dim"
                }`}
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={{
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-jp-gold-primary underline hover:opacity-80"
              >
                {children}
              </a>
            ),
            code: ({ className, children, ...props }) => {
              const isBlock = className?.includes("language-");
              if (isBlock) {
                return (
                  <pre className="my-1 p-2 rounded bg-black/40 border border-jp-divider-soft overflow-x-auto">
                    <code className="font-mono text-[11px]" {...props}>
                      {children}
                    </code>
                  </pre>
                );
              }
              return (
                <code
                  className="font-mono text-[11px] px-1 py-px rounded bg-black/30 border border-jp-divider-soft"
                  {...props}
                >
                  {children}
                </code>
              );
            },
          }}
        >
          {message.text}
        </ReactMarkdown>
        {message.streaming && (
          <span className="inline-block w-1.5 h-3 ml-0.5 bg-jp-gold-primary/60 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}
