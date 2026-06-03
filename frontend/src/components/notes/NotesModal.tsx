"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotesStore, type Note } from "@/stores/notesStore";
import NoteEditor from "./NoteEditor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
}

function previewBody(body: string, max = 60): string {
  // Tira marcadores markdown da prévia da lista
  const stripped = body
    .replace(/[#*_`>-]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  if (stripped.length <= max) return stripped;
  return stripped.slice(0, max - 1) + "…";
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function NotesModal() {
  const isOpen = useNotesStore((s) => s.isOpen);
  const close = useNotesStore((s) => s.close);
  const notes = useNotesStore((s) => s.notes);
  const selectedId = useNotesStore((s) => s.selectedId);
  const isLoading = useNotesStore((s) => s.isLoading);
  const error = useNotesStore((s) => s.error);
  const fetchAll = useNotesStore((s) => s.fetchAll);
  const createNote = useNotesStore((s) => s.createNote);
  const updateNote = useNotesStore((s) => s.updateNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);
  const select = useNotesStore((s) => s.select);

  // Fechar com ESC
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const selected = useMemo<Note | null>(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
  );

  // Usa selectedId (não selected) pra estabilizar a identidade do callback.
  // selected é recriado a cada updateNote optimistic, o que invalidaria o
  // useEffect de flush no NoteEditor e dispararia loop de re-saves.
  const handleBodyChange = useCallback(
    (body: string) => {
      if (!selectedId) return;
      void updateNote(selectedId, { body });
    },
    [selectedId, updateNote],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-10 lg:p-16 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notes-modal-title"
        className="bg-jp-surface-1 border border-jp-divider-soft rounded-2xl shadow-2xl shadow-black/50 w-full max-w-6xl h-full max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-jp-divider-soft bg-jp-surface-1/50 flex-shrink-0">
          <h2
            id="notes-modal-title"
            className="text-lg font-bold text-white tracking-tight"
          >
            Notas
            <span className="ml-2 text-xs font-normal text-jp-fg-muted">
              {notes.length > 0 && `· ${notes.length}`}
            </span>
          </h2>
          <button
            onClick={close}
            aria-label="Fechar"
            className="p-1 hover:bg-jp-surface-2 rounded-lg text-jp-fg-muted hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body — 2 colunas */}
        <div className="flex-1 flex min-h-0">
          <NotesSidebar
            notes={notes}
            selectedId={selectedId}
            isLoading={isLoading}
            error={error}
            onSelect={select}
            onCreate={() => void createNote()}
            onDelete={(id) => {
              if (window.confirm("Apagar esta nota?")) void deleteNote(id);
            }}
            onRetry={() => void fetchAll()}
          />

          {selected ? (
            <NoteWorkspace
              note={selected}
              onTitleChange={(title) =>
                void updateNote(selected.id, { title })
              }
              onBodyChange={handleBodyChange}
            />
          ) : (
            <EmptyState onCreate={() => void createNote()} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function NotesSidebar({
  notes,
  selectedId,
  isLoading,
  error,
  onSelect,
  onCreate,
  onDelete,
  onRetry,
}: {
  notes: Note[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <aside className="w-72 flex-shrink-0 border-r border-jp-divider-soft bg-jp-surface-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-jp-divider-soft flex-shrink-0">
        <button
          onClick={onCreate}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-jp-gold/15 hover:bg-jp-gold/25 text-jp-gold text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Nova nota
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="px-3 py-4 text-xs text-red-400">
            <p>Falha ao carregar: {error}</p>
            <button
              onClick={onRetry}
              className="mt-2 underline text-jp-fg-muted hover:text-white"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {!error && isLoading && notes.length === 0 && (
          <div className="px-3 py-4 text-xs text-jp-fg-muted">Carregando…</div>
        )}

        {!error && !isLoading && notes.length === 0 && (
          <div className="px-3 py-6 text-xs text-jp-fg-muted text-center">
            Sem notas ainda. Clica em <strong>Nova nota</strong>.
          </div>
        )}

        <ul className="py-1">
          {notes.map((n) => {
            const active = n.id === selectedId;
            return (
              <li key={n.id}>
                <button
                  onClick={() => onSelect(n.id)}
                  className={`group w-full text-left px-3 py-2.5 border-l-2 transition-colors ${
                    active
                      ? "bg-jp-surface-2 border-jp-gold"
                      : "border-transparent hover:bg-jp-surface-2/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-medium truncate ${
                          active ? "text-white" : "text-jp-fg"
                        }`}
                      >
                        {n.title || "Sem título"}
                      </div>
                      <div className="text-xs text-jp-fg-muted truncate mt-0.5">
                        {previewBody(n.body) || "—"}
                      </div>
                      <div className="text-[10px] text-jp-fg-muted/70 mt-1 uppercase tracking-wide">
                        {formatDate(n.updated_at)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(n.id);
                      }}
                      title="Apagar nota"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-jp-fg-muted hover:text-red-400 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Workspace (editor + título)
// ---------------------------------------------------------------------------

function NoteWorkspace({
  note,
  onTitleChange,
  onBodyChange,
}: {
  note: Note;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: string) => void;
}) {
  // Título local pra digitação fluida; sincroniza com store no blur ou após
  // debounce.
  const [localTitle, setLocalTitle] = useState(note.title);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalTitle(note.title);
  }, [note.id, note.title]);

  const flushTitle = useCallback(
    (next: string) => {
      if (next.trim() !== note.title.trim()) {
        onTitleChange(next.trim() || "Sem título");
      }
    },
    [note.title, onTitleChange],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-8 pt-6 pb-2 flex-shrink-0">
        <input
          value={localTitle}
          onChange={(e) => {
            const v = e.target.value;
            setLocalTitle(v);
            if (titleTimer.current) clearTimeout(titleTimer.current);
            titleTimer.current = setTimeout(() => flushTitle(v), 500);
          }}
          onBlur={() => {
            if (titleTimer.current) {
              clearTimeout(titleTimer.current);
              titleTimer.current = null;
            }
            flushTitle(localTitle);
          }}
          placeholder="Título da nota"
          className="w-full bg-transparent text-2xl font-bold text-white placeholder:text-jp-fg-muted/60 outline-none"
        />
        <div className="mt-1 text-xs text-jp-fg-muted">
          Atualizado em {formatDate(note.updated_at)}
        </div>
      </div>

      <NoteEditor
        noteId={note.id}
        initialBody={note.body}
        onBodyChange={onBodyChange}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estado vazio
// ---------------------------------------------------------------------------

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-jp-surface-2">
      <div className="text-center">
        <p className="text-jp-fg-muted text-sm mb-3">
          Selecione uma nota ou crie uma nova.
        </p>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-jp-gold/15 hover:bg-jp-gold/25 text-jp-gold text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Nova nota
        </button>
      </div>
    </div>
  );
}
