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

const SessionsPanelContext = createContext<SessionsPanelContextValue | null>(
  null,
);

export function SessionsPanelProvider({
  value,
  children,
}: {
  value: SessionsPanelContextValue;
  children: ReactNode;
}): React.ReactNode {
  return (
    <SessionsPanelContext.Provider value={value}>
      {children}
    </SessionsPanelContext.Provider>
  );
}

export function useSessionsPanelContext(): SessionsPanelContextValue {
  const ctx = useContext(SessionsPanelContext);
  if (!ctx) {
    throw new Error(
      "useSessionsPanelContext must be used inside <SessionsPanelProvider>",
    );
  }
  return ctx;
}
