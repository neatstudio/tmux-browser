import type { KanbanProject, SessionSummary } from "../api/sessionApi";
import type { TimelineEvent } from "../../shared/timeline";
import type { DashboardState } from "../state/dashboardStore";

type BrowserSessionTabState = {
  sessionName: string;
  active: boolean;
};

type SessionSidebarActions = {
  activeSessionName: string | null;
  collapsed?: boolean;
  draftSessionName: string;
  browserTabs?: BrowserSessionTabState[];
  pinnedSessionNames?: Set<string>;
  mutedSessionNames?: Set<string>;
  timelineEvents?: TimelineEvent[];
  actionCount?: number;
  actionCenterOpen?: boolean;
  activeView?: "dashboard" | "kanban";
  hiddenSessionNames?: Set<string>;
  kanbanProjects?: KanbanProject[];
  onCreateSession: (name: string) => void;
  onDraftChange: (value: string) => void;
  onOpenDashboard: () => void;
  onOpenKanban?: () => void;
  onOpenKanbanProject?: (name: string) => void;
  onOpenSession: (name: string) => void;
  onTogglePinned: (name: string) => void;
  onToggleMuted?: (name: string) => void;
  onToggleActionCenter?: () => void;
  onRefresh: () => void;
  onRefreshMuted?: () => void;
  onToggleCollapsed?: () => void;
};

const SIDEBAR_SELECTORS = [
  ".session-sidebar-root",
  ".session-sidebar",
  ".mobile-sidebar-launcher"
].join(",");

export function renderSessionSidebar(
  root: HTMLElement,
  state: DashboardState,
  actions: SessionSidebarActions
) {
  void state;
  void actions;

  root.querySelectorAll(SIDEBAR_SELECTORS).forEach((node) => node.remove());
  root.classList.remove("is-mobile-sidebar-open", "is-sidebar-collapsed");
  root.innerHTML = "";
}
