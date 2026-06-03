"use client";

import {
  ChevronUp,
  History,
  Maximize2,
  Minimize2,
  Plus,
  Send,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { usePreferencesStore } from "@/stores/preferencesStore";
import { useGameStore } from "@/stores/gameStore";

const API_BASE = "http://localhost:8000/api/v1/chat";
const PAGE_SIZE = 20;

type Role = "user" | "assistant";

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
}

type ServerEvent =
  | { type: "meta"; session_id: string; is_new: boolean }
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
  const tools: ToolCall[] = (m.tools ?? []).map((t) => ({
    id: t.id ?? newId(),
    name: t.name ?? "tool",
    status: "done",
  }));
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    tools: tools.length ? tools : undefined,
    createdAt: m.created_at,
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

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || isStreaming) return;

    const sessionId = thread?.id ?? null;
    const userMsg: ChatMessage = { id: newId(), role: "user", text: prompt };
    const assistantMsg: ChatMessage = {
      id: newId(),
      role: "assistant",
      text: "",
      streaming: true,
      tools: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setError(null);
    setIsStreaming(true);

    // Espelha o turno no escritório: Pedro fala o prompt (balão sobre o
    // avatar do user), Claude entra em "recebendo" e ainda sem balão. O
    // balão do Claude é preenchido conforme o stream chega.
    const store = useGameStore.getState();
    store.setUserAvatarBubble("pedro", prompt);
    store.updateBossBackendState("receiving");
    store.setBossBubbleContent(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          session_id: sessionId,
          is_new: sessionId === null,
          model: claudeModel,
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
              processEvent(ev, assistantMsg.id, prompt);
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
      setIsStreaming(false);
      abortRef.current = null;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, streaming: false } : m,
        ),
      );
      // Stream encerrou: tira o estado de "recebendo" mas deixa o balão
      // visível até o usuário dispensar (clique no balão ou tecla X).
      useGameStore.getState().updateBossBackendState("idle");
    }
  }, [input, isStreaming, thread, claudeModel]);

  const processEvent = useCallback(
    (ev: ServerEvent, assistantId: string, originalPrompt: string) => {
      if (ev.type === "meta") {
        // Cria thread "stub" local enquanto o backend grava no Supabase
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
          // Espelha o texto incremental no balão flutuante do Claude.
          if (nextText) {
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
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    tools: [
                      ...(m.tools ?? []),
                      { id: toolId, name: toolName, status: "running" },
                    ],
                  }
                : m,
            ),
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
      <div className="border-t border-jp-divider-soft p-2 flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={isStreaming}
          placeholder="Pergunte ao Claude…  (Enter envia, Shift+Enter quebra linha)"
          className="flex-1 resize-none bg-jp-surface-2/50 border border-jp-divider-soft rounded px-2 py-1.5 text-xs text-jp-fg placeholder:text-jp-fg-dim/50 focus:outline-none focus:border-jp-gold-primary/60 disabled:opacity-50"
        />
        {isStreaming ? (
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
            className="p-2 rounded bg-jp-gold-primary/20 hover:bg-jp-gold-primary/30 border border-jp-gold-primary/40 text-jp-gold-primary disabled:opacity-30 disabled:cursor-not-allowed"
            title="Enviar (Enter)"
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
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[88%] rounded px-2 py-1.5 text-xs whitespace-pre-wrap break-words ${
          isUser
            ? "bg-jp-gold-primary/15 border border-jp-gold-primary/30 text-jp-fg"
            : "bg-jp-surface-2/70 border border-jp-divider-soft text-jp-fg"
        }`}
      >
        {message.tools && message.tools.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {message.tools.map((t) => (
              <span
                key={t.id}
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
        {message.text}
        {message.streaming && (
          <span className="inline-block w-1.5 h-3 ml-0.5 bg-jp-gold-primary/60 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}
