"use client";

import {
  ChevronDown,
  ChevronRight,
  Clock,
  History,
  Play,
  Radio,
  Search,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR as dateFnsPtBR, es as dateFnsEs } from "date-fns/locale";
import { useCallback, useEffect, useMemo, useState } from "react";

import Modal from "@/components/overlay/Modal";
import { useSessionsPanelContext } from "@/components/sidebar/panels/SessionsPanelContext";
import { useTranslation } from "@/hooks/useTranslation";
import { useNavigationStore } from "@/stores/navigationStore";
import {
  type PeriodFilter,
  type StatusFilter,
  useSessionsBrowserStore,
} from "@/stores/sessionsBrowserStore";
import {
  getProjectKey,
  groupSessionsByProject,
  isResumableSession,
} from "@/utils/sessionGrouping";
import type { Session } from "@/hooks/useSessions";

// ============================================================================
// Helpers
// ============================================================================

function withinPeriod(updatedAt: string, period: PeriodFilter): boolean {
  if (period === "all") return true;
  const age = Date.now() - new Date(updatedAt).getTime();
  const limit = period === "24h" ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
  return age <= limit;
}

function matchesSearch(session: Session, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  const hay = `${session.displayName ?? ""} ${session.projectName ?? ""} ${
    session.label ?? ""
  } ${session.id}`.toLowerCase();
  return hay.includes(q);
}

// ============================================================================
// Component
// ============================================================================

export default function SessionsBrowserModal(): React.ReactNode {
  const { t, language } = useTranslation();
  const dateFnsLocale =
    language === "pt-BR"
      ? dateFnsPtBR
      : language === "es"
        ? dateFnsEs
        : undefined;

  // Store: open/close + filters
  const isOpen = useSessionsBrowserStore((s) => s.isOpen);
  const closeModal = useSessionsBrowserStore((s) => s.closeModal);
  const hydrate = useSessionsBrowserStore((s) => s.hydrate);
  const isHydrated = useSessionsBrowserStore((s) => s.isHydrated);
  const status = useSessionsBrowserStore((s) => s.status);
  const period = useSessionsBrowserStore((s) => s.period);
  const floor = useSessionsBrowserStore((s) => s.floor);
  const search = useSessionsBrowserStore((s) => s.search);
  const setStatus = useSessionsBrowserStore((s) => s.setStatus);
  const setPeriod = useSessionsBrowserStore((s) => s.setPeriod);
  const setFloor = useSessionsBrowserStore((s) => s.setFloor);
  const setSearch = useSessionsBrowserStore((s) => s.setSearch);

  // Sessions data + actions from the panel context
  const { sessions, sessionId, onSessionSelect, onDeleteSession } =
    useSessionsPanelContext();

  // Floors list for the filter dropdown
  const buildingConfig = useNavigationStore((s) => s.buildingConfig);
  const sortedFloors = useMemo(
    () =>
      [...(buildingConfig?.floors ?? [])].sort(
        (a, b) => b.floorNumber - a.floorNumber,
      ),
    [buildingConfig],
  );

  // Hydrate persisted filters on first open
  useEffect(() => {
    if (isOpen && !isHydrated) void hydrate();
  }, [isOpen, isHydrated, hydrate]);

  // Filter pipeline
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (status === "active" && s.status !== "active") return false;
      if (status === "completed" && s.status === "active") return false;
      if (!withinPeriod(s.updatedAt, period)) return false;
      if (floor !== "all" && s.floorId !== floor) return false;
      if (!matchesSearch(s, search)) return false;
      return true;
    });
  }, [sessions, status, period, floor, search]);

  const groups = useMemo(
    () => groupSessionsByProject(filteredSessions),
    [filteredSessions],
  );

  // Collapsed-by-default; auto-expand the group of the currently selected session
  // when the modal opens. User toggles after that win until the modal reopens.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!isOpen) return;
    const currentSession = sessions.find((s) => s.id === sessionId);
    if (!currentSession) return;
    const key = getProjectKey(currentSession);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedGroups(new Set([key]));
  }, [isOpen, sessions, sessionId]);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Resume handler (same shape as SessionsPanel)
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

  const handlePick = useCallback(
    (id: string) => {
      // Select but do NOT close — the user is browsing.
      void onSessionSelect(id);
    },
    [onSessionSelect],
  );

  // ----- Render
  const groupEntries = [...groups.entries()];

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title={t("sessions.browserTitle")}
      size="lg"
      maximizable
    >
      <div className="flex flex-col gap-4 h-full">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-grow min-w-[200px]">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-jp-fg-dim"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("sessions.searchPlaceholder")}
              className="w-full bg-jp-surface-2 border border-jp-divider-soft text-white text-xs rounded pl-8 pr-2 py-1.5 focus:outline-none focus:border-jp-gold"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="bg-jp-surface-2 border border-jp-divider-soft text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-jp-gold"
            aria-label={t("sessions.filterStatus")}
          >
            <option value="all">{t("sessions.statusAll")}</option>
            <option value="active">{t("sessions.statusActive")}</option>
            <option value="completed">{t("sessions.statusCompleted")}</option>
          </select>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
            className="bg-jp-surface-2 border border-jp-divider-soft text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-jp-gold"
            aria-label={t("sessions.filterPeriod")}
          >
            <option value="all">{t("sessions.periodAll")}</option>
            <option value="24h">{t("sessions.period24h")}</option>
            <option value="7d">{t("sessions.period7d")}</option>
          </select>
          <select
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="bg-jp-surface-2 border border-jp-divider-soft text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-jp-gold"
            aria-label={t("sessions.filterFloor")}
          >
            <option value="all">{t("sessions.floorAll")}</option>
            {sortedFloors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.icon ? `${f.icon} ` : ""}
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Count */}
        <div className="text-[11px] text-jp-fg-dim font-mono">
          {t("sessions.countShown", {
            shown: filteredSessions.length.toString(),
            total: sessions.length.toString(),
          })}
        </div>

        {/* Groups */}
        {groupEntries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-jp-fg-dim text-sm italic">
            {t("sessions.noMatches")}
          </div>
        ) : (
          <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto">
            {groupEntries.map(([groupKey, list]) => {
              const isExpanded = expandedGroups.has(groupKey);
              const hasActive = list.some((s) => s.status === "active");
              return (
                <div
                  key={groupKey}
                  className="border border-jp-divider-soft/50 rounded bg-jp-surface-1/40"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupKey)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-jp-surface-2/60 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-jp-fg-dim" />
                    ) : (
                      <ChevronRight size={14} className="text-jp-fg-dim" />
                    )}
                    <span className="text-xs font-bold text-white truncate flex-1 text-left">
                      {groupKey}
                    </span>
                    {hasActive && (
                      <Radio
                        size={10}
                        className="text-emerald-400 animate-pulse flex-shrink-0"
                      />
                    )}
                    <span className="text-[10px] text-jp-fg-dim font-mono">
                      {list.length}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-jp-divider-soft/30">
                      {list.map((session) => {
                        const isSelected = session.id === sessionId;
                        const resumable = isResumableSession(session.id);
                        const displayName =
                          session.displayName ||
                          session.label ||
                          session.id.slice(0, 8);
                        return (
                          <div
                            key={session.id}
                            className={`group flex items-center gap-2 px-3 py-2 border-b border-jp-divider-soft/20 last:border-b-0 hover:bg-jp-surface-2/40 transition-colors cursor-pointer ${
                              isSelected ? "bg-jp-surface-2/60" : ""
                            }`}
                            onClick={() => handlePick(session.id)}
                          >
                            <span
                              className={`text-xs truncate flex-1 ${
                                isSelected
                                  ? "text-purple-300 font-bold"
                                  : "text-jp-fg"
                              }`}
                            >
                              {displayName}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-jp-fg-dim font-mono whitespace-nowrap">
                              <Clock size={10} />
                              {formatDistanceToNow(new Date(session.createdAt), {
                                locale: dateFnsLocale,
                              })}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-jp-fg-dim font-mono whitespace-nowrap">
                              <History size={10} />
                              {formatDistanceToNow(new Date(session.updatedAt), {
                                locale: dateFnsLocale,
                              })}
                            </span>
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
                                  ? "p-1 text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-2 rounded transition-colors"
                                  : "p-1 text-jp-fg-dim rounded transition-colors opacity-30 cursor-not-allowed"
                              }
                              title={
                                resumable
                                  ? t("sessions.resumeSession")
                                  : t("sessions.cannotResumeExternal")
                              }
                              aria-label={`${t("sessions.resumeSession")} ${session.id}`}
                            >
                              <Play size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession(session);
                              }}
                              className="p-1 text-jp-fg-dim hover:text-rose-400 hover:bg-jp-surface-2 rounded transition-colors"
                              aria-label={`${t("sessions.deleteSession")} ${session.id}`}
                            >
                              <Trash2 size={12} />
                            </button>
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
    </Modal>
  );
}
