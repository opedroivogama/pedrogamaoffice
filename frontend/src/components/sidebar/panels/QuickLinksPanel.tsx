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
  ExternalLink,
  GripVertical,
  Link2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  useQuickLinksStore,
  type QuickLink,
} from "@/stores/quickLinksStore";

// ============================================================================
// PALETA — opções pré-definidas pra cor da bolinha
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

// ============================================================================
// FORM — adicionar / editar
// ============================================================================

function LinkForm({
  initial,
  onSubmit,
  onClose,
}: {
  initial?: QuickLink;
  /** Callback fixo. Add ou update é decidido pelo parent — evita
   *  decisão interna baseada em isEditing/initial, que dava bug de
   *  duplicação em alguns ciclos de reconciliação do React. */
  onSubmit: (payload: Omit<QuickLink, "id">) => Promise<void>;
  onClose: () => void;
}): React.ReactNode {
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
          {isEditing ? "Editar link" : "Novo link"}
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
      <div className="flex flex-col gap-1">
        <span className="text-[9px] uppercase tracking-wide text-jp-fg-dim font-mono">
          Cor
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {COLOR_SWATCHES.map((c) => {
            const selected = color.toLowerCase() === c.value.toLowerCase();
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
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
// LINK CARD
// ============================================================================

function LinkCard({
  link,
  onEdit,
}: {
  link: QuickLink;
  onEdit: (id: string) => void;
}): React.ReactNode {
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
        style={{
          backgroundColor: `${color}1f`,
          color,
        }}
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
// MAIN PANEL
// ============================================================================

export function QuickLinksPanel(): React.ReactNode {
  const links = useQuickLinksStore((s) => s.links);
  const isLoaded = useQuickLinksStore((s) => s.isLoaded);
  const load = useQuickLinksStore((s) => s.load);
  const reorder = useQuickLinksStore((s) => s.reorder);
  const add = useQuickLinksStore((s) => s.add);
  const update = useQuickLinksStore((s) => s.update);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Pequena distância antes do drag começar pra não capturar cliques normais
  // (que abrem o link em nova guia).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    void reorder(String(active.id), String(over.id));
  };

  useEffect(() => {
    if (!isLoaded) void load();
  }, [isLoaded, load]);

  const editingLink =
    editingId !== null ? links.find((l) => l.id === editingId) : undefined;

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

  return (
    <div className="flex flex-col min-h-0 flex-grow">
      <div className="px-3 py-1.5 text-[10px] text-jp-fg-dim font-mono border-b border-jp-divider-soft flex-shrink-0 flex items-center justify-between gap-2">
        <span>
          {links.length} {links.length === 1 ? "link" : "links"}
        </span>
        <button
          type="button"
          onClick={handleAddToggle}
          className={`p-1 rounded transition-colors ${
            adding
              ? "text-jp-gold bg-jp-surface-2"
              : "text-jp-fg-dim hover:text-jp-gold hover:bg-jp-surface-2"
          }`}
          title="Adicionar link"
          aria-label="Adicionar link"
        >
          <Plus size={11} />
        </button>
      </div>

      <div className="overflow-y-auto flex-grow p-2 flex flex-col gap-1.5">
        {adding && (
          <LinkForm key="new" onSubmit={add} onClose={closeForm} />
        )}
        {editingLink && (
          <LinkForm
            key={`edit-${editingLink.id}`}
            initial={editingLink}
            onSubmit={(payload) => update(editingLink.id, payload)}
            onClose={closeForm}
          />
        )}

        {!isLoaded ? (
          <div className="p-4 text-center text-jp-fg-dim text-xs italic">
            Carregando...
          </div>
        ) : links.length === 0 && !adding ? (
          <div className="p-4 text-center text-jp-fg-dim text-xs italic">
            Nenhum link fixado. Clique em + pra adicionar.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={links.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-1.5">
                {links.map((link) =>
                  editingId === link.id ? null : (
                    <LinkCard
                      key={link.id}
                      link={link}
                      onEdit={handleEdit}
                    />
                  ),
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
