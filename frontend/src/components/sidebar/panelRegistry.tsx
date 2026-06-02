"use client";

import {
  Activity,
  Bot,
  Clock,
  Folder,
  GitBranch,
  MessageSquare,
  Radio,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { PanelId, SidebarId } from "@/stores/layoutStore";
import { AgentStatus } from "@/components/game/AgentStatus";
import { EventLog } from "@/components/game/EventLog";
import { ConversationHistory } from "@/components/game/ConversationHistory";
import { AmbientRadio } from "@/components/radio/AmbientRadio";
import { SessionHistoryPanel } from "@/components/layout/SessionHistoryPanel";
import { GitStatusPanel } from "@/components/game/GitStatusPanel";
import { SessionsPanel } from "@/components/sidebar/panels/SessionsPanel";

// ============================================================================
// TYPES
// ============================================================================

export interface PanelDefinition {
  id: PanelId;
  sidebar: SidebarId;
  /** Title used in the accordion header. Can be a static label or a function
   *  resolved at render time (useful for i18n). */
  title: string;
  icon: LucideIcon;
  /** If true, content remains mounted (via opacity/height) when collapsed so
   *  that long-lived resources (e.g., YouTube iframe) survive toggles. */
  alwaysMounted?: boolean;
  render: () => ReactNode;
}

// ============================================================================
// REGISTRY
// ============================================================================

export const PANEL_REGISTRY: Record<PanelId, PanelDefinition> = {
  // ── LEFT SIDEBAR ───────────────────────────────────────────────────
  sessions: {
    id: "sessions",
    sidebar: "left",
    title: "Sessões",
    icon: Folder,
    render: () => <SessionsPanel />,
  },
  "git-status": {
    id: "git-status",
    sidebar: "left",
    title: "Status do Git",
    icon: GitBranch,
    render: () => <GitStatusPanel />,
  },

  // ── RIGHT SIDEBAR ──────────────────────────────────────────────────
  "agent-status": {
    id: "agent-status",
    sidebar: "right",
    title: "Estado dos Agentes",
    icon: Bot,
    render: () => <AgentStatus />,
  },
  events: {
    id: "events",
    sidebar: "right",
    title: "Eventos",
    icon: Activity,
    render: () => <EventLog />,
  },
  conversation: {
    id: "conversation",
    sidebar: "right",
    title: "Conversa",
    icon: MessageSquare,
    render: () => <ConversationHistory />,
  },
  radio: {
    id: "radio",
    sidebar: "right",
    title: "Rádio",
    icon: Radio,
    alwaysMounted: true,
    render: () => <AmbientRadio />,
  },
  history: {
    id: "history",
    sidebar: "right",
    title: "Histórico",
    icon: Clock,
    render: () => <SessionHistoryPanel />,
  },
};

export function getPanel(id: PanelId): PanelDefinition {
  return PANEL_REGISTRY[id];
}
