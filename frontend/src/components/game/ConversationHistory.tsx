/**
 * ConversationHistory - Chat-style view of user prompts, Claude responses,
 * thinking blocks, and tool calls.
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useGameStore, selectConversation } from "@/stores/gameStore";
import { format } from "date-fns";
import {
  MessageSquare,
  Wrench,
  Brain,
  ChevronDown,
  ChevronRight,
  Maximize2,
  X,
} from "lucide-react";
import type { ConversationEntry } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

// Tool icon mapping
function getToolIcon(toolName?: string): string {
  if (!toolName) return "⚙️";
  const icons: Record<string, string> = {
    Read: "📖",
    Write: "✏️",
    Edit: "✏️",
    Bash: "💻",
    Glob: "🔍",
    Grep: "🔍",
    Task: "👤",
    WebFetch: "🌐",
    WebSearch: "🌐",
    TodoWrite: "📋",
    TodoRead: "📋",
    NotebookEdit: "📓",
    Agent: "🤖",
  };
  return icons[toolName] ?? "⚙️";
}

function ThinkingEntry({ entry }: { entry: ConversationEntry }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.text.length > 200;
  const preview = isLong ? entry.text.slice(0, 200) + "…" : entry.text;

  return (
    <div className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-indigo-950/30 border border-indigo-800/30">
      <Brain size={12} className="text-indigo-400 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-widest text-indigo-500 mb-1 font-bold">
          {t("conversation.thinking")}
        </div>
        <p className="text-indigo-200/70 text-[11px] italic leading-relaxed whitespace-pre-wrap break-words">
          {expanded ? entry.text : preview}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-indigo-400 text-[10px] mt-1 hover:text-indigo-300 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronDown size={10} /> {t("conversation.collapse")}
              </>
            ) : (
              <>
                <ChevronRight size={10} /> {t("conversation.showMore")}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function ToolEntry({ entry }: { entry: ConversationEntry }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-jp-surface-2/40 border border-jp-divider/30">
      <Wrench size={10} className="text-amber-500/70 flex-shrink-0" />
      <span className="text-[10px] text-amber-400/80 font-mono flex-shrink-0">
        {getToolIcon(entry.toolName)} {entry.toolName}
      </span>
      <span className="text-jp-fg-muted text-[10px] truncate">{entry.text}</span>
    </div>
  );
}

function UserEntry({ entry }: { entry: ConversationEntry }) {
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[85%]">
        <div className="bg-cyan-900/40 border border-cyan-700/40 rounded-xl rounded-tr-sm px-3 py-2">
          <p className="text-cyan-100 text-[11px] whitespace-pre-wrap break-words leading-relaxed">
            {entry.text}
          </p>
        </div>
        <div className="text-jp-fg-dim text-[10px] mt-1 text-right">
          {format(new Date(entry.timestamp), "HH:mm:ss")}
        </div>
      </div>
    </div>
  );
}

function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="text-jp-fg text-[11px] leading-relaxed mb-1.5 last:mb-0 break-words">
            {children}
          </p>
        ),
        h1: ({ children }) => (
          <h1 className="text-jp-fg text-[13px] font-bold mt-2 mb-1 border-b border-jp-divider pb-0.5">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-jp-fg text-[12px] font-bold mt-2 mb-1">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-jp-fg text-[11px] font-bold mt-1.5 mb-0.5">
            {children}
          </h3>
        ),
        strong: ({ children }) => (
          <strong className="text-jp-fg font-bold">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="text-jp-fg italic">{children}</em>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.startsWith("language-");
          return isBlock ? (
            <code className="block bg-jp-surface-1 border border-jp-divider rounded px-2 py-1.5 text-[10px] font-mono text-emerald-300 overflow-x-auto whitespace-pre my-1">
              {children}
            </code>
          ) : (
            <code className="bg-jp-surface-1 border border-jp-divider rounded px-1 py-0.5 text-[10px] font-mono text-emerald-300">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-1 overflow-x-auto">{children}</pre>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside text-[11px] text-jp-fg space-y-0.5 my-1 pl-1">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside text-[11px] text-jp-fg space-y-0.5 my-1 pl-1">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-jp-divider pl-2 my-1 text-jp-fg-muted italic">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="border-jp-divider my-2" />,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function AssistantEntry({ entry }: { entry: ConversationEntry }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.text.length > 600;
  const preview = isLong ? entry.text.slice(0, 600) + "…" : entry.text;

  return (
    <div className="flex flex-col items-start max-w-[90%] w-full">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[9px] font-bold uppercase tracking-widest text-jp-fg-dim">
          {t("conversation.claude")}
        </span>
        {entry.agentId && entry.agentId !== "main" && (
          <span className="text-[9px] px-1.5 py-0.5 bg-blue-900/40 border border-blue-700/30 rounded text-blue-400 font-mono">
            @{entry.agentId.slice(0, 12)}
          </span>
        )}
      </div>
      <div className="bg-jp-surface-2/60 border border-jp-divider/50 rounded-xl rounded-tl-sm px-3 py-2 w-full">
        <MarkdownContent text={expanded ? entry.text : preview} />
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-jp-fg-muted text-[10px] mt-2 hover:text-jp-fg transition-colors"
          >
            {expanded ? (
              <>
                <ChevronDown size={10} /> {t("conversation.collapse")}
              </>
            ) : (
              <>
                <ChevronRight size={10} /> {t("conversation.showFullResponse")}
              </>
            )}
          </button>
        )}
      </div>
      <div className="text-jp-fg-dim text-[10px] mt-1">
        {format(new Date(entry.timestamp), "HH:mm:ss")}
      </div>
    </div>
  );
}

function ConversationEntries({
  visible,
  bottomRef,
}: {
  visible: ConversationEntry[];
  bottomRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {visible.map((entry) => {
        switch (entry.role) {
          case "user":
            return <UserEntry key={entry.id} entry={entry} />;
          case "assistant":
            return <AssistantEntry key={entry.id} entry={entry} />;
          case "thinking":
            return <ThinkingEntry key={entry.id} entry={entry} />;
          case "tool":
            return <ToolEntry key={entry.id} entry={entry} />;
          default:
            return null;
        }
      })}
      {bottomRef && <div ref={bottomRef} />}
    </>
  );
}

const PAGE_SIZE = 10;

function PaginatedConversation({
  entries,
  className,
  emptyMessage,
  scrollKey,
}: {
  entries: ConversationEntry[];
  className: string;
  emptyMessage: string;
  scrollKey?: string;
}) {
  const { t } = useTranslation();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevLenRef = useRef(entries.length);
  const pendingHeightRef = useRef<number | null>(null);

  // Reset pagination when the conversation collection changes identity
  // (e.g. switching sessions clears the array to []).
  useEffect(() => {
    if (entries.length < prevLenRef.current) {
      setVisibleCount(PAGE_SIZE);
      stickToBottomRef.current = true;
    }
    prevLenRef.current = entries.length;
  }, [entries.length]);

  // Reset on explicit scrollKey change (e.g. modal opens fresh).
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    stickToBottomRef.current = true;
  }, [scrollKey]);

  const sliced =
    visibleCount >= entries.length ? entries : entries.slice(-visibleCount);
  const hiddenCount = entries.length - sliced.length;
  const nextBatch = Math.min(PAGE_SIZE, hiddenCount);

  // Auto-scroll to bottom on new entries — only when user is at/near bottom.
  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries.length]);

  // Preserve scroll position after "load older" expands the list above.
  useEffect(() => {
    if (pendingHeightRef.current === null) return;
    const el = scrollRef.current;
    if (!el) {
      pendingHeightRef.current = null;
      return;
    }
    const delta = el.scrollHeight - pendingHeightRef.current;
    el.scrollTop = el.scrollTop + delta;
    pendingHeightRef.current = null;
  }, [visibleCount]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distFromBottom < 50;
  };

  const loadOlder = () => {
    const el = scrollRef.current;
    pendingHeightRef.current = el?.scrollHeight ?? 0;
    setVisibleCount((c) => c + PAGE_SIZE);
  };

  return (
    <div ref={scrollRef} className={className} onScroll={handleScroll}>
      {entries.length === 0 ? (
        <div className="text-jp-fg-dim italic p-4 text-center">
          {emptyMessage}
        </div>
      ) : (
        <>
          {hiddenCount > 0 && (
            <button
              onClick={loadOlder}
              className="w-full py-1.5 px-2 text-[10px] uppercase tracking-wider text-jp-fg-dim hover:text-jp-fg border border-jp-divider/50 hover:border-jp-divider rounded bg-jp-surface-2/40 hover:bg-jp-surface-2 transition-colors"
            >
              {t("conversation.loadOlder", { count: nextBatch })}
            </button>
          )}
          <ConversationEntries visible={sliced} bottomRef={bottomRef} />
        </>
      )}
    </div>
  );
}

export function ConversationHistory() {
  const { t } = useTranslation();
  const conversation = useGameStore(selectConversation);
  const [showTools, setShowTools] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const toolCount = conversation.filter((e) => e.role === "tool").length;
  const messageCount = conversation.filter(
    (e) => e.role === "user" || e.role === "assistant",
  ).length;
  const visible = showTools
    ? conversation
    : conversation.filter((e) => e.role !== "tool");

  // Close on Escape
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expanded]);

  const header = (onExpand?: () => void) => (
    <div className="bg-jp-surface-1 px-3 py-2 border-b border-jp-divider-soft flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2 text-jp-fg font-bold uppercase tracking-wider">
        <MessageSquare size={14} className="text-cyan-500" />
        {t("conversation.title")}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-jp-fg-dim">
          {t("conversation.msgs", { count: messageCount })}
        </span>
        <button
          onClick={() => setShowTools(!showTools)}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
            showTools
              ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
              : "bg-jp-surface-2 border-jp-divider text-jp-fg-dim hover:text-jp-fg"
          }`}
          title={
            showTools
              ? t("conversation.hideToolCalls")
              : t("conversation.showToolCalls")
          }
        >
          <Wrench size={9} />
          {toolCount}
        </button>
        {onExpand ? (
          <button
            onClick={onExpand}
            className="p-0.5 rounded text-jp-fg-dim hover:text-jp-fg hover:bg-jp-surface-2 transition-colors"
            title={t("conversation.expandConversation")}
          >
            <Maximize2 size={12} />
          </button>
        ) : (
          <button
            onClick={() => setExpanded(false)}
            className="p-0.5 rounded text-jp-fg-dim hover:text-jp-fg hover:bg-jp-surface-2 transition-colors"
            title={t("conversation.close")}
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Inline panel */}
      <div className="flex flex-col h-full bg-jp-ink border border-jp-divider-soft rounded-lg overflow-hidden font-mono text-xs">
        {header(() => setExpanded(true))}
        <PaginatedConversation
          entries={visible}
          className="flex-grow overflow-y-auto p-3 space-y-2"
          emptyMessage={t("conversation.noConversation")}
        />
      </div>

      {/* Expanded modal */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        >
          <div
            className="flex flex-col bg-jp-ink border border-jp-divider rounded-xl shadow-2xl font-mono text-xs overflow-hidden"
            style={{ width: "min(900px, 90vw)", height: "85vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {header()}
            <PaginatedConversation
              entries={visible}
              className="flex-grow overflow-y-auto p-4 space-y-2"
              emptyMessage={t("conversation.noConversation")}
              scrollKey="modal"
            />
          </div>
        </div>
      )}
    </>
  );
}
