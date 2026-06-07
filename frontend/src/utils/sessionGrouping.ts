import type { Session } from "@/hooks/useSessions";

// Sessões do Claude Code têm session_id em formato UUID. Sessões sintéticas
// criadas por bridges externos (ex: jurischat_bridge → "comercial-recepcao-ia")
// usam kebab-case e NÃO têm transcript pra `claude --resume`. Pra essas o Play
// fica visualmente desabilitado.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isResumableSession(sessionId: string): boolean {
  return UUID_RE.test(sessionId);
}

export function getProjectKey(session: Session): string {
  if (session.projectName) return session.projectName;
  if (session.projectRoot)
    return session.projectRoot.split("/").pop() ?? "unknown";
  return "unknown";
}

export type SessionSortDirection = "desc" | "asc";

export function groupSessionsByProject(
  sessions: Session[],
  direction: SessionSortDirection = "desc",
): Map<string, Session[]> {
  const sign = direction === "desc" ? 1 : -1;
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
      const delta =
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return delta * sign;
    });
  }
  const sorted = [...groups.entries()].sort(([, a], [, b]) => {
    const aActive = a.some((s) => s.status === "active");
    const bActive = b.some((s) => s.status === "active");
    if (aActive && !bActive) return -1;
    if (bActive && !aActive) return 1;
    const aExtreme =
      direction === "desc"
        ? Math.max(...a.map((s) => new Date(s.updatedAt).getTime()))
        : Math.min(...a.map((s) => new Date(s.updatedAt).getTime()));
    const bExtreme =
      direction === "desc"
        ? Math.max(...b.map((s) => new Date(s.updatedAt).getTime()))
        : Math.min(...b.map((s) => new Date(s.updatedAt).getTime()));
    return (bExtreme - aExtreme) * sign;
  });
  return new Map(sorted);
}

// ─── Sidebar 2.0 — agrupamento por bucket temporal ─────────────────────────

export type SessionBucketKey =
  | "awaiting"
  | "pinned"
  | "active"
  | "today"
  | "thisWeek"
  | "older";

export interface SessionBucketMeta {
  key: SessionBucketKey;
  label: string;
  icon: string;
  collapsedByDefault: boolean;
  highlight?: "urgent";
}

export const SESSION_BUCKETS: readonly SessionBucketMeta[] = [
  {
    key: "awaiting",
    label: "Te esperando",
    icon: "🔔",
    collapsedByDefault: false,
    highlight: "urgent",
  },
  { key: "pinned", label: "Fixadas", icon: "📌", collapsedByDefault: false },
  { key: "active", label: "Ativas agora", icon: "🟢", collapsedByDefault: false },
  { key: "today", label: "Hoje", icon: "🕐", collapsedByDefault: false },
  {
    key: "thisWeek",
    label: "Esta semana",
    icon: "📅",
    collapsedByDefault: false,
  },
  { key: "older", label: "Anteriores", icon: "📦", collapsedByDefault: true },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function bucketForSession(s: Session, now: number): SessionBucketKey {
  // Priority: awaiting > pinned > active > time-based. A session falls into
  // exactly one bucket so it never duplicates in the sidebar. Awaiting wins
  // even over pinned because urgency > organization.
  if (s.awaitingInput) return "awaiting";
  if (s.isPinned) return "pinned";
  if (s.status === "active") return "active";
  const updated = new Date(s.updatedAt).getTime();
  const age = now - updated;
  if (age < DAY_MS) return "today";
  if (age < 7 * DAY_MS) return "thisWeek";
  return "older";
}

/**
 * Group sessions into time/state buckets (Fixadas / Ativas / Hoje / Semana /
 * Anteriores). Inside each bucket, sessions are sub-grouped by project, so
 * the existing project-header UI in SessionsPanel keeps working.
 *
 * Returns a Map preserving bucket order from SESSION_BUCKETS. Empty buckets
 * are omitted.
 */
export function groupSessionsByTimeBuckets(
  sessions: Session[],
  direction: SessionSortDirection = "desc",
): Map<SessionBucketKey, Map<string, Session[]>> {
  const now = Date.now();
  const byBucket = new Map<SessionBucketKey, Session[]>();
  for (const s of sessions) {
    const bucket = bucketForSession(s, now);
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket)!.push(s);
  }

  const result = new Map<SessionBucketKey, Map<string, Session[]>>();
  for (const meta of SESSION_BUCKETS) {
    const bucketSessions = byBucket.get(meta.key);
    if (!bucketSessions || bucketSessions.length === 0) continue;
    result.set(meta.key, groupSessionsByProject(bucketSessions, direction));
  }
  return result;
}
