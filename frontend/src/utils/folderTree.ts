/**
 * Folder-tree builder for the PinnedFoldersPanel.
 *
 * Builds a hierarchical view that combines:
 *  - User-pinned folders (top-level nodes, always present)
 *  - Auto-discovered subfolders extracted from session.projectRoot
 *
 * The tree is purely derived — there is no persisted child-folder list.
 * Subfolders appear because sessions exist inside them, and disappear when
 * the last session is gone.
 */

import type { Session } from "@/hooks/useSessions";
import type { PinnedFolder } from "@/stores/pinnedFoldersStore";
import {
  immediateChildSegment,
  isUnderPath,
  normalizePath,
} from "./folderChips";

export interface FolderTreeNode {
  /** Stable ID, used for React keys + expansion state. */
  id: string;
  /** Display label. */
  label: string;
  /** Lowercased / forward-slash path used for matching session.projectRoot. */
  path: string;
  /** Original-case path used as the argument for launcher/launch. */
  rawPath: string;
  /** Depth in the tree (0 = pinned root). Drives indentation. */
  depth: number;
  kind: "pinned" | "subfolder";
  /** Accent color (from floor) for pinned roots; undefined for subfolders. */
  accent?: string;
  /** Pinned-folder id passed through so callers can wire delete/edit. */
  pinnedFolderId?: string;
  /** Sessions whose projectRoot is exactly this folder (not deeper). */
  directSessions: Session[];
  /** Sub-folders found by walking session.projectRoot. */
  children: FolderTreeNode[];
  /** Total session count under this node (direct + descendants). */
  totalSessions: number;
}

function prettifySegment(seg: string): string {
  const cleaned = seg.replace(/[-_]+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Try to extract the original-case raw path for a folder at `depth`
 *  segments down from the root, using `session.projectRoot` as the source
 *  of truth for casing on Windows. */
function rawPathFromSessions(
  sessions: Session[],
  normalizedTarget: string,
): string {
  for (const s of sessions) {
    const np = normalizePath(s.projectRoot);
    if (!isUnderPath(np, normalizedTarget)) continue;
    const original = (s.projectRoot ?? "").replace(/\\/g, "/");
    // Walk segments of the original until we've covered the target depth.
    const targetDepth = normalizedTarget.split("/").length;
    const parts = original.split("/");
    return parts.slice(0, targetDepth).join("/");
  }
  return normalizedTarget;
}

/** Recursively build subtree starting at `parentNormPath`, given the list
 *  of sessions known to fall under it. */
function buildSubtree(
  parentNormPath: string,
  sessionsUnder: Session[],
  parentIdPrefix: string,
  depth: number,
): FolderTreeNode[] {
  // Group sessions by immediate child segment.
  const bySeg = new Map<string, Session[]>();
  for (const s of sessionsUnder) {
    const sp = normalizePath(s.projectRoot);
    if (sp === parentNormPath) continue; // direct in parent — handled by caller
    const seg = immediateChildSegment(sp, parentNormPath);
    if (!seg) continue;
    const arr = bySeg.get(seg) ?? [];
    arr.push(s);
    bySeg.set(seg, arr);
  }

  // Sort children: bigger first, then alpha.
  const entries = Array.from(bySeg.entries()).sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
  });

  return entries.map(([seg, segSessions]) => {
    const childNormPath = `${parentNormPath}/${seg}`;
    const directHere = segSessions.filter(
      (s) => normalizePath(s.projectRoot) === childNormPath,
    );
    const rawPath = rawPathFromSessions(segSessions, childNormPath);
    const grandchildren = buildSubtree(
      childNormPath,
      segSessions,
      `${parentIdPrefix}/${seg}`,
      depth + 1,
    );
    return {
      id: `${parentIdPrefix}/${seg}`,
      label: prettifySegment(seg),
      path: childNormPath,
      rawPath,
      depth,
      kind: "subfolder" as const,
      directSessions: sortSessions(directHere),
      children: grandchildren,
      totalSessions: segSessions.length,
    };
  });
}

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const at = new Date(a.updatedAt).getTime();
    const bt = new Date(b.updatedAt).getTime();
    return bt - at;
  });
}

export interface BuildTreeInput {
  pinnedFolders: PinnedFolder[];
  sessions: Session[];
  /** Map of floorId → accent hex color, used to color the pinned-root dot. */
  floorAccents?: Map<string, string>;
}

/** Build the tree displayed by PinnedFoldersPanel. */
export function buildFolderTree({
  pinnedFolders,
  sessions,
  floorAccents,
}: BuildTreeInput): FolderTreeNode[] {
  const roots: FolderTreeNode[] = [];

  for (const folder of pinnedFolders) {
    const normPath = normalizePath(folder.path);
    if (!normPath) continue;
    const accent = folder.floorId
      ? floorAccents?.get(folder.floorId)
      : undefined;
    const sessionsUnder = sessions.filter((s) =>
      isUnderPath(normalizePath(s.projectRoot), normPath),
    );
    const directHere = sessionsUnder.filter(
      (s) => normalizePath(s.projectRoot) === normPath,
    );
    // Sempre constrói a subárvore — qualquer sessão num subdiretório aparece
    // como pasta filha (recursivo). O flag `includeChildren` é usado em
    // outro lugar (chips de filtro do SessionsPanel) e NÃO deve gatear a
    // visualização aqui.
    const children = buildSubtree(
      normPath,
      sessionsUnder,
      `pinned/${folder.id}`,
      1,
    );
    roots.push({
      id: `pinned/${folder.id}`,
      label: folder.label,
      path: normPath,
      rawPath: folder.path,
      depth: 0,
      kind: "pinned",
      accent,
      pinnedFolderId: folder.id,
      directSessions: sortSessions(directHere),
      children,
      totalSessions: sessionsUnder.length,
    });
  }

  return roots;
}
