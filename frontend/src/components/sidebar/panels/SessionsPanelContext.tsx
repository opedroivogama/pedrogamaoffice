"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Session } from "@/hooks/useSessions";

interface SessionsPanelContextValue {
  sessions: Session[];
  sessionsLoading: boolean;
  sessionId: string;
  onSessionSelect: (id: string) => Promise<void>;
  onDeleteSession: (session: Session) => void;
  onRenameSession: (sessionId: string, newName: string) => Promise<void>;
}

/** Contexto cru — exportado pra quem precisar do useContext direto
 *  (com fallback null), como o QuickLinksPanel. Use o hook
 *  `useSessionsPanelContext` quando o painel REQUER o provider. */
export const SessionsPanelContextRaw =
  createContext<SessionsPanelContextValue | null>(null);

export function SessionsPanelProvider({
  value,
  children,
}: {
  value: SessionsPanelContextValue;
  children: ReactNode;
}): React.ReactNode {
  return (
    <SessionsPanelContextRaw.Provider value={value}>
      {children}
    </SessionsPanelContextRaw.Provider>
  );
}

export function useSessionsPanelContext(): SessionsPanelContextValue {
  const ctx = useContext(SessionsPanelContextRaw);
  if (!ctx) {
    throw new Error(
      "useSessionsPanelContext must be used inside <SessionsPanelProvider>",
    );
  }
  return ctx;
}
