import type { ActionCenterHookEventItem } from "../actionCenter";

export type HookEventToastActions = {
  onDismiss: (id: string) => void;
  onOpenSession: (id: string) => void;
  onOpenActions: (id: string) => void;
  onSendEnter: (id: string) => void;
  onRunAction: (id: string, actionId: string) => void;
};

function getCompactEventBody(event: ActionCenterHookEventItem) {
  const content = event.content ?? [];
  const summary = content.find((block) => block.type === "summary");

  if (summary) {
    return summary.text;
  }

  const text = content.find((block) => block.type === "text");

  if (text) {
    return text.text;
  }

  if (content.length > 0) {
    return null;
  }

  return event.body;
}

export function renderHookEventToast(
  root: HTMLElement,
  events: ActionCenterHookEventItem[],
  handlers: HookEventToastActions
) {
  root.querySelector(".hook-event-toast")?.remove();

  const event = events[0];

  if (!event) {
    return;
  }

  const toast = document.createElement("section");
  toast.className = "hook-event-toast";
  toast.setAttribute("role", "dialog");
  toast.setAttribute("aria-live", "assertive");
  toast.setAttribute("aria-label", "Agent action needed");

  const header = document.createElement("div");
  header.className = "hook-event-toast-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "hook-event-toast-title";

  const title = document.createElement("strong");
  title.textContent = event.title;

  const meta = document.createElement("span");
  meta.textContent = [
    event.sessionName || "unknown",
    event.status,
    event.source
  ]
    .filter(Boolean)
    .join(" · ");

  titleWrap.append(title, meta);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "hook-event-toast-close";
  closeButton.dataset.action = "hook-toast-close";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Dismiss hook event");
  closeButton.addEventListener("click", () => handlers.onDismiss(event.id));

  header.append(titleWrap, closeButton);
  toast.append(header);

  const compactBody = getCompactEventBody(event);

  if (compactBody) {
    const body = document.createElement("p");
    body.className = "hook-event-toast-body";
    body.textContent = compactBody;
    toast.append(body);
  }

  const actions = document.createElement("div");
  actions.className = "hook-event-toast-actions";

  if (event.actions.length > 0) {
    event.actions.slice(0, 3).forEach((hookAction) => {
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.dataset.action = "hook-toast-run-action";
      actionButton.dataset.hookActionId = hookAction.id;
      actionButton.dataset.hookActionStyle = hookAction.style;
      actionButton.textContent = hookAction.label;
      actionButton.addEventListener("click", () =>
        handlers.onRunAction(event.id, hookAction.id)
      );
      actions.append(actionButton);
    });
  } else {
    const enterButton = document.createElement("button");
    enterButton.type = "button";
    enterButton.dataset.action = "hook-toast-enter";
    enterButton.textContent = "Enter";
    enterButton.addEventListener("click", () => handlers.onSendEnter(event.id));
    actions.append(enterButton);
  }

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.dataset.action = "hook-toast-open";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => handlers.onOpenSession(event.id));

  const actionsButton = document.createElement("button");
  actionsButton.type = "button";
  actionsButton.dataset.action = "hook-toast-actions";
  actionsButton.textContent = "Actions";
  actionsButton.addEventListener("click", () => handlers.onOpenActions(event.id));

  actions.append(openButton, actionsButton);
  toast.append(actions);
  root.append(toast);
}
