"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  GripVertical,
  Link2,
  Pencil,
  Play,
  Plus,
  Radio,
  Trash2,
  X,
} from "lucide-react";
import { useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { SessionsPanelContextRaw } from "@/components/sidebar/panels/SessionsPanelContext";
import type { Session } from "@/hooks/useSessions";
import {
  useQuickLinksStore,
  type QuickLink,
} from "@/stores/quickLinksStore";
import {
  useQuickSessionsStore,
  type QuickSession,
} from "@/stores/quickSessionsStore";

// ============================================================================
// CONSTANTES VISUAIS
// ============================================================================

const COLOR_SWATCHES: { value: string; label: string }[] = [
  { value: "#B8972A", label: "Ouro JP" },
  { value: "#E11D48", label: "Rosa" },
  { value: "#10B981", label: "Esmeralda" },
  { value: "#3B82F6", label: "Azul" },
  { value: "#A855F7", label: "Roxo" },
  { value: "#F59E0B", label: "Âmbar" },
  { value: "#64748B", label: "Cinza" },
];

const DEFAULT_COLOR = "#B8972A";
const COLLAPSE_STORAGE_KEY = "quickLinks.sections.v1";

type SectionId = "externals" | "sessions";

// ============================================================================
// HELPERS
// ============================================================================

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function readCollapsed(): Record<SectionId, boolean> {
  if (typeof window === "undefined") return { externals: false, sessions: false };
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return { externals: false, sessions: false };
    const parsed = JSON.parse(raw);
    return {
      externals: Boolean(parsed?.externals),
      sessions: Boolean(parsed?.sessions),
    };
  } catch {
    return { externals: false, sessions: false };
  }
}

function writeCollapsed(state: Record<SectionId, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

// ============================================================================
// PICKER DE COR (reutilizado pelos dois forms)
// ============================================================================

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wide text-jp-fg-dim font-mono">
        Cor
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {COLOR_SWATCHES.map((c) => {
          const selected = value.toLowerCase() === c.value.toLowerCase();
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
              title={c.label}
              aria-label={c.label}
              aria-pressed={selected}
              className={`w-5 h-5 rounded-full border transition-all ${
                selected
                  ? "border-white scale-110 shadow-[0_0_0_2px_rgba(255,255,255,0.15)]"
                  : "border-black/40 hover:scale-110"
              }`}
              style={{ backgroundColor: c.value }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// FORM — link externo
// ============================================================================

function LinkForm({
  initial,
  onSubmit,
  onClose,
}: {
  initial?: QuickLink;
  onSubmit: (payload: Omit<QuickLink, "id">) => Promise<void>;
  onClose: () => void;
}): ReactNode {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [color, setColor] = useState(initial?.color ?? DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(initial);
  const canSave = label.trim().length > 0 && url.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        label: label.trim(),
        url: url.trim(),
        emoji: emoji.trim() || undefined,
        color: color || undefined,
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
          {isEditing ? "Editar link externo" : "Novo link externo"}
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
        placeholder="Rótulo (ex: JurisChat)"
        maxLength={48}
        autoFocus
        className="text-xs bg-jp-surface-3 text-white px-2 py-1 rounded outline-none border border-jp-divider-soft focus:border-jp-gold"
      />
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        maxLength={2048}
        className="text-xs bg-jp-surface-3 text-white px-2 py-1 rounded outline-none border border-jp-divider-soft focus:border-jp-gold font-mono"
      />
      <input
        type="text"
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        placeholder="Emoji opcional (ex: 💼)"
        maxLength={4}
        className="text-xs bg-jp-surface-3 text-white px-2 py-1 rounded outline-none border border-jp-divider-soft focus:border-jp-gold"
      />
      <ColorPicker value={color} onChange={setColor} />
      <button
        type="submit"
        disabled={!canSave || saving}
        className="text-xs bg-jp-gold text-black font-bold px-2 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
      >
        {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Adicionar"}
      </button>
    </form>
  );
}

// ============================================================================
// FORM — atalho de sessão Claude
// ============================================================================

function SessionForm({
  initial,
  sessions,
  onSubmit,
  onClose,
}: {
  initial?: QuickSession;
  sessions: Session[];
  onSubmit: (payload: Omit<QuickSession, "id">) => Promise<void>;
  onClose: () => void;
}): ReactNode {
  const [sessionId, setSessionId] = useState(initial?.sessionId ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [color, setColor] = useState(initial?.color ?? DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(initial);
  const canSave = sessionId.trim().length > 0 && label.trim().length > 0;

  // Sessões disponíveis pra escolher (ordenadas pelo updatedAt desc no useSessions)
  const sessionOptions = useMemo(
    () =>
      sessions.map((s) => ({
        id: s.id,
        label: s.displayName ?? s.label ?? s.id.slice(0, 8),
        project: s.projectName ?? s.projectRoot ?? "",
      })),
    [sessions],
  );

  // Auto-preencher label com o nome da sessão quando seleciona
  const handleSessionChange = (id: string) => {
    setSessionId(id);
    if (!label.trim() && id) {
      const match = sessionOptions.find((o) => o.id === id);
      if (match) setLabel(match.label);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        sessionId: sessionId.trim(),
        label: label.trim(),
        emoji: emoji.trim() || undefined,
        color: color || undefined,
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
          {isEditing ? "Editar atalho de sessão" : "Nova sessão Claude"}
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

      {sessionOptions.length > 0 ? (
        <select
          value={sessionId}
          onChange={(e) => handleSessionChange(e.target.value)}
          autoFocus
          className="text-xs bg-jp-surface-3 text-white px-2 py-1 rounded outline-none border border-jp-divider-soft focus:border-jp-gold"
        >
          <option value="">Escolha uma sessão...</option>
          {sessionOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} {o.project ? `· ${o.project}` : ""}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="ID da sessão Claude"
          maxLength={128}
          autoFocus
          className="text-xs bg-jp-surface-3 text-white px-2 py-1 rounded outline-none border border-jp-divider-soft focus:border-jp-gold font-mono"
        />
      )}

      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Rótulo (ex: Painel JP)"
        maxLength={48}
        className="text-xs bg-jp-surface-3 text-white px-2 py-1 rounded outline-none border border-jp-divider-soft focus:border-jp-gold"
      />
      <input
        type="text"
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        placeholder="Emoji opcional (ex: 🤖)"
        maxLength={4}
        className="text-xs bg-jp-surface-3 text-white px-2 py-1 rounded outline-none border border-jp-divider-soft focus:border-jp-gold"
      />
      <ColorPicker value={color} onChange={setColor} />
      <button
        type="submit"
        disabled={!canSave || saving}
        className="text-xs bg-jp-gold text-black font-bold px-2 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
      >
        {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Adicionar"}
      </button>
    </form>
  );
}

// ============================================================================
// CARD — link externo
// ============================================================================

function LinkCard({
  link,
  onEdit,
}: {
  link: QuickLink;
  onEdit: (id: string) => void;
}): ReactNode {
  const remove = useQuickLinksStore((s) => s.remove);
  const color = link.color ?? DEFAULT_COLOR;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const handleOpen = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    window.open(link.url, "_blank", "noopener,noreferrer");
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Remover "${link.label}" dos atalhos?`)) return;
    void remove(link.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(link.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen(e);
        }
      }}
      className={`group relative flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-all border bg-jp-surface-2/30 hover:bg-jp-surface-2/70 ${
        isDragging
          ? "border-jp-gold shadow-lg"
          : "border-transparent hover:border-jp-gold/40"
      }`}
      title={link.url}
    >
      <button
        type="button"
        aria-label="Arrastar pra reordenar"
        title="Arrastar pra reordenar"
        className="flex items-center justify-center text-jp-fg-dim hover:text-jp-fg cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 touch-none"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={12} />
      </button>

      <div
        className="flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 text-sm border border-black/30 shadow-inner"
        style={{ backgroundColor: `${color}1f`, color }}
        aria-hidden
      >
        {link.emoji ? (
          <span className="leading-none">{link.emoji}</span>
        ) : (
          <Link2 size={12} />
        )}
      </div>

      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-xs font-bold text-jp-fg truncate leading-tight">
          {link.label}
        </span>
        <span className="text-[10px] text-jp-fg-dim truncate font-mono leading-tight">
          {safeHost(link.url)}
        </span>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          type="button"
          onClick={handleEdit}
          className="p-1 text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-3 rounded transition-colors"
          aria-label={`Editar ${link.label}`}
          title="Editar"
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          onClick={handleRemove}
          className="p-1 text-jp-fg-dim hover:text-rose-400 hover:bg-jp-surface-3 rounded transition-colors"
          aria-label={`Remover ${link.label}`}
          title="Remover"
        >
          <Trash2 size={11} />
        </button>
        <span className="p-1 text-jp-fg-dim" aria-hidden>
          <ExternalLink size={11} />
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// CARD — atalho de sessão Claude
// ============================================================================

function SessionCard({
  item,
  liveSession,
  onEdit,
}: {
  item: QuickSession;
  liveSession?: Session;
  onEdit: (id: string) => void;
}): ReactNode {
  const remove = useQuickSessionsStore((s) => s.remove);
  const resume = useQuickSessionsStore((s) => s.resume);
  const color = item.color ?? DEFAULT_COLOR;
  const [resuming, setResuming] = useState(false);

  const isLive = liveSession?.status === "active";

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const handleResume = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (resuming) return;
    setResuming(true);
    try {
      const result = await resume(item.sessionId);
      if (!result.ok) {
        window.alert(`Falha ao retomar: ${result.error}`);
      }
    } finally {
      setResuming(false);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Remover atalho "${item.label}"?`)) return;
    void remove(item.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(item.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={handleResume}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void handleResume(e);
        }
      }}
      className={`group relative flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-all border bg-jp-surface-2/30 hover:bg-jp-surface-2/70 ${
        isDragging
          ? "border-jp-gold shadow-lg"
          : "border-transparent hover:border-jp-gold/40"
      }`}
      title={`Sessão ${item.sessionId.slice(0, 12)}...`}
    >
      <button
        type="button"
        aria-label="Arrastar pra reordenar"
        title="Arrastar pra reordenar"
        className="flex items-center justify-center text-jp-fg-dim hover:text-jp-fg cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 touch-none"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={12} />
      </button>

      <div
        className="flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 text-sm border border-black/30 shadow-inner relative"
        style={{ backgroundColor: `${color}1f`, color }}
        aria-hidden
      >
        {item.emoji ? (
          <span className="leading-none">{item.emoji}</span>
        ) : (
          <Bot size={12} />
        )}
        {isLive && (
          <Radio
            size={8}
            className="absolute -bottom-0.5 -right-0.5 text-emerald-400 animate-pulse drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]"
          />
        )}
      </div>

      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-xs font-bold text-jp-fg truncate leading-tight">
          {item.label}
        </span>
        <span className="text-[10px] text-jp-fg-dim truncate font-mono leading-tight">
          {liveSession?.projectName ?? item.sessionId.slice(0, 16)}
        </span>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          type="button"
          onClick={handleEdit}
          className="p-1 text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-3 rounded transition-colors"
          aria-label={`Editar ${item.label}`}
          title="Editar"
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          onClick={handleRemove}
          className="p-1 text-jp-fg-dim hover:text-rose-400 hover:bg-jp-surface-3 rounded transition-colors"
          aria-label={`Remover ${item.label}`}
          title="Remover"
        >
          <Trash2 size={11} />
        </button>
        <span
          className={`p-1 ${resuming ? "text-jp-gold animate-pulse" : "text-jp-fg-dim"}`}
          aria-hidden
        >
          <Play size={11} />
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION HEADER
// ============================================================================

function SectionHeader({
  icon,
  title,
  count,
  collapsed,
  onToggle,
  onAdd,
  addActive,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
  addActive: boolean;
}): ReactNode {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-jp-surface-2/40 hover:bg-jp-surface-2/70 transition-colors group">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 flex-1 text-left"
        aria-expanded={!collapsed}
      >
        <span className="text-jp-fg-dim group-hover:text-jp-fg-muted">
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </span>
        <span className="text-jp-gold flex items-center justify-center">
          {icon}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-jp-fg">
          {title}
        </span>
        <span className="text-[9px] text-jp-fg-dim tabular-nums ml-1">
          {count}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
        className={`p-1 rounded transition-colors ${
          addActive
            ? "text-jp-gold bg-jp-surface-3"
            : "text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-3"
        }`}
        aria-label={`Adicionar em ${title}`}
        title={`Adicionar em ${title}`}
      >
        <Plus size={11} />
      </button>
    </div>
  );
}

// ============================================================================
// MAIN PANEL
// ============================================================================

export function QuickLinksPanel(): ReactNode {
  const links = useQuickLinksStore((s) => s.links);
  const isLinksLoaded = useQuickLinksStore((s) => s.isLoaded);
  const loadLinks = useQuickLinksStore((s) => s.load);
  const addLink = useQuickLinksStore((s) => s.add);
  const updateLink = useQuickLinksStore((s) => s.update);
  const reorderLink = useQuickLinksStore((s) => s.reorder);

  const quickSessions = useQuickSessionsStore((s) => s.sessions);
  const isSessionsLoaded = useQuickSessionsStore((s) => s.isLoaded);
  const loadSessions = useQuickSessionsStore((s) => s.load);
  const addSession = useQuickSessionsStore((s) => s.add);
  const updateSession = useQuickSessionsStore((s) => s.update);
  const reorderSession = useQuickSessionsStore((s) => s.reorder);

  // Sessões ao vivo via contexto compartilhado da sidebar (mesma fonte do
  // PinnedFoldersPanel — evita uma segunda chamada de /sessions). Painel
  // pode ser renderizado fora do provider, então cai pra array vazia.
  const sessionsCtx = useContext(SessionsPanelContextRaw);
  const liveSessions: Session[] = sessionsCtx?.sessions ?? [];
  const liveSessionMap = useMemo(() => {
    const m = new Map<string, Session>();
    for (const s of liveSessions) m.set(s.id, s);
    return m;
  }, [liveSessions]);

  // Collapsed state por seção, persistido em localStorage.
  const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>({
    externals: false,
    sessions: false,
  });
  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);
  const toggleSection = (id: SectionId) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      writeCollapsed(next);
      return next;
    });
  };

  // Forms state — só um aberto por vez, em qualquer seção.
  const [addingIn, setAddingIn] = useState<SectionId | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  const editingLink =
    editingLinkId !== null
      ? links.find((l) => l.id === editingLinkId)
      : undefined;
  const editingSession =
    editingSessionId !== null
      ? quickSessions.find((s) => s.id === editingSessionId)
      : undefined;

  const closeAllForms = () => {
    setAddingIn(null);
    setEditingLinkId(null);
    setEditingSessionId(null);
  };

  const handleAddToggle = (section: SectionId) => {
    setEditingLinkId(null);
    setEditingSessionId(null);
    setAddingIn((cur) => (cur === section ? null : section));
    // Se a seção estiver fechada, abre ela
    if (collapsed[section]) toggleSection(section);
  };

  const handleEditLink = (id: string) => {
    setAddingIn(null);
    setEditingSessionId(null);
    setEditingLinkId(id);
  };

  const handleEditSession = (id: string) => {
    setAddingIn(null);
    setEditingLinkId(null);
    setEditingSessionId(id);
  };

  // Drag-and-drop sensor — distance:4 evita capturar cliques no card.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleLinkDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    void reorderLink(String(active.id), String(over.id));
  };

  const handleSessionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    void reorderSession(String(active.id), String(over.id));
  };

  useEffect(() => {
    if (!isLinksLoaded) void loadLinks();
    if (!isSessionsLoaded) void loadSessions();
  }, [isLinksLoaded, loadLinks, isSessionsLoaded, loadSessions]);

  const totalItems = links.length + quickSessions.length;
  const isLoaded = isLinksLoaded && isSessionsLoaded;

  return (
    <div className="flex flex-col min-h-0 flex-grow">
      <div className="px-3 py-1.5 text-[10px] text-jp-fg-dim font-mono border-b border-jp-divider-soft flex-shrink-0">
        {totalItems} {totalItems === 1 ? "atalho" : "atalhos"}
      </div>

      <div className="overflow-y-auto flex-grow p-2 flex flex-col gap-2">
        {!isLoaded ? (
          <div className="p-4 text-center text-jp-fg-dim text-xs italic">
            Carregando...
          </div>
        ) : (
          <>
            {/* ─── SEÇÃO EXTERNOS ───────────────────────────────────── */}
            <section className="flex flex-col gap-1">
              <SectionHeader
                icon={<Globe size={12} />}
                title="Externos"
                count={links.length}
                collapsed={collapsed.externals}
                onToggle={() => toggleSection("externals")}
                onAdd={() => handleAddToggle("externals")}
                addActive={addingIn === "externals"}
              />
              {!collapsed.externals && (
                <div className="flex flex-col gap-1.5 pl-1">
                  {addingIn === "externals" && (
                    <LinkForm
                      key="new-link"
                      onSubmit={addLink}
                      onClose={closeAllForms}
                    />
                  )}
                  {editingLink && (
                    <LinkForm
                      key={`edit-link-${editingLink.id}`}
                      initial={editingLink}
                      onSubmit={(payload) =>
                        updateLink(editingLink.id, payload)
                      }
                      onClose={closeAllForms}
                    />
                  )}
                  {links.length === 0 && addingIn !== "externals" ? (
                    <div className="px-2 py-3 text-center text-jp-fg-dim text-[11px] italic">
                      Nenhum link externo. Clique em + acima.
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleLinkDragEnd}
                    >
                      <SortableContext
                        items={links.map((l) => l.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="flex flex-col gap-1.5">
                          {links.map((link) =>
                            editingLinkId === link.id ? null : (
                              <LinkCard
                                key={link.id}
                                link={link}
                                onEdit={handleEditLink}
                              />
                            ),
                          )}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              )}
            </section>

            {/* ─── SEÇÃO SESSÕES CLAUDE ────────────────────────────── */}
            <section className="flex flex-col gap-1">
              <SectionHeader
                icon={<Bot size={12} />}
                title="Sessões Claude"
                count={quickSessions.length}
                collapsed={collapsed.sessions}
                onToggle={() => toggleSection("sessions")}
                onAdd={() => handleAddToggle("sessions")}
                addActive={addingIn === "sessions"}
              />
              {!collapsed.sessions && (
                <div className="flex flex-col gap-1.5 pl-1">
                  {addingIn === "sessions" && (
                    <SessionForm
                      key="new-session"
                      sessions={liveSessions}
                      onSubmit={addSession}
                      onClose={closeAllForms}
                    />
                  )}
                  {editingSession && (
                    <SessionForm
                      key={`edit-session-${editingSession.id}`}
                      initial={editingSession}
                      sessions={liveSessions}
                      onSubmit={(payload) =>
                        updateSession(editingSession.id, payload)
                      }
                      onClose={closeAllForms}
                    />
                  )}
                  {quickSessions.length === 0 && addingIn !== "sessions" ? (
                    <div className="px-2 py-3 text-center text-jp-fg-dim text-[11px] italic">
                      Nenhuma sessão fixada. Clique em + acima.
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleSessionDragEnd}
                    >
                      <SortableContext
                        items={quickSessions.map((s) => s.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="flex flex-col gap-1.5">
                          {quickSessions.map((item) =>
                            editingSessionId === item.id ? null : (
                              <SessionCard
                                key={item.id}
                                item={item}
                                liveSession={liveSessionMap.get(item.sessionId)}
                                onEdit={handleEditSession}
                              />
                            ),
                          )}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
