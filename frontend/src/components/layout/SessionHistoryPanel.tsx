"use client";

import { useEffect, useMemo, useState } from "react";
import { Folder, ChevronDown } from "lucide-react";
import type { Session } from "@/hooks/useSessions";
import { useNavigationStore } from "@/stores/navigationStore";
import type { FloorConfig } from "@/types/navigation";

// ============================================================================
// HELPERS
// ============================================================================

function basename(path: string | null): string {
  if (!path) return "—";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface FloorRoomInfo {
  floorName: string;
  floorIcon: string;
  floorAccent: string;
  roomName: string;
}

function resolveFloorRoom(
  s: Session,
  buildingFloors: FloorConfig[],
): FloorRoomInfo {
  if (!s.floorId) {
    return {
      floorName: "Lobby",
      floorIcon: "\u{1F6AA}",
      floorAccent: "#94a3b8",
      roomName: "—",
    };
  }
  const floor = buildingFloors.find((f) => f.id === s.floorId);
  if (!floor) {
    return {
      floorName: s.floorId,
      floorIcon: "\u{1F3E2}",
      floorAccent: "#6366f1",
      roomName: s.roomId ?? "—",
    };
  }
  const room = floor.rooms.find((r) => r.id === s.roomId);
  return {
    floorName: floor.name,
    floorIcon: floor.icon,
    floorAccent: floor.accent,
    roomName: room?.repoName ?? s.roomId ?? "—",
  };
}

// ============================================================================
// PANEL
// ============================================================================

export function SessionHistoryPanel(): React.ReactNode {
  const buildingConfig = useNavigationStore((s) => s.buildingConfig);
  const floors = buildingConfig?.floors ?? [];

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [floorFilter, setFloorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");

  // Fetch fresh history on mount; refetch every 30s while panel mounted
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/v1/sessions");
        if (!res.ok) return;
        const data = (await res.json()) as Session[];
        if (!cancelled) setSessions(data);
      } catch {
        /* offline — keep previous */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Sort newest first
  const sorted = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [sessions],
  );

  const filtered = useMemo(
    () =>
      sorted.filter((s) => {
        if (statusFilter !== "all" && s.status !== statusFilter) return false;
        if (floorFilter === "all") return true;
        if (floorFilter === "__lobby__") return !s.floorId;
        return s.floorId === floorFilter;
      }),
    [sorted, statusFilter, floorFilter],
  );

  if (loading && sessions.length === 0) {
    return (
      <div className="p-3 text-xs text-jp-fg-dim italic">
        Carregando histórico…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex gap-2 px-3 py-2 border-b border-jp-divider-soft bg-jp-surface-1 flex-shrink-0">
        <div className="relative flex-grow">
          <select
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value)}
            className="w-full appearance-none bg-jp-surface-2 border border-jp-border-light/30 rounded px-2 py-1 pr-6 text-xs text-jp-fg-muted focus:outline-none focus:border-jp-gold/50"
          >
            <option value="all">Todos os andares</option>
            {floors
              .slice()
              .sort((a, b) => b.floorNumber - a.floorNumber)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.icon} {f.name}
                </option>
              ))}
            <option value="__lobby__">🚪 Lobby (órfãs)</option>
          </select>
          <ChevronDown
            size={12}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-jp-fg-dim pointer-events-none"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as "all" | "active" | "completed",
              )
            }
            className="appearance-none bg-jp-surface-2 border border-jp-border-light/30 rounded px-2 py-1 pr-6 text-xs text-jp-fg-muted focus:outline-none focus:border-jp-gold/50"
          >
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="completed">Encerrados</option>
          </select>
          <ChevronDown
            size={12}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-jp-fg-dim pointer-events-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-grow overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-3 text-xs text-jp-fg-dim italic text-center">
            Nenhuma sessão para esses filtros.
          </div>
        ) : (
          <ul className="divide-y divide-jp-divider-soft">
            {filtered.map((s) => {
              const info = resolveFloorRoom(s, floors);
              const proj = basename(s.projectRoot ?? s.projectName);
              const title = s.displayName ?? s.label ?? proj;
              const isActive = s.status === "active";
              return (
                <li
                  key={s.id}
                  className="px-3 py-2 hover:bg-jp-surface-2/40 transition-colors text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className="font-bold text-jp-fg-muted truncate"
                      title={s.id}
                    >
                      {title}
                    </span>
                    <span
                      className={`shrink-0 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                        isActive
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-jp-surface-3/40 text-jp-fg-dim"
                      }`}
                    >
                      {isActive ? "ativa" : "encerrada"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-jp-fg-dim text-[11px] mb-1">
                    <Folder size={10} />
                    <span className="truncate font-mono" title={s.projectRoot ?? ""}>
                      {proj}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono"
                      style={{
                        backgroundColor: `${info.floorAccent}22`,
                        color: info.floorAccent,
                      }}
                    >
                      <span>{info.floorIcon}</span>
                      <span>{info.floorName}</span>
                    </span>
                    <span className="text-jp-fg-dim font-mono truncate">
                      / {info.roomName}
                    </span>
                  </div>

                  <div className="text-[10px] text-jp-fg-dim mt-1 flex items-center gap-2">
                    <span>{formatDateTime(s.updatedAt)}</span>
                    <span>·</span>
                    <span>{s.eventCount ?? 0} eventos</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-jp-divider-soft text-[10px] text-jp-fg-dim font-mono flex-shrink-0">
        {filtered.length} / {sessions.length} sessões
      </div>
    </div>
  );
}
