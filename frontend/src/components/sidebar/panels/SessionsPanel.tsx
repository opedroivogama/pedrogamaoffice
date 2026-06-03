"use client";

import {
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Monitor,
  Play,
  PlayCircle,
  Radio,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR as dateFnsPtBR, es as dateFnsEs } from "date-fns/locale";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import SessionsBrowserModal from "@/components/overlay/SessionsBrowserModal";
import type { Session } from "@/hooks/useSessions";
import { useTranslation } from "@/hooks/useTranslation";
import { useSessionsBrowserStore } from "@/stores/sessionsBrowserStore";
import { usePinnedFoldersStore } from "@/stores/pinnedFoldersStore";
import {
  getProjectKey,
  groupSessionsByProject,
  isResumableSession,
} from "@/utils/sessionGrouping";
import { buildFolderChips, filterSessionsByChip } from "@/utils/folderChips";
import { useSessionsPanelContext } from "./SessionsPanelContext";

const CHIP_STORAGE_KEY = "session.folderFilter.v1";

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
  const lastAutoExpandedSessionRef = useRef<string | null>(null);

  // Folder filter state — chip ID is persisted to survive reloads.
  const pinnedFolders = usePinnedFoldersStore((s) => s.folders);
  const isPinnedLoaded = usePinnedFoldersStore((s) => s.isLoaded);
  const loadPinned = usePinnedFoldersStore((s) => s.load);
  const [activeChipId, setActiveChipIdState] = useState<string>("all");

  // Hydrate active chip from localStorage on mount.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CHIP_STORAGE_KEY);
      if (saved) setActiveChipIdState(saved);
    } catch {
      // localStorage may be disabled.
    }
  }, []);

  // Make sure the pinned-folders store is loaded once so we have its data
  // for chip derivation (the panel itself may be hidden when SessionsPanel
  // first mounts).
  useEffect(() => {
    if (!isPinnedLoaded) void loadPinned();
  }, [isPinnedLoaded, loadPinned]);

  const setActiveChipId = useCallback((id: string) => {
    setActiveChipIdState(id);
    try {
      window.localStorage.setItem(CHIP_STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const chips = useMemo(
    () => buildFolderChips({ sessions, pinnedFolders }),
    [sessions, pinnedFolders],
  );

  // Resolve the active chip; if the saved ID no longer exists (folder was
  // unpinned), fall back to "all" without clobbering the saved selection
  // — so re-pinning the folder restores the previous filter.
  const activeChip = useMemo(
    () => chips.find((c) => c.id === activeChipId) ?? chips[0] ?? null,
    [chips, activeChipId],
  );

  const filteredSessions = useMemo(
    () => filterSessionsByChip(sessions, activeChip, pinnedFolders),
    [sessions, activeChip, pinnedFolders],
  );

  // Auto-expande o grupo da sessão ativa só uma vez por sessionId,
  // permitindo que o usuário recolha manualmente depois.
  useEffect(() => {
    if (!sessionId) return;
    if (lastAutoExpandedSessionRef.current === sessionId) return;
    const active = sessions.find((s) => s.id === sessionId);
    if (!active) return;
    lastAutoExpandedSessionRef.current = sessionId;
    const key = getProjectKey(active);
    setExpandedGroups((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, [sessionId, sessions]);

  const openBrowser = useSessionsBrowserStore((s) => s.openModal);

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

  const handleFocusTerminal = useCallback(async (id: string) => {
    try {
      await fetch(`http://localhost:8000/api/v1/sessions/${id}/focus`, {
        method: "POST",
      });
    } catch {
      // Silent — focus failure isn't worth interrupting the user. The
      // worst case is the terminal window doesn't surface and they can
      // alt-tab manually.
    }
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const groups = groupSessionsByProject(filteredSessions);

  return (
    <div className="flex flex-col min-h-0 flex-grow">
      <div className="px-3 py-1.5 text-[10px] text-jp-fg-dim font-mono border-b border-jp-divider-soft flex-shrink-0 flex items-center justify-between gap-2">
        <span>
          {filteredSessions.length === sessions.length
            ? `${sessions.length} sessões`
            : `${filteredSessions.length} de ${sessions.length} sessões`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openBrowser}
            className="p-1 text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-2 rounded transition-colors"
            title={t("sessions.browserOpen")}
            aria-label={t("sessions.browserOpen")}
          >
            <LayoutGrid size={11} />
          </button>
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
      </div>

      {/* Folder filter chip bar — only render when there's something to
          filter by (a chip beyond "Todas"). */}
      {chips.length > 1 && (
        <div className="px-2 py-1.5 border-b border-jp-divider-soft flex-shrink-0 overflow-x-auto">
          <div className="flex items-center gap-1 whitespace-nowrap">
            {chips.map((chip) => {
              const isActive = chip.id === activeChip?.id;
              const isChild = chip.kind === "auto-child";
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setActiveChipId(chip.id)}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                    isActive
                      ? "border-jp-gold bg-jp-gold text-black"
                      : "border-jp-divider-soft bg-jp-surface-2/40 text-jp-fg-dim hover:text-jp-fg hover:border-jp-gold/50"
                  } ${isChild ? "italic font-medium" : ""}`}
                  title={
                    chip.kind === "auto-child" && chip.parentLabel
                      ? `Subpasta de ${chip.parentLabel}`
                      : chip.kind === "orphan"
                        ? "Sessões fora de qualquer pasta fixada"
                        : undefined
                  }
                >
                  <span>{chip.label}</span>
                  <span
                    className={`text-[9px] ${
                      isActive ? "text-black/70" : "text-jp-fg-dim/70"
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-y-auto flex-grow p-2">
        {sessionsLoading && sessions.length === 0 ? (
          <div className="p-4 text-center text-jp-fg-dim text-xs italic">
            {t("sessions.loading")}
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-jp-fg-dim text-xs italic">
            {t("sessions.noSessions")}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-4 text-center text-jp-fg-dim text-xs italic">
            Nenhuma sessão em {activeChip?.label ?? "este filtro"}.{" "}
            <button
              type="button"
              onClick={() => setActiveChipId("all")}
              className="text-jp-gold hover:underline"
            >
              Limpar filtro
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {[...groups.entries()].map(([projectKey, groupSessions]) => {
              const hasActive = groupSessions.some(
                (s) => s.status === "active",
              );
              const isExpanded = expandedGroups.has(projectKey);
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
                      {primary.status === "active" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleFocusTerminal(primary.id);
                          }}
                          className="p-1 text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-2 rounded transition-colors opacity-0 group-hover:opacity-100"
                          title={t("sessions.focusTerminal")}
                          aria-label={`${t("sessions.focusTerminal")} ${primary.id}`}
                        >
                          <Monitor size={12} />
                        </button>
                      )}
                      {(() => {
                        const resumable = isResumableSession(primary.id);
                        return (
                          <button
                            type="button"
                            disabled={!resumable}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!resumable) return;
                              void handleResume(primary.id);
                            }}
                            className={
                              resumable
                                ? "p-1 text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-2 rounded transition-colors opacity-0 group-hover:opacity-100"
                                : "p-1 text-jp-fg-dim rounded transition-colors opacity-0 group-hover:opacity-30 cursor-not-allowed"
                            }
                            title={
                              resumable
                                ? t("sessions.resumeSession")
                                : "Sessão externa — não pode ser retomada via claude"
                            }
                            aria-label={`${t("sessions.resumeSession")} ${primary.id}`}
                          >
                            <Play size={12} />
                          </button>
                        );
                      })()}
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
                        {t("sessions.olderSession", { count: rest.length })}
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
                              {session.status === "active" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleFocusTerminal(session.id);
                                  }}
                                  className="p-0.5 text-jp-fg-dim hover:text-jp-gold rounded transition-colors opacity-0 group-hover:opacity-100"
                                  title={t("sessions.focusTerminal")}
                                  aria-label={`${t("sessions.focusTerminal")} ${session.id}`}
                                >
                                  <Monitor size={10} />
                                </button>
                              )}
                              {(() => {
                                const resumable = isResumableSession(
                                  session.id,
                                );
                                return (
                                  <button
                                    type="button"
                                    disabled={!resumable}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!resumable) return;
                                      void handleResume(session.id);
                                    }}
                                    className={
                                      resumable
                                        ? "p-0.5 text-jp-fg-dim hover:text-jp-gold rounded transition-colors opacity-0 group-hover:opacity-100"
                                        : "p-0.5 text-jp-fg-dim rounded transition-colors opacity-0 group-hover:opacity-30 cursor-not-allowed"
                                    }
                                    title={
                                      resumable
                                        ? t("sessions.resumeSession")
                                        : "Sessão externa — não pode ser retomada via claude"
                                    }
                                    aria-label={`${t("sessions.resumeSession")} ${session.id}`}
                                  >
                                    <Play size={10} />
                                  </button>
                                );
                              })()}
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
      <SessionsBrowserModal />
    </div>
  );
}
