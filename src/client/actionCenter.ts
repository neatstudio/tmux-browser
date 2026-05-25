import type { SessionSummary } from "./api/sessionApi";
import type { InputPromptNotice } from "./state/inputPromptRegistry";
import type { TerminalInputPromptAction } from "../shared/inputPromptDetector";

export type ActionCenterInputPromptItem = {
  type: "input-prompt";
  id: string;
  sessionName: string;
  promptKey: string;
  title: string;
  snippet: string;
  actions: TerminalInputPromptAction[];
};

export type ActionCenterDeadPaneItem = {
  type: "dead-pane";
  id: string;
  sessionName: string;
  paneId?: string;
  title: string;
  status: number | null;
};

export type ActionCenterItem =
  | ActionCenterInputPromptItem
  | ActionCenterDeadPaneItem;

export function deriveActionCenterItems(input: {
  prompts: InputPromptNotice[];
  sessions: SessionSummary[];
}): ActionCenterItem[] {
  const promptItems: ActionCenterItem[] = input.prompts.map((notice) => ({
    type: "input-prompt",
    id: `prompt:${notice.key}`,
    sessionName: notice.sessionName,
    promptKey: notice.key,
    title: `${notice.sessionName} waiting`,
    snippet: notice.prompt.snippet,
    actions: notice.prompt.actions
  }));

  const deadPaneItems = input.sessions.flatMap<ActionCenterItem>((session) => {
    const paneItems =
      session.panes
        ?.filter((pane) => pane.paneDead)
        .map<ActionCenterItem>((pane) => ({
          type: "dead-pane",
          id: `dead-pane:${session.name}:${pane.paneId}`,
          sessionName: session.name,
          paneId: pane.paneId,
          title: `${session.name} pane ${pane.paneId} exited`,
          status: pane.paneDeadStatus
        })) ?? [];

    if (paneItems.length > 0) {
      return paneItems;
    }

    if (!session.paneDead) {
      return [];
    }

    return [
      {
        type: "dead-pane",
        id: `dead-pane:${session.name}`,
        sessionName: session.name,
        title: `${session.name} pane exited`,
        status: session.paneDeadStatus
      }
    ];
  });

  return [...promptItems, ...deadPaneItems];
}
