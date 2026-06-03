/**
 * Centralised gate for global keyboard shortcuts.
 *
 * Returns true when a shortcut handler should bail out — either because the
 * user is typing into a text field (so the key belongs to that field) or
 * because a character is currently under manual control (the player owns the
 * keyboard for movement and shouldn't accidentally trigger D/E/P/Ctrl+K/etc.).
 *
 * Movement keys themselves are handled inside `usePlayerControl`, which is the
 * authoritative consumer during a control session — that hook does NOT call
 * this gate (it IS the active mode). Everything else should.
 */

import { useGameStore } from "@/stores/gameStore";

/** True if a text-entry surface owns the keyboard right now. */
function isTextEntryFocused(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) {
    // Fall back to document.activeElement when the event doesn't carry a
    // useful target (e.g. synthetic events, IME composition).
    const active = typeof document !== "undefined" ? document.activeElement : null;
    return isEditable(active as HTMLElement | null);
  }
  return isEditable(el);
}

function isEditable(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Bail-out check for any global shortcut handler.
 *
 * @param event - The KeyboardEvent that fired the handler. Optional; when
 *   omitted, falls back to `document.activeElement` for the text-entry probe.
 */
export function shouldIgnoreShortcut(event?: KeyboardEvent): boolean {
  if (isTextEntryFocused(event?.target ?? null)) return true;
  if (useGameStore.getState().controlledEntityId !== null) return true;
  return false;
}
