"use client";

import {
  Activity,
  Bot,
  Clock,
  Folder,
  GitBranch,
  LayoutGrid,
  Link2,
  MessageCircle,
  MessageSquare,
  Pin,
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
import { ChatPanel } from "@/components/sidebar/panels/ChatPanel";
import { MenuPanel } from "@/components/sidebar/panels/MenuPanel";
import { PinnedFoldersPanel } from "@/components/sidebar/panels/PinnedFoldersPanel";
import { QuickLinksPanel } from "@/components/sidebar/panels/QuickLinksPanel";
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
  menu: {
    id: "menu",
    sidebar: "left",
    title: "Menu",
    icon: LayoutGrid,
    render: () => <MenuPanel />,
  },
  sessions: {
    id: "sessions",
    sidebar: "left",
    title: "Sessões",
    icon: Folder,
    render: () => <SessionsPanel />,
  },
  "pinned-folders": {
    id: "pinned-folders",
    sidebar: "left",
    title: "Pastas",
    icon: Pin,
    render: () => <PinnedFoldersPanel />,
  },
  "quick-links": {
    id: "quick-links",
    sidebar: "left",
    title: "Acesso Rápido",
    icon: Link2,
    render: () => <QuickLinksPanel />,
  },
  "git-status": {
    id: "git-status",
    sidebar: "left",
    title: "Status do Git",
    icon: GitBranch,
    render: () => <GitStatusPanel />,
  },

  // ── RIGHT SIDEBAR ──────────────────────────────────────────────────
  "chat-claude": {
    id: "chat-claude",
    sidebar: "right",
    title: "Pergunta ao Claude",
    icon: MessageCircle,
    render: () => <ChatPanel />,
  },
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
