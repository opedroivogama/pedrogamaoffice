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

export function groupSessionsByProject(
  sessions: Session[],
): Map<string, Session[]> {
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
