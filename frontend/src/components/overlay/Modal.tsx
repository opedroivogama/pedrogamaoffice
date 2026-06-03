"use client";

import { Maximize2, Minimize2, X } from "lucide-react";
import { ReactNode, useEffect, useId, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  /** Visual width tier when not maximized. Defaults to "sm" (legacy). */
  size?: ModalSize;
  /** When true, renders a toggle button next to ✕ to switch normal ↔ near-fullscreen. */
  maximizable?: boolean;
  /** Start maximized when first opened. Resets to false on each open. */
  defaultMaximized?: boolean;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-md max-h-[80vh]",
  md: "max-w-2xl max-h-[85vh]",
  lg: "max-w-4xl max-h-[85vh]",
};

const MAXIMIZED_CLASS = "max-w-none w-[calc(100vw-2rem)] h-[calc(100vh-2rem)]";

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
  size = "sm",
  maximizable = false,
  defaultMaximized = false,
}: ModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [isMaximized, setIsMaximized] = useState(defaultMaximized);

  // Reset to defaultMaximized whenever the modal reopens. Intentional setState
  // in effect: this is a "sync external prop change → local state" pattern
  // (not a cascading derived value). React's rule is conservative here.
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsMaximized(defaultMaximized);
    }
  }, [isOpen, defaultMaximized]);

  // Close on Escape key (only if dismissible)
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
    }
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose, dismissible]);

  if (!isOpen) return null;

  const sizeClass = isMaximized ? MAXIMIZED_CLASS : SIZE_CLASS[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={dismissible ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-jp-surface-1 border border-jp-divider-soft rounded-xl shadow-2xl w-full ${sizeClass} flex flex-col overflow-hidden animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-jp-divider-soft bg-jp-surface-1/50 flex-shrink-0">
          <h2
            id={titleId}
            className="text-lg font-bold text-white tracking-tight"
          >
            {title}
          </h2>
          <div className="flex items-center gap-1">
            {maximizable && (
              <button
                onClick={() => setIsMaximized((m) => !m)}
                aria-label={isMaximized ? t("modal.minimize") : t("modal.maximize")}
                title={isMaximized ? t("modal.minimize") : t("modal.maximize")}
                className="p-1 hover:bg-jp-surface-2 rounded-lg text-jp-fg-muted hover:text-white transition-colors"
              >
                {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={t("modal.close")}
              className="p-1 hover:bg-jp-surface-2 rounded-lg text-jp-fg-muted hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 text-jp-fg text-sm leading-relaxed overflow-y-auto flex-1 min-h-0">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-jp-divider-soft bg-jp-surface-1/50 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
