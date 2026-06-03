/**
 * Folder chip derivation for SessionsPanel.
 *
 * Builds the chip bar that lets the user filter sessions by their
 * project_root, combining manually-pinned folders with auto-discovered
 * subfolders for any "parent" folder (includeChildren = true).
 */

import type { Session } from "@/hooks/useSessions";
import type { PinnedFolder } from "@/stores/pinnedFoldersStore";

export type ChipKind = "all" | "pinned" | "auto-child" | "orphan";

export interface FolderChip {
  /** Stable ID for React keys + persisted active-chip selection. */
  id: string;
  /** Human-readable label shown on the chip. */
  label: string;
  /** Path used to match `session.projectRoot` via prefix. Empty for "all"
   *  and a special "__orphan__" sentinel for the orphan chip. */
  matchPath: string;
  /** Distinguishes which icon/styling to apply. */
  kind: ChipKind;
  /** Number of sessions captured by this chip. Used to hide empty chips. */
  count: number;
  /** Optional parent label — set for "auto-child" chips so the UI can
   *  group/indent them under their pinned-folder parent. */
  parentLabel?: string;
}

/** Normalize a path for case-insensitive prefix comparison across Windows
 *  (`\\`) and POSIX (`/`) separators. Returns lowercased forward-slash
 *  form with no trailing slash. */
export function normalizePath(p: string | null | undefined): string {
  if (!p) return "";
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** True when `child` is `parent` itself or sits inside `parent`. Both
 *  inputs should already be normalized. */
export function isUnderPath(child: string, parent: string): boolean {
  if (!parent || !child) return false;
  if (child === parent) return true;
  return child.startsWith(parent + "/");
}

/** Extract the immediate child-segment under `parent` from `child`.
 *  Returns null when `child` is `parent` itself or unrelated. */
export function immediateChildSegment(
  child: string,
  parent: string,
): string | null {
  if (!isUnderPath(child, parent) || child === parent) return null;
  const rest = child.slice(parent.length + 1);
  const slash = rest.indexOf("/");
  return slash === -1 ? rest : rest.slice(0, slash);
}

/** Display label for an auto-discovered subfolder. Capitalizes the first
 *  letter and replaces `-`/`_` with spaces. */
function prettifySegment(seg: string): string {
  const cleaned = seg.replace(/[-_]+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export interface BuildChipsInput {
  sessions: Session[];
  pinnedFolders: PinnedFolder[];
}

/** Build the ordered list of chips shown above the sessions list. */
export function buildFolderChips({
  sessions,
  pinnedFolders,
}: BuildChipsInput): FolderChip[] {
  const sessionPaths = sessions.map((s) => normalizePath(s.projectRoot));

  // 1. "Todas" — always first, always present.
  const chips: FolderChip[] = [
    {
      id: "all",
      label: "Todas",
      matchPath: "",
      kind: "all",
      count: sessions.length,
    },
  ];

  // Track which pinned-folder paths we've added so we don't duplicate when
  // a child path happens to also be a separately pinned folder.
  const pinnedPathSet = new Set<string>();

  for (const folder of pinnedFolders) {
    const normPath = normalizePath(folder.path);
    if (!normPath || pinnedPathSet.has(normPath)) continue;
    pinnedPathSet.add(normPath);

    const ownCount = sessionPaths.filter((p) => isUnderPath(p, normPath))
      .length;

    chips.push({
      id: `pinned:${folder.id}`,
      label: folder.label,
      matchPath: normPath,
      kind: "pinned",
      count: ownCount,
    });

    if (folder.includeChildren) {
      // Find unique immediate subfolders that have sessions and add a chip
      // for each. Skip the rare case where the subfolder is itself the
      // pinned-folder path (would be a duplicate).
      const segSet = new Map<string, number>(); // segment → session count
      for (const sp of sessionPaths) {
        const seg = immediateChildSegment(sp, normPath);
        if (!seg) continue;
        segSet.set(seg, (segSet.get(seg) ?? 0) + 1);
      }

      const sortedSegs = Array.from(segSet.entries()).sort((a, b) => {
        // Largest first, then alpha
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      });

      for (const [seg, count] of sortedSegs) {
        const childPath = `${normPath}/${seg}`;
        if (pinnedPathSet.has(childPath)) continue;
        chips.push({
          id: `child:${folder.id}:${seg}`,
          label: prettifySegment(seg),
          matchPath: childPath,
          kind: "auto-child",
          count,
          parentLabel: folder.label,
        });
      }
    }
  }

  // 3. "Sem pasta" — sessions whose projectRoot is null or doesn't fall
  //    under any pinned folder. Useful for surfacing orphans.
  const orphanCount = sessionPaths.filter(
    (p) =>
      !p ||
      !Array.from(pinnedPathSet).some((pinnedPath) => isUnderPath(p, pinnedPath)),
  ).length;

  if (orphanCount > 0) {
    chips.push({
      id: "orphan",
      label: "Sem pasta",
      matchPath: "__orphan__",
      kind: "orphan",
      count: orphanCount,
    });
  }

  return chips;
}

/** Filter `sessions` by the active chip. `null` chip means no filter. */
export function filterSessionsByChip(
  sessions: Session[],
  chip: FolderChip | null,
  pinnedFolders: PinnedFolder[],
): Session[] {
  if (!chip || chip.kind === "all") return sessions;

  if (chip.kind === "orphan") {
    const pinnedPaths = pinnedFolders
      .map((f) => normalizePath(f.path))
      .filter(Boolean);
    return sessions.filter((s) => {
      const sp = normalizePath(s.projectRoot);
      if (!sp) return true;
      return !pinnedPaths.some((p) => isUnderPath(sp, p));
    });
  }

  return sessions.filter((s) =>
    isUnderPath(normalizePath(s.projectRoot), chip.matchPath),
  );
}
