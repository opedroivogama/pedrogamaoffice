"use client";

import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Extension, wrappingInputRule } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { marked } from "marked";
import TurndownService from "turndown";
import { useEffect, useMemo, useRef } from "react";

// Atalho: digitar `[] `, `[ ] ` ou `[x] ` no início da linha vira um task
// item. wrappingInputRule envolve o nó atual em taskList → taskItem.
const TaskListShortcut = Extension.create({
  name: "taskListShortcut",
  addInputRules() {
    const type = this.editor.schema.nodes.taskList;
    if (!type) return [];
    return [
      wrappingInputRule({
        find: /^\[( |x|X)?\]\s$/,
        type,
      }),
    ];
  },
});

interface NoteEditorProps {
  noteId: string;
  initialBody: string;
  onBodyChange: (markdown: string) => void;
}

// marked padrão: GFM, breaks ON pra que line-break vire <br>
marked.setOptions({ gfm: true, breaks: true });

function mdToHtml(md: string): string {
  if (!md) return "";
  // .parse() sob configuração padrão é síncrono e retorna string. Pra
  // garantir o tipo aqui (TipTap precisa de string), envelopamos em String().
  return String(marked.parse(md));
}

export default function NoteEditor({
  noteId,
  initialBody,
  onBodyChange,
}: NoteEditorProps) {
  const turndown = useMemo(() => {
    const td = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "*",
    });
    // GFM task items: <li data-type="taskItem" data-checked="…"> → `- [x] …`
    td.addRule("taskItem", {
      filter: (node) =>
        node.nodeName === "LI" &&
        (node as HTMLElement).getAttribute("data-type") === "taskItem",
      replacement: (content, node) => {
        const el = node as HTMLElement;
        const checkedAttr = el.getAttribute("data-checked");
        const checked =
          checkedAttr === "true" ||
          !!el.querySelector('input[type="checkbox"]:checked');
        const cleaned = content
          .replace(/\n+/g, " ")
          .replace(/^\s+|\s+$/g, "");
        return `- [${checked ? "x" : " "}] ${cleaned}\n`;
      },
    });
    // taskList wrapper não precisa de envolver com bullet — só passa o conteúdo
    td.addRule("taskList", {
      filter: (node) =>
        node.nodeName === "UL" &&
        (node as HTMLElement).getAttribute("data-type") === "taskList",
      replacement: (content) => `\n${content}\n`,
    });
    return td;
  }, []);

  // Debounce do save (300ms) — evita flooding do backend a cada tecla.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<string>("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Comece a escrever... (dica: digite [] pra checkbox)",
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        HTMLAttributes: {
          class: "text-jp-gold underline cursor-pointer",
        },
      }),
      TaskList.configure({
        HTMLAttributes: { class: "jp-task-list" },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: { class: "jp-task-item" },
      }),
      TaskListShortcut,
    ],
    content: mdToHtml(initialBody),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-invert prose-jp max-w-none focus:outline-none min-h-full px-8 py-6",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const md = turndown.turndown(html);
      pendingSave.current = md;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const toSave = pendingSave.current;
        // Limpa antes de chamar pra evitar que o cleanup do effect de
        // unmount re-dispare o mesmo save quando o callback mudar de
        // identidade (re-render do pai).
        pendingSave.current = "";
        saveTimer.current = null;
        onBodyChange(toSave);
      }, 300);
    },
  });

  // Trocar de nota selecionada → resetar conteúdo do editor sem trigger de
  // save. Cancela qualquer save pendente da nota anterior.
  useEffect(() => {
    if (!editor) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingSave.current = "";
    editor.commands.setContent(mdToHtml(initialBody), { emitUpdate: false });
    // initialBody só muda quando trocamos de nota — não queremos reset a
    // cada keystroke. Por isso o effect depende de noteId, não do body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, editor]);

  // Flush no unmount pra não perder mudança em andamento.
  useEffect(() => {
    return () => {
      if (saveTimer.current && pendingSave.current) {
        clearTimeout(saveTimer.current);
        onBodyChange(pendingSave.current);
      }
    };
  }, [onBodyChange]);

  if (!editor) {
    return <div className="flex-1 bg-jp-surface-2" />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-jp-surface-2">
      <Toolbar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Evita perda de seleção no editor antes de aplicar o comando
        e.preventDefault();
      }}
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? "bg-jp-gold/20 text-jp-gold"
          : "text-jp-fg-muted hover:bg-jp-surface-1 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  };

  return (
    <div className="flex items-center gap-0.5 px-3 py-2 border-b border-jp-divider-soft bg-jp-surface-1/50 flex-shrink-0">
      <ToolbarButton
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Negrito (Ctrl+B)"
      >
        <Bold size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Itálico (Ctrl+I)"
      >
        <Italic size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Tachado"
      >
        <Strikethrough size={16} />
      </ToolbarButton>

      <div className="w-px h-5 bg-jp-divider-soft mx-1" />

      <ToolbarButton
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="Título 1"
      >
        <Heading1 size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Título 2"
      >
        <Heading2 size={16} />
      </ToolbarButton>

      <div className="w-px h-5 bg-jp-divider-soft mx-1" />

      <ToolbarButton
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Lista"
      >
        <List size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Lista numerada"
      >
        <ListOrdered size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Citação"
      >
        <Quote size={16} />
      </ToolbarButton>

      <div className="w-px h-5 bg-jp-divider-soft mx-1" />

      <ToolbarButton
        active={editor.isActive("link")}
        onClick={setLink}
        title="Link"
      >
        <LinkIcon size={16} />
      </ToolbarButton>

      <div className="flex-1" />

      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        title="Desfazer (Ctrl+Z)"
      >
        <Undo2 size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        title="Refazer (Ctrl+Shift+Z)"
      >
        <Redo2 size={16} />
      </ToolbarButton>
    </div>
  );
}
