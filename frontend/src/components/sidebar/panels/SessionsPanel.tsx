"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  BarChart3,
  ChevronDown,
  ChevronRight,
  FolderInput,
  LayoutGrid,
  Monitor,
  Pin,
  PinOff,
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
import { useNavigationStore } from "@/stores/navigationStore";
import { useSessionsBrowserStore } from "@/stores/sessionsBrowserStore";
import { usePinnedFoldersStore } from "@/stores/pinnedFoldersStore";
import {
  getProjectKey,
  groupSessionsByTimeBuckets,
  isResumableSession,
  SESSION_BUCKETS,
  type SessionBucketKey,
  type SessionSortDirection,
} from "@/utils/sessionGrouping";
import { buildFolderChips, filterSessionsByChip } from "@/utils/folderChips";
import { useSessionsPanelContext } from "./SessionsPanelContext";

const CHIP_STORAGE_KEY = "session.folderFilter.v1";
const SORT_STORAGE_KEY = "session.sortDirection.v1";
const COLLAPSED_BUCKETS_STORAGE_KEY = "session.collapsedBuckets.v1";

const EMPTY_FLOORS: ReadonlyArray<never> = [];

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
  const [floorMenuFor, setFloorMenuFor] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const buildingFloors =
    useNavigationStore((s) => s.buildingConfig?.floors) ?? EMPTY_FLOORS;
  const lastAutoExpandedSessionRef = useRef<string | null>(null);

  // Bucket collapse state — default-collapsed buckets (e.g. "Anteriores")
  // start in the set; user toggles persist to localStorage.
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<SessionBucketKey>>(
    () => new Set(SESSION_BUCKETS.filter((b) => b.collapsedByDefault).map((b) => b.key)),
  );

  // Folder filter state — chip ID is persisted to survive reloads.
  const pinnedFolders = usePinnedFoldersStore((s) => s.folders);
  const isPinnedLoaded = usePinnedFoldersStore((s) => s.isLoaded);
  const loadPinned = usePinnedFoldersStore((s) => s.load);
  const [activeChipId, setActiveChipIdState] = useState<string>("all");
  const [sortDirection, setSortDirectionState] =
    useState<SessionSortDirection>("desc");

  // Hydrate active chip from localStorage on mount.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CHIP_STORAGE_KEY);
      if (saved) setActiveChipIdState(saved);
      const savedSort = window.localStorage.getItem(SORT_STORAGE_KEY);
      if (savedSort === "asc" || savedSort === "desc" || savedSort === "size") {
        setSortDirectionState(savedSort);
      }
      const savedCollapsed = window.localStorage.getItem(
        COLLAPSED_BUCKETS_STORAGE_KEY,
      );
      if (savedCollapsed) {
        const parsed = JSON.parse(savedCollapsed) as string[];
        const validKeys = new Set(SESSION_BUCKETS.map((b) => b.key));
        setCollapsedBuckets(
          new Set(parsed.filter((k): k is SessionBucketKey => validKeys.has(k as SessionBucketKey))),
        );
      }
    } catch {
      // localStorage may be disabled.
    }
  }, []);

  const toggleBucket = useCallback((key: SessionBucketKey) => {
    setCollapsedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(
          COLLAPSED_BUCKETS_STORAGE_KEY,
          JSON.stringify([...next]),
        );
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const toggleSortDirection = useCallback(() => {
    setSortDirectionState((prev) => {
      // Ciclo: recentes → antigas → maiores → recentes
      const next: SessionSortDirection =
        prev === "desc" ? "asc" : prev === "asc" ? "size" : "desc";
      try {
        window.localStorage.setItem(SORT_STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
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

  const handleTogglePin = useCallback(async (id: string) => {
    try {
      await fetch(`http://localhost:8000/api/v1/sessions/${id}/pin`, {
        method: "POST",
      });
      window.dispatchEvent(new CustomEvent("sessions-refresh"));
    } catch {
      // Silent — 5s poll will catch up.
    }
  }, []);

  const handleToggleArchive = useCallback(async (id: string) => {
    try {
      await fetch(`http://localhost:8000/api/v1/sessions/${id}/archive`, {
        method: "POST",
      });
      window.dispatchEvent(new CustomEvent("sessions-refresh"));
    } catch {
      // Silent — 5s poll will catch up.
    }
  }, []);

  const handleMoveToFloor = useCallback(
    async (
      sessionId: string,
      floorId: string | null,
      roomId: string | null,
    ) => {
      try {
        await fetch(`http://localhost:8000/api/v1/sessions/${sessionId}/floor`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ floor_id: floorId, room_id: roomId }),
        });
        window.dispatchEvent(new CustomEvent("sessions-refresh"));
      } catch {
        // Silent — 5s poll will catch up.
      } finally {
        setFloorMenuFor(null);
      }
    },
    [],
  );

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const buckets = groupSessionsByTimeBuckets(filteredSessions, sortDirection);

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
            onClick={toggleSortDirection}
            className="p-1 text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-2 rounded transition-colors"
            title={
              sortDirection === "desc"
                ? "Ordenando: recentes primeiro (clique → antigas)"
                : sortDirection === "asc"
                  ? "Ordenando: antigas primeiro (clique → maiores)"
                  : "Ordenando: maiores primeiro (clique → recentes)"
            }
            aria-label="Alternar ordenação"
          >
            {sortDirection === "desc" ? (
              <ArrowDownWideNarrow size={11} />
            ) : sortDirection === "asc" ? (
              <ArrowUpWideNarrow size={11} />
            ) : (
              <BarChart3 size={11} />
            )}
          </button>
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
          <div className="flex flex-col gap-2">
            {SESSION_BUCKETS.filter((b) => buckets.has(b.key)).map((bucketMeta) => {
              const bucketGroups = buckets.get(bucketMeta.key)!;
              const isBucketCollapsed = collapsedBuckets.has(bucketMeta.key);
              const bucketSessionCount = [...bucketGroups.values()].reduce(
                (sum, list) => sum + list.length,
                0,
              );

              const isUrgent = bucketMeta.highlight === "urgent";
              return (
                <div key={bucketMeta.key} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => toggleBucket(bucketMeta.key)}
                    className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      isUrgent
                        ? "text-amber-300 hover:text-amber-200 animate-pulse"
                        : "text-jp-fg-dim hover:text-jp-gold"
                    }`}
                  >
                    {isBucketCollapsed ? (
                      <ChevronRight size={10} />
                    ) : (
                      <ChevronDown size={10} />
                    )}
                    <span>{bucketMeta.icon}</span>
                    <span>{bucketMeta.label}</span>
                    <span className="text-jp-fg-dim/60 font-mono normal-case font-normal">
                      {bucketSessionCount}
                    </span>
                  </button>

                  {!isBucketCollapsed && (
                    <div className="flex flex-col gap-1">
                      {[...bucketGroups.entries()].map(([projectKey, groupSessions]) => {
                        const hasActive = groupSessions.some(
                          (s) => s.status === "active",
                        );
                        const isExpanded = expandedGroups.has(
                          `${bucketMeta.key}::${projectKey}`,
                        );
                        const primary = groupSessions[0];
                        const rest = groupSessions.slice(1);

                        return (
                <div key={`${bucketMeta.key}::${projectKey}`} className="flex flex-col">
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
                          void handleTogglePin(primary.id);
                        }}
                        className={`p-1 hover:bg-jp-surface-2 rounded transition-colors ${
                          primary.isPinned
                            ? "text-jp-gold opacity-100"
                            : "text-jp-fg-dim hover:text-jp-gold opacity-0 group-hover:opacity-100"
                        }`}
                        title={primary.isPinned ? "Desafixar" : "Fixar"}
                        aria-label={
                          primary.isPinned
                            ? `Desafixar ${primary.id}`
                            : `Fixar ${primary.id}`
                        }
                      >
                        {primary.isPinned ? (
                          <PinOff size={12} />
                        ) : (
                          <Pin size={12} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleArchive(primary.id);
                        }}
                        className="p-1 text-jp-fg-dim hover:text-sky-400 hover:bg-jp-surface-2 rounded transition-colors opacity-0 group-hover:opacity-100"
                        title={primary.archivedAt ? "Desarquivar" : "Arquivar"}
                        aria-label={
                          primary.archivedAt
                            ? `Desarquivar ${primary.id}`
                            : `Arquivar ${primary.id}`
                        }
                      >
                        {primary.archivedAt ? (
                          <ArchiveRestore size={12} />
                        ) : (
                          <Archive size={12} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFloorMenuFor(
                            floorMenuFor === primary.id ? null : primary.id,
                          );
                        }}
                        className={`p-1 hover:bg-jp-surface-2 rounded transition-colors ${
                          primary.floorPinned
                            ? "text-jp-gold opacity-100"
                            : "text-jp-fg-dim hover:text-jp-gold opacity-0 group-hover:opacity-100"
                        }`}
                        title={
                          primary.floorPinned
                            ? "Andar/pasta fixados manualmente — clique pra mudar"
                            : "Mover pra outro andar ou pasta"
                        }
                        aria-label={`Mover ${primary.id} pra outro andar ou pasta`}
                      >
                        <FolderInput size={12} />
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
                    {floorMenuFor === primary.id && (
                      <div
                        className="mt-2 -mx-1 px-2 py-1.5 bg-jp-surface-3 border border-jp-divider rounded-md flex flex-col gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-[9px] uppercase tracking-wide text-jp-fg-dim font-bold pb-1">
                          Mover pra
                        </div>
                        {buildingFloors.map((f) => {
                          const isCurrentFloor = primary.floorId === f.id;
                          const firstRoomId = f.rooms[0]?.id ?? null;
                          return (
                            <div key={f.id} className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleMoveToFloor(
                                    primary.id,
                                    f.id,
                                    firstRoomId,
                                  )
                                }
                                className={`flex items-center gap-1.5 px-2 py-1 text-[11px] rounded text-left transition-colors ${
                                  isCurrentFloor
                                    ? "bg-jp-surface-2 text-jp-gold"
                                    : "text-jp-fg hover:bg-jp-surface-2 hover:text-jp-gold"
                                }`}
                                title={`Mover pro andar ${f.name} (primeira pasta)`}
                              >
                                <span>{f.icon}</span>
                                <span className="flex-1 font-semibold">
                                  {f.name}
                                </span>
                                {isCurrentFloor && (
                                  <span className="text-[9px] text-jp-fg-dim">
                                    atual
                                  </span>
                                )}
                              </button>
                              {f.rooms.length > 0 && (
                                <div className="flex flex-col gap-0.5 pl-3 border-l border-jp-divider-soft ml-2">
                                  {f.rooms.map((r) => {
                                    const isCurrentRoom =
                                      isCurrentFloor && primary.roomId === r.id;
                                    return (
                                      <button
                                        key={r.id}
                                        type="button"
                                        disabled={isCurrentRoom}
                                        onClick={() =>
                                          void handleMoveToFloor(
                                            primary.id,
                                            f.id,
                                            r.id,
                                          )
                                        }
                                        className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded text-left transition-colors ${
                                          isCurrentRoom
                                            ? "bg-jp-surface-2 text-jp-gold cursor-default"
                                            : "text-jp-fg-dim hover:bg-jp-surface-2 hover:text-jp-gold"
                                        }`}
                                        title={r.repoName}
                                      >
                                        <span className="text-jp-fg-dim">
                                          ↳
                                        </span>
                                        <span className="flex-1 truncate font-mono">
                                          {r.repoName}
                                        </span>
                                        {isCurrentRoom && (
                                          <span className="text-[9px] text-jp-fg-dim">
                                            atual
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="border-t border-jp-divider-soft my-1" />
                        <button
                          type="button"
                          onClick={() =>
                            void handleMoveToFloor(primary.id, null, null)
                          }
                          className="px-2 py-1 text-[10px] text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-2 rounded text-left italic transition-colors"
                          title="Volta o andar pro mapeamento automático por pasta"
                        >
                          ↺ Auto (mapeia pela pasta)
                        </button>
                      </div>
                    )}
                  </div>

                  {rest.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleGroup(`${bucketMeta.key}::${projectKey}`)}
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
                                  void handleTogglePin(session.id);
                                }}
                                className={`p-0.5 hover:bg-jp-surface-2 rounded transition-colors ${
                                  session.isPinned
                                    ? "text-jp-gold opacity-100"
                                    : "text-jp-fg-dim hover:text-jp-gold opacity-0 group-hover:opacity-100"
                                }`}
                                title={session.isPinned ? "Desafixar" : "Fixar"}
                                aria-label={
                                  session.isPinned
                                    ? `Desafixar ${session.id}`
                                    : `Fixar ${session.id}`
                                }
                              >
                                {session.isPinned ? (
                                  <PinOff size={10} />
                                ) : (
                                  <Pin size={10} />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleToggleArchive(session.id);
                                }}
                                className="p-0.5 text-jp-fg-dim hover:text-sky-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                                title={
                                  session.archivedAt ? "Desarquivar" : "Arquivar"
                                }
                                aria-label={
                                  session.archivedAt
                                    ? `Desarquivar ${session.id}`
                                    : `Arquivar ${session.id}`
                                }
                              >
                                {session.archivedAt ? (
                                  <ArchiveRestore size={10} />
                                ) : (
                                  <Archive size={10} />
                                )}
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
              );
            })}
          </div>
        )}
      </div>
      <SessionsBrowserModal />
    </div>
  );
}
