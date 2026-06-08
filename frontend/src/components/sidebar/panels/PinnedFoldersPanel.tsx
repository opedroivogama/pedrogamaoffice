"use client";

import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Pencil,
  Play,
  PlayCircle,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Session } from "@/hooks/useSessions";
import { useNavigationStore } from "@/stores/navigationStore";
import {
  usePinnedFoldersStore,
  type PinnedFolder,
} from "@/stores/pinnedFoldersStore";
import { buildFolderTree, type FolderTreeNode } from "@/utils/folderTree";
import { useSessionsPanelContext } from "./SessionsPanelContext";

// Stable reference for the empty-floors fallback. If we inlined `?? []` in
// the Zustand selector, each call would create a new array, breaking the
// snapshot equality check and causing an infinite re-render loop.
const EMPTY_FLOORS: never[] = [];
const EXPAND_STORAGE_KEY = "pinnedFolders.expanded.v1";

// ============================================================================
// FORM — adicionar / editar
// ============================================================================

function FolderForm({
  initial,
  onSubmit,
  onClose,
}: {
  initial?: PinnedFolder;
  /** Callback fixo. Add ou update é decidido pelo parent — o form não
   *  precisa saber. Evita o bug em que o React reusava o componente
   *  entre modos e o `isEditing` interno saía dessincronizado. */
  onSubmit: (payload: Omit<PinnedFolder, "id">) => Promise<void>;
  onClose: () => void;
}): React.ReactNode {
  const floors = useNavigationStore(
    (s) => s.buildingConfig?.floors ?? EMPTY_FLOORS,
  );

  const [label, setLabel] = useState(initial?.label ?? "");
  const [path, setPath] = useState(initial?.path ?? "");
  const [floorId, setFloorId] = useState<string>(initial?.floorId ?? "");
  const [includeChildren, setIncludeChildren] = useState(
    initial?.includeChildren ?? false,
  );
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(initial);
  const canSave = label.trim().length > 0 && path.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        label: label.trim(),
        path: path.trim(),
        floorId: floorId || undefined,
        includeChildren: includeChildren || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 p-2 mb-2 bg-jp-surface-2/50 rounded border border-jp-divider-soft"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-jp-fg-dim uppercase">
          {isEditing ? "Editar pasta" : "Nova pasta"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 text-jp-fg-dim hover:text-jp-fg rounded"
          aria-label="Cancelar"
        >
          <X size={11} />
        </button>
      </div>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Rótulo (ex: Comercial)"
        maxLength={48}
        autoFocus
        className="text-xs bg-jp-surface-3 text-white px-2 py-1 rounded outline-none border border-jp-divider-soft focus:border-jp-gold"
      />
      <input
        type="text"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder="C:\Users\Pedro\Desktop\..."
        maxLength={4096}
        className="text-xs bg-jp-surface-3 text-white px-2 py-1 rounded outline-none border border-jp-divider-soft focus:border-jp-gold font-mono"
      />
      {floors.length > 0 && (
        <select
          value={floorId}
          onChange={(e) => setFloorId(e.target.value)}
          className="text-xs bg-jp-surface-3 text-white px-2 py-1 rounded outline-none border border-jp-divider-soft focus:border-jp-gold"
        >
          <option value="">Sem andar</option>
          {floors.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.name}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-2 text-[11px] text-jp-fg-dim cursor-pointer select-none">
        <input
          type="checkbox"
          checked={includeChildren}
          onChange={(e) => setIncludeChildren(e.target.checked)}
          className="accent-jp-gold"
        />
        <span>
          Tratar como <b className="text-jp-fg">pasta-mãe</b> · gera chips de
          subpastas em Sessões
        </span>
      </label>
      <button
        type="submit"
        disabled={!canSave || saving}
        className="text-xs bg-jp-gold text-black font-bold px-2 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
      >
        {saving
          ? "Salvando..."
          : isEditing
            ? "Salvar alterações"
            : "Adicionar"}
      </button>
    </form>
  );
}

// ============================================================================
// RESUME HELPER
// ============================================================================

async function resumeSession(id: string): Promise<void> {
  try {
    const res = await fetch(
      `http://localhost:8000/api/v1/sessions/${id}/resume`,
      { method: "POST" },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { detail?: string }
        | null;
      window.alert(`Falha ao retomar: ${body?.detail ?? res.statusText}`);
    }
  } catch (err) {
    window.alert(`Falha ao retomar: ${(err as Error).message}`);
  }
}

// ============================================================================
// SESSION ROW (inside a folder)
// ============================================================================

function SessionRow({
  session,
  depth,
  isActiveSelection,
  onSelect,
}: {
  session: Session;
  depth: number;
  isActiveSelection: boolean;
  onSelect: (id: string) => void;
}): React.ReactNode {
  const isLive = session.status === "active";
  const label = session.displayName ?? session.label ?? session.id.slice(0, 8);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(session.id);
        }
      }}
      style={{ paddingLeft: 12 + depth * 12 }}
      className={`group flex items-center gap-2 px-2 py-1 text-left rounded-md transition-colors cursor-pointer ${
        isActiveSelection
          ? "bg-purple-500/20 border-l-2 border-purple-500"
          : "hover:bg-jp-surface-2/40"
      }`}
      title={session.id}
    >
      {isLive ? (
        <Radio
          size={9}
          className="text-emerald-400 animate-pulse flex-shrink-0"
        />
      ) : (
        <PlayCircle size={9} className="text-jp-fg-dim flex-shrink-0" />
      )}
      <span className="text-[11px] text-jp-fg truncate flex-1">{label}</span>
      <button
        type="button"
        disabled={isLive}
        onClick={(e) => {
          e.stopPropagation();
          if (isLive) return;
          void resumeSession(session.id);
        }}
        className={
          isLive
            ? "p-0.5 text-jp-fg-dim rounded transition-colors opacity-0 group-hover:opacity-30 cursor-not-allowed"
            : "p-0.5 text-jp-fg-dim hover:text-jp-gold rounded transition-colors opacity-0 group-hover:opacity-100"
        }
        aria-label={`Retomar ${label}`}
        title={
          isLive
            ? "Sessão ativa em outro terminal — encerre lá primeiro pra poder retomar"
            : "Retomar sessão"
        }
      >
        <Play size={10} />
      </button>
    </div>
  );
}

// ============================================================================
// FOLDER TREE NODE (recursive)
// ============================================================================

function TreeNodeView({
  node,
  expandedSet,
  toggle,
  activeSessionId,
  onSelectSession,
  onEdit,
}: {
  node: FolderTreeNode;
  expandedSet: Set<string>;
  toggle: (id: string) => void;
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onEdit: (id: string) => void;
}): React.ReactNode {
  const isExpanded = expandedSet.has(node.id);
  const launch = usePinnedFoldersStore((s) => s.launch);
  const remove = usePinnedFoldersStore((s) => s.remove);
  const [launching, setLaunching] = useState(false);

  const accent =
    node.kind === "pinned" ? (node.accent ?? "#5a5a5a") : undefined;
  const hasContent = node.directSessions.length > 0 || node.children.length > 0;

  const handleLaunch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (launching) return;
    setLaunching(true);
    const result = await launch(node.rawPath);
    setLaunching(false);
    if (!result.ok) {
      window.alert(`Falha ao abrir Claude: ${result.error}`);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!node.pinnedFolderId) return;
    if (!window.confirm(`Remover "${node.label}" das pastas fixadas?`)) return;
    void remove(node.pinnedFolderId);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!node.pinnedFolderId) return;
    onEdit(node.pinnedFolderId);
  };

  return (
    <div className="flex flex-col">
      <div
        role="button"
        tabIndex={0}
        onClick={() => hasContent && toggle(node.id)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && hasContent) {
            e.preventDefault();
            toggle(node.id);
          }
        }}
        style={{ paddingLeft: 8 + node.depth * 12 }}
        className={`group flex items-center gap-1.5 pr-2 py-1.5 text-left rounded-md transition-colors ${
          hasContent ? "cursor-pointer hover:bg-jp-surface-2/50" : "opacity-80"
        }`}
        title={node.rawPath}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (hasContent) toggle(node.id);
          }}
          disabled={!hasContent}
          className="flex items-center justify-center text-jp-fg-dim hover:text-jp-fg-muted disabled:opacity-30 disabled:cursor-default"
          aria-label={isExpanded ? "Recolher" : "Expandir"}
        >
          {isExpanded ? (
            <ChevronDown size={11} />
          ) : (
            <ChevronRight size={11} />
          )}
        </button>

        {accent ? (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
        ) : isExpanded ? (
          <FolderOpen size={11} className="text-jp-fg-dim flex-shrink-0" />
        ) : (
          <Folder size={11} className="text-jp-fg-dim flex-shrink-0" />
        )}

        <span
          className={`truncate flex-1 ${
            node.kind === "pinned"
              ? "text-xs font-bold text-jp-fg"
              : "text-[11px] text-jp-fg-muted"
          }`}
        >
          {node.label}
        </span>

        {node.totalSessions > 0 && (
          <span className="text-[9px] text-jp-fg-dim/70 tabular-nums">
            {node.totalSessions}
          </span>
        )}

        <button
          type="button"
          onClick={handleLaunch}
          disabled={launching}
          className={
            launching
              ? "p-0.5 text-jp-gold animate-pulse"
              : "p-0.5 text-jp-fg-dim hover:text-jp-gold rounded transition-colors opacity-0 group-hover:opacity-100"
          }
          aria-label={`Abrir nova sessão em ${node.label}`}
          title="Abrir nova sessão Claude aqui"
        >
          <Play size={11} />
        </button>

        {node.pinnedFolderId && (
          <>
            <button
              type="button"
              onClick={handleEdit}
              className="p-0.5 text-jp-fg-dim hover:text-jp-gold rounded transition-colors opacity-0 group-hover:opacity-100"
              aria-label={`Editar ${node.label}`}
              title="Editar pasta"
            >
              <Pencil size={11} />
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="p-0.5 text-jp-fg-dim hover:text-rose-400 rounded transition-colors opacity-0 group-hover:opacity-100"
              aria-label={`Remover ${node.label}`}
              title="Remover atalho"
            >
              <Trash2 size={11} />
            </button>
          </>
        )}
      </div>

      {isExpanded && (
        <div className="flex flex-col">
          {node.directSessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              depth={node.depth + 1}
              isActiveSelection={s.id === activeSessionId}
              onSelect={onSelectSession}
            />
          ))}
          {node.children.map((child) => (
            <TreeNodeView
              key={child.id}
              node={child}
              expandedSet={expandedSet}
              toggle={toggle}
              activeSessionId={activeSessionId}
              onSelectSession={onSelectSession}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PANEL
// ============================================================================

export function PinnedFoldersPanel(): React.ReactNode {
  const folders = usePinnedFoldersStore((s) => s.folders);
  const isLoaded = usePinnedFoldersStore((s) => s.isLoaded);
  const load = usePinnedFoldersStore((s) => s.load);
  const add = usePinnedFoldersStore((s) => s.add);
  const update = usePinnedFoldersStore((s) => s.update);

  // Pull sessions + selection from the shared SessionsPanel context — it
  // wraps the whole sidebar stack, so we get the same live data without
  // a second fetch loop.
  const { sessions, sessionId, onSessionSelect } = useSessionsPanelContext();

  // Floor accents → map for fast lookup inside the tree builder.
  const floors = useNavigationStore(
    (s) => s.buildingConfig?.floors ?? EMPTY_FLOORS,
  );
  const floorAccents = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of floors) m.set(f.id, f.accent);
    return m;
  }, [floors]);

  const tree = useMemo(
    () =>
      buildFolderTree({ pinnedFolders: folders, sessions, floorAccents }),
    [folders, sessions, floorAccents],
  );

  // Per-folder expand state, persisted to localStorage.
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(EXPAND_STORAGE_KEY);
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr))
          setExpandedSet(new Set(arr.filter((v) => typeof v === "string")));
      }
    } catch {
      // ignore
    }
  }, []);
  const toggleExpand = (id: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(
          EXPAND_STORAGE_KEY,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // ignore
      }
      return next;
    });
  };

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const editingFolder =
    editingId !== null ? folders.find((f) => f.id === editingId) : undefined;

  const handleEdit = (id: string) => {
    setAdding(false);
    setEditingId(id);
  };

  const handleAddToggle = () => {
    setEditingId(null);
    setAdding((v) => !v);
  };

  const closeForm = () => {
    setAdding(false);
    setEditingId(null);
  };

  useEffect(() => {
    if (!isLoaded) {
      void load();
    }
  }, [isLoaded, load]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col min-h-0 flex-grow">
      <div className="px-3 py-1.5 text-[10px] text-jp-fg-dim font-mono border-b border-jp-divider-soft flex-shrink-0 flex items-center justify-between gap-2">
        <span>
          {folders.length} {folders.length === 1 ? "pasta" : "pastas"}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1 text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-2 rounded transition-colors disabled:opacity-50 disabled:cursor-wait"
            title="Atualizar lista de pastas"
            aria-label="Atualizar lista de pastas"
          >
            <RefreshCw
              size={11}
              className={refreshing ? "animate-spin" : ""}
            />
          </button>
          <button
            type="button"
            onClick={handleAddToggle}
            className={`p-1 rounded transition-colors ${
              adding
                ? "text-jp-gold bg-jp-surface-2"
                : "text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-2"
            }`}
            title="Adicionar pasta"
            aria-label="Adicionar pasta"
          >
            <Plus size={11} />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto flex-grow p-2">
        {/* key distinta força o React a remontar entre "novo" e "editar
            id=X" — sem isso ele reusava o mesmo FolderForm e o useState
            interno mantinha o label/path da abertura anterior. */}
        {adding && (
          <FolderForm key="new" onSubmit={add} onClose={closeForm} />
        )}
        {editingFolder && (
          <FolderForm
            key={`edit-${editingFolder.id}`}
            initial={editingFolder}
            onSubmit={(payload) => update(editingFolder.id, payload)}
            onClose={closeForm}
          />
        )}
        {!isLoaded ? (
          <div className="p-4 text-center text-jp-fg-dim text-xs italic">
            Carregando...
          </div>
        ) : folders.length === 0 && !adding ? (
          <div className="p-4 text-center text-jp-fg-dim text-xs italic">
            Nenhuma pasta fixada. Clique em + pra adicionar.
          </div>
        ) : (
          <div className="flex flex-col">
            {tree.map((node) => (
              <TreeNodeView
                key={node.id}
                node={node}
                expandedSet={expandedSet}
                toggle={toggleExpand}
                activeSessionId={sessionId}
                onSelectSession={(id) => void onSessionSelect(id)}
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
