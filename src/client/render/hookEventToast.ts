import type { StructuredPresentationItem } from "../structuredPresentation";

export type HookEventToastActions = {
  onDismiss: (id: string) => void;
  onOpenSession: (id: string) => void;
  onOpenActions: (id: string) => void;
  onSendEnter: (id: string) => void;
  onRunAction: (id: string, actionId: string) => void;
};

export function selectStructuredEventToasts(
  items: StructuredPresentationItem[],
  newlyArrivedIds: ReadonlySet<string>,
  dismissedIds: ReadonlySet<string>
) {
  return items.filter((item) =>
    item.kind === "hook" && item.attentionRequired &&
    newlyArrivedIds.has(item.id) && !dismissedIds.has(item.id)
  );
}

export function renderHookEventToast(
  root: HTMLElement,
  events: StructuredPresentationItem[],
  handlers: HookEventToastActions
) {
  root.querySelector(".hook-event-toast")?.remove();

  const event = events.find((candidate) => candidate.attentionRequired);

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
    event.status
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

  const compactBody = event.summary;

  if (compactBody) {
    const body = document.createElement("p");
    body.className = "hook-event-toast-body";
    body.textContent = compactBody;
    toast.append(body);
  }

  const actions = document.createElement("div");
  actions.className = "hook-event-toast-actions";

  if (event.actions.length > 0) {
    [...event.actions]
      .sort((left, right) => Number(left.style === "danger") - Number(right.style === "danger"))
      .slice(0, 2)
      .forEach((hookAction) => {
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.dataset.action = "hook-toast-run-action";
      actionButton.dataset.hookActionId = hookAction.id;
      actionButton.dataset.hookActionStyle = hookAction.style;
      actionButton.classList.toggle("is-danger", hookAction.style === "danger");
      actionButton.disabled = !hookAction.enabled;
      if (hookAction.disabledReason) actionButton.title = hookAction.disabledReason;
      actionButton.textContent = hookAction.label;
      actionButton.addEventListener("click", () =>
        handlers.onRunAction(event.id, hookAction.id)
      );
      actions.append(actionButton);
    });
  }

  const actionsButton = document.createElement("button");
  actionsButton.type = "button";
  actionsButton.dataset.action = "hook-toast-actions";
  actionsButton.textContent = "View details";
  actionsButton.addEventListener("click", () => handlers.onOpenActions(event.id));

  actions.append(actionsButton);
  toast.append(actions);
  root.append(toast);
}
