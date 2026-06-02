"use client";

import {
  ChevronDown,
  ChevronRight,
  Play,
  PlayCircle,
  Radio,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR as dateFnsPtBR, es as dateFnsEs } from "date-fns/locale";
import { useCallback, useRef, useState } from "react";

import type { Session } from "@/hooks/useSessions";
import { useTranslation } from "@/hooks/useTranslation";
import { useSessionsPanelContext } from "./SessionsPanelContext";

// ============================================================================
// HELPERS (duplicated from old SessionSidebar — keep behavior identical)
// ============================================================================

function getProjectKey(session: Session): string {
  if (session.projectName) return session.projectName;
  if (session.projectRoot)
    return session.projectRoot.split("/").pop() ?? "unknown";
  return "unknown";
}

function groupSessionsByProject(sessions: Session[]): Map<string, Session[]> {
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = getProjectKey(s);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }
  const sorted = [...groups.entries()].sort(([, a], [, b]) => {
    const aActive = a.some((s) => s.status === "active");
    const bActive = b.some((s) => s.status === "active");
    if (aActive && !bActive) return -1;
    if (bActive && !aActive) return 1;
    const aNewest = Math.max(...a.map((s) => new Date(s.updatedAt).getTime()));
    const bNewest = Math.max(...b.map((s) => new Date(s.updatedAt).getTime()));
    return bNewest - aNewest;
  });
  return new Map(sorted);
}

// ============================================================================
// EDITABLE NAME
// ============================================================================

function EditableName({
  session,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
  className,
}: {
  session: Session;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (name: string) => void;
  onCancel: () => void;
  className?: string;
}): React.ReactNode {
  const [draft, setDraft] = useState(
    () => session.displayName ?? getProjectKey(session),
  );
  const committedRef = useRef(false);

  if (isEditing) {
    return (
      <input
        type="text"
        value={draft}
        autoFocus
        maxLength={64}
        className="text-xs font-bold flex-1 bg-jp-surface-3 text-white px-1 py-0 rounded outline-none border border-purple-500"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            committedRef.current = true;
            onCommit(draft);
          } else if (e.key === "Escape") {
            e.preventDefault();
            committedRef.current = true;
            onCancel();
          }
        }}
        onBlur={() => {
          if (!committedRef.current) onCommit(draft);
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  const displayName = session.displayName ?? getProjectKey(session);
  return (
    <span
      className={className}
      onDoubleClick={(e) => {
        e.stopPropagation();
        committedRef.current = false;
        setDraft(session.displayName ?? getProjectKey(session));
        onStartEdit();
      }}
      title={session.displayName ? "Double-click to rename" : undefined}
    >
      {displayName}
    </span>
  );
}

// ============================================================================
// MAIN PANEL CONTENT
// ============================================================================

export function SessionsPanel(): React.ReactNode {
  const {
    sessions,
    sessionsLoading,
    sessionId,
    onSessionSelect,
    onDeleteSession,
    onRenameSession,
  } = useSessionsPanelContext();
  const { t, language } = useTranslation();
  const dateFnsLocale =
    language === "pt-BR"
      ? dateFnsPtBR
      : language === "es"
        ? dateFnsEs
        : undefined;

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshNames = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetch("http://localhost:8000/api/v1/sessions/refresh-names", {
        method: "POST",
      });
      window.dispatchEvent(new CustomEvent("sessions-refresh"));
    } catch {
      // Silent failure — the 5s poll will eventually catch up.
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const handleResume = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(
          `http://localhost:8000/api/v1/sessions/${id}/resume`,
          { method: "POST" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { detail?: string }
            | null;
          window.alert(
            `${t("sessions.resumeFailed")}: ${body?.detail ?? res.statusText}`,
          );
        }
      } catch (err) {
        window.alert(
          `${t("sessions.resumeFailed")}: ${(err as Error).message}`,
        );
      }
    },
    [t],
  );

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const groups = groupSessionsByProject(sessions);

  return (
    <div className="flex flex-col min-h-0 flex-grow">
      <div className="px-3 py-1.5 text-[10px] text-jp-fg-dim font-mono border-b border-jp-divider-soft flex-shrink-0 flex items-center justify-between gap-2">
        <span>{sessions.length} sessões</span>
        <button
          type="button"
          onClick={handleRefreshNames}
          disabled={isRefreshing}
          className="p-1 text-jp-fg-dim hover:text-purple-300 hover:bg-jp-surface-2 rounded transition-colors disabled:opacity-50 disabled:cursor-wait"
          title={t("sessions.refreshNames")}
          aria-label={t("sessions.refreshNames")}
        >
          <RefreshCw
            size={11}
            className={isRefreshing ? "animate-spin" : ""}
          />
        </button>
      </div>
      <div className="overflow-y-auto flex-grow p-2">
        {sessionsLoading && sessions.length === 0 ? (
          <div className="p-4 text-center text-jp-fg-dim text-xs italic">
            {t("sessions.loading")}
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-jp-fg-dim text-xs italic">
            {t("sessions.noSessions")}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {[...groups.entries()].map(([projectKey, groupSessions]) => {
              const hasActive = groupSessions.some(
                (s) => s.status === "active",
              );
              const isActiveSelected = groupSessions.some(
                (s) => s.id === sessionId,
              );
              const isExpanded =
                expandedGroups.has(projectKey) || isActiveSelected;
              const primary = groupSessions[0];
              const rest = groupSessions.slice(1);

              return (
                <div key={projectKey} className="flex flex-col">
                  <div
                    role="button"
                    tabIndex={0}
                    className={`group relative w-full px-3 py-2 text-left transition-colors cursor-pointer rounded-md ${
                      primary.id === sessionId
                        ? "bg-purple-500/20 border-l-2 border-purple-500"
                        : "hover:bg-jp-surface-2/50"
                    }`}
                    onClick={() => onSessionSelect(primary.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSessionSelect(primary.id);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {hasActive ? (
                        <Radio
                          size={10}
                          className="text-emerald-400 animate-pulse flex-shrink-0"
                        />
                      ) : (
                        <PlayCircle
                          size={10}
                          className="text-jp-fg-dim flex-shrink-0"
                        />
                      )}
                      <EditableName
                        session={primary}
                        isEditing={editingSessionId === primary.id}
                        onStartEdit={() => setEditingSessionId(primary.id)}
                        onCommit={(name) => {
                          setEditingSessionId(null);
                          onRenameSession(primary.id, name);
                        }}
                        onCancel={() => setEditingSessionId(null)}
                        className={`text-xs font-bold truncate flex-1 ${
                          primary.id === sessionId
                            ? "text-purple-300"
                            : "text-jp-fg"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleResume(primary.id);
                        }}
                        className="p-1 text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-2 rounded transition-colors opacity-0 group-hover:opacity-100"
                        title={t("sessions.resumeSession")}
                        aria-label={`${t("sessions.resumeSession")} ${primary.id}`}
                      >
                        <Play size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(primary);
                        }}
                        className="p-1 text-jp-fg-dim hover:text-rose-400 hover:bg-jp-surface-2 rounded transition-colors opacity-0 group-hover:opacity-100"
                        aria-label={`${t("sessions.deleteSession")} ${primary.id}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="text-[10px] text-jp-fg-dim font-mono truncate mb-1">
                      {primary.id}
                    </div>
                    <div className="flex justify-between text-[10px] text-jp-fg-dim">
                      <span>
                        {t("sessions.events", { count: primary.eventCount })}
                      </span>
                      <span>
                        {formatDistanceToNow(new Date(primary.updatedAt), {
                          addSuffix: true,
                          locale: dateFnsLocale,
                        })}
                      </span>
                    </div>
                  </div>

                  {rest.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleGroup(projectKey)}
                        className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-jp-fg-dim hover:text-jp-fg-muted font-mono transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown size={10} />
                        ) : (
                          <ChevronRight size={10} />
                        )}
                        {rest.length} older session
                        {rest.length !== 1 ? "s" : ""}
                      </button>

                      {isExpanded &&
                        rest.map((session) => (
                          <div
                            role="button"
                            tabIndex={0}
                            key={session.id}
                            className={`group relative w-full px-3 py-1.5 pl-7 text-left transition-colors cursor-pointer rounded-md ${
                              session.id === sessionId
                                ? "bg-purple-500/20 border-l-2 border-purple-500"
                                : "hover:bg-jp-surface-2/50"
                            }`}
                            onClick={() => onSessionSelect(session.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSessionSelect(session.id);
                              }
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <PlayCircle
                                size={8}
                                className="text-jp-fg-dim flex-shrink-0"
                              />
                              <span className="text-[10px] text-jp-fg-dim font-mono truncate flex-1">
                                {session.displayName ?? session.id.slice(0, 12)}
                              </span>
                              <span className="text-[10px] text-jp-fg-dim">
                                {formatDistanceToNow(
                                  new Date(session.updatedAt),
                                  {
                                    addSuffix: true,
                                    locale: dateFnsLocale,
                                  },
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleResume(session.id);
                                }}
                                className="p-0.5 text-jp-fg-dim hover:text-jp-gold rounded transition-colors opacity-0 group-hover:opacity-100"
                                title={t("sessions.resumeSession")}
                                aria-label={`${t("sessions.resumeSession")} ${session.id}`}
                              >
                                <Play size={10} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteSession(session);
                                }}
                                className="p-0.5 text-jp-fg-dim hover:text-rose-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                                aria-label={`${t("sessions.deleteSession")} ${session.id}`}
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </div>
                        ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
