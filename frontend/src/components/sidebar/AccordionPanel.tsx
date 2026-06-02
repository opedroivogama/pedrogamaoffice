"use client";

import { ChevronDown, GripVertical, type LucideIcon } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

interface AccordionPanelProps {
  title: string;
  Icon: LucideIcon;
  isCollapsed: boolean;
  alwaysMounted: boolean;
  isDragging: boolean;
  onToggle: () => void;

  /** Drag handle wiring from @dnd-kit/sortable. */
  dragListeners?: HTMLAttributes<HTMLButtonElement>;
  dragAttributes?: HTMLAttributes<HTMLDivElement>;

  /** Transform/transition style from @dnd-kit's useSortable. */
  style?: CSSProperties;

  /** If set, the panel renders at this exact height (px) with flex-shrink-0.
   *  If undefined, the panel flex-grows and shares leftover space with siblings. */
  height?: number;
  /** Called while the user drags the bottom edge. */
  onResize?: (height: number) => void;
  /** Called on double-click of the resize handle (reset to flex-grow). */
  onResizeReset?: () => void;

  children: ReactNode;
}

const MIN_PANEL_HEIGHT = 80;

/**
 * A single accordion block: header with drag handle + icon + title + caret,
 * and a collapsible body. When `alwaysMounted` is true, the body stays in
 * the DOM (height/opacity collapsed) so that long-lived resources like the
 * AmbientRadio iframe survive toggles.
 */
export const AccordionPanel = forwardRef<HTMLDivElement, AccordionPanelProps>(
  function AccordionPanel(
    {
      title,
      Icon,
      isCollapsed,
      alwaysMounted,
      isDragging,
      onToggle,
      dragListeners,
      dragAttributes,
      style,
      height,
      onResize,
      onResizeReset,
      children,
    },
    ref,
  ) {
    const localRef = useRef<HTMLDivElement | null>(null);
    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        localRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const [isResizing, setIsResizing] = useState(false);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    useEffect(() => {
      if (!isResizing || !onResize) return;
      const onMove = (e: MouseEvent) => {
        const delta = e.clientY - startYRef.current;
        onResize(Math.max(MIN_PANEL_HEIGHT, startHeightRef.current + delta));
      };
      const onUp = () => setIsResizing(false);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      // Lock cursor & disable text selection during drag
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      return () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
      };
    }, [isResizing, onResize]);

    const handleResizeStart = (e: React.MouseEvent) => {
      if (!onResize || !localRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      startYRef.current = e.clientY;
      startHeightRef.current = localRef.current.getBoundingClientRect().height;
      setIsResizing(true);
    };

    const resizable = !isCollapsed && onResize !== undefined;
    const pinned = resizable && height !== undefined;

    const mergedStyle: CSSProperties = {
      ...style,
      ...(pinned ? { height } : {}),
    };

    const sizingClass = isCollapsed
      ? "flex-shrink-0"
      : pinned
        ? "flex-shrink-0 min-h-0"
        : "min-h-0 flex-grow";

    return (
      <div
        ref={setRefs}
        style={mergedStyle}
        className={`flex flex-col bg-jp-surface-1 border border-jp-divider-soft rounded-lg overflow-hidden ${
          isDragging ? "shadow-lg ring-1 ring-jp-gold/40 opacity-90" : ""
        } ${sizingClass}`}
        {...dragAttributes}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-2 py-1.5 bg-jp-surface-2 border-b border-jp-divider-soft select-none cursor-pointer hover:bg-jp-surface-3/40 transition-colors flex-shrink-0"
          onClick={onToggle}
          role="button"
          tabIndex={0}
          aria-expanded={!isCollapsed}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle();
            }
          }}
        >
          {/* Drag handle — only this element starts a drag */}
          <button
            type="button"
            aria-label={`Reordenar ${title}`}
            className="flex items-center justify-center text-jp-fg-dim hover:text-jp-fg-muted cursor-grab active:cursor-grabbing touch-none"
            onClick={(e) => {
              e.stopPropagation();
            }}
            {...dragListeners}
          >
            <GripVertical size={14} />
          </button>

          <Icon size={12} className="text-jp-fg-muted" />
          <span className="flex-grow text-[11px] font-bold uppercase tracking-wider text-jp-fg-muted truncate">
            {title}
          </span>
          <ChevronDown
            size={14}
            className={`text-jp-fg-dim transition-transform duration-200 ${
              isCollapsed ? "-rotate-90" : ""
            }`}
          />
        </div>

        {/* Body */}
        {alwaysMounted ? (
          <div
            style={{
              height: isCollapsed ? 0 : undefined,
              opacity: isCollapsed ? 0 : 1,
              pointerEvents: isCollapsed ? "none" : "auto",
              overflow: "hidden",
            }}
            className={isCollapsed ? "" : "flex-grow flex flex-col min-h-0"}
          >
            {children}
          </div>
        ) : (
          !isCollapsed && (
            <div className="flex-grow flex flex-col min-h-0 overflow-hidden">
              {children}
            </div>
          )
        )}

        {/* Resize handle — bottom edge of the panel. Drag to pin a height;
            double-click to release back to flex-grow. Hidden when collapsed
            (the body has no height to resize). */}
        {resizable && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={`Redimensionar ${title}`}
            onMouseDown={handleResizeStart}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onResizeReset?.();
            }}
            onClick={(e) => e.stopPropagation()}
            title={
              pinned
                ? "Arrastar para redimensionar (duplo-clique para soltar)"
                : "Arrastar para fixar altura"
            }
            className={`flex-shrink-0 h-1.5 cursor-ns-resize transition-colors ${
              isResizing
                ? "bg-jp-gold/60"
                : pinned
                  ? "bg-jp-gold/25 hover:bg-jp-gold/50"
                  : "bg-jp-divider-soft hover:bg-jp-gold/40"
            }`}
          />
        )}
      </div>
    );
  },
);
