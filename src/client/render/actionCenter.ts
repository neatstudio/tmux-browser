import type { ActionCenterItem } from "../actionCenter";

export type ActionCenterPanelOptions = {
  open: boolean;
  items: ActionCenterItem[];
  onClose: () => void;
  onOpenSession: (sessionName: string) => void;
  onDismissPrompt: (promptKey: string) => void;
  onSendPrompt: (promptKey: string, input: string) => void;
};

function formatActionCount(count: number) {
  return count === 1 ? "1 action" : `${count} actions`;
}

function formatPromptActionLabel(label: string) {
  const normalizedLabel = label.trim().toLowerCase();

  if (normalizedLabel === "y" || normalizedLabel === "yes") {
    return "Yes (y)";
  }

  if (normalizedLabel === "a" || normalizedLabel === "always") {
    return "Always (a)";
  }

  if (normalizedLabel === "n" || normalizedLabel === "no") {
    return "No (n)";
  }

  if (normalizedLabel === "p") {
    return "Details (p)";
  }

  if (normalizedLabel === "esc" || normalizedLabel === "escape") {
    return "Esc";
  }

  if (normalizedLabel === "enter" || normalizedLabel === "return") {
    return "Enter";
  }

  return label;
}

function renderInputPromptItem(
  item: Extract<ActionCenterItem, { type: "input-prompt" }>,
  options: ActionCenterPanelOptions
) {
  const card = document.createElement("article");
  card.className = "action-center-item is-input-prompt";
  card.dataset.actionId = item.id;

  const header = document.createElement("div");
  header.className = "action-center-item-header";

  const title = document.createElement("strong");
  title.textContent = item.title;

  const session = document.createElement("span");
  session.textContent = item.sessionName;

  header.append(title, session);

  const snippet = document.createElement("pre");
  snippet.className = "action-center-snippet";
  snippet.textContent = item.snippet;

  const actions = document.createElement("div");
  actions.className = "action-center-actions";

  item.actions.forEach((promptAction) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "send-prompt-action";
    button.textContent = formatPromptActionLabel(promptAction.label);
    button.title = promptAction.label;
    button.addEventListener("click", () => {
      options.onSendPrompt(item.promptKey, promptAction.input);
    });
    actions.append(button);
  });

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.dataset.action = "open-action-session";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => options.onOpenSession(item.sessionName));

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.dataset.action = "dismiss-prompt";
  dismissButton.textContent = "Dismiss";
  dismissButton.addEventListener("click", () => options.onDismissPrompt(item.promptKey));

  actions.append(openButton, dismissButton);
  card.append(header, snippet, actions);

  return card;
}

function renderDeadPaneItem(
  item: Extract<ActionCenterItem, { type: "dead-pane" }>,
  options: ActionCenterPanelOptions
) {
  const card = document.createElement("article");
  card.className = "action-center-item is-dead-pane";
  card.dataset.actionId = item.id;

  const header = document.createElement("div");
  header.className = "action-center-item-header";

  const title = document.createElement("strong");
  title.textContent = item.title;

  const status = document.createElement("span");
  status.textContent =
    item.status === null ? "exit unknown" : `exit ${String(item.status)}`;

  header.append(title, status);

  const actions = document.createElement("div");
  actions.className = "action-center-actions";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.dataset.action = "open-action-session";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => options.onOpenSession(item.sessionName));
  actions.append(openButton);

  card.append(header, actions);

  return card;
}

function renderHookEventItem(
  item: Extract<ActionCenterItem, { type: "hook-event" }>,
  options: ActionCenterPanelOptions
) {
  const card = document.createElement("article");
  card.className = "action-center-item is-hook-event";
  card.dataset.actionId = item.id;

  const header = document.createElement("div");
  header.className = "action-center-item-header";

  const title = document.createElement("strong");
  title.textContent = item.title;

  const status = document.createElement("span");
  status.textContent = `${item.source} · ${item.status}`;

  header.append(title, status);

  const meta = document.createElement("div");
  meta.className = "action-center-meta";
  meta.textContent = [item.sessionName, item.eventType, item.taskId]
    .filter(Boolean)
    .join(" · ");

  const body = document.createElement("pre");
  body.className = "action-center-snippet";
  body.textContent = item.body ?? "";

  const actions = document.createElement("div");
  actions.className = "action-center-actions";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.dataset.action = "open-action-session";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => options.onOpenSession(item.sessionName));
  actions.append(openButton);

  card.append(header, meta);

  if (item.body) {
    card.append(body);
  }

  card.append(actions);

  return card;
}

function renderActionCenterItem(
  item: ActionCenterItem,
  options: ActionCenterPanelOptions
) {
  switch (item.type) {
    case "input-prompt":
      return renderInputPromptItem(item, options);
    case "dead-pane":
      return renderDeadPaneItem(item, options);
    case "hook-event":
      return renderHookEventItem(item, options);
  }
}

export function renderActionCenterPanel(
  root: HTMLElement,
  options: ActionCenterPanelOptions
) {
  root.querySelector(".action-center-backdrop")?.remove();

  if (!options.open) {
    return;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "action-center-backdrop";
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      options.onClose();
    }
  });

  const panel = document.createElement("section");
  panel.className = "action-center-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "action-center-title");

  const header = document.createElement("div");
  header.className = "action-center-header";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h2");
  title.id = "action-center-title";
  title.textContent = "Action Center";

  const count = document.createElement("span");
  count.textContent = formatActionCount(options.items.length);

  titleGroup.append(title, count);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.dataset.action = "close-action-center";
  closeButton.setAttribute("aria-label", "Close action center");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", options.onClose);

  header.append(titleGroup, closeButton);
  panel.append(header);

  if (options.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "action-center-empty";
    empty.textContent = "No pending actions";
    panel.append(empty);
  } else {
    const list = document.createElement("div");
    list.className = "action-center-list";

    options.items.forEach((item) => {
      list.append(renderActionCenterItem(item, options));
    });

    panel.append(list);
  }

  backdrop.append(panel);
  root.append(backdrop);
}
