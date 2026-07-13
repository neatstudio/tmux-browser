import type { ActionCenterItem } from "../actionCenter";
import {
  deriveStructuredPresentation,
  materializeStructuredDetails,
  type DerivedStructuredPresentationItem,
  type StructuredPresentationItem
} from "../structuredPresentation";
import type { UnifiedPanelTab } from "../events/appEventRefreshScheduler";

export type ActionCenterPanelOptions = {
  open: boolean;
  items: ActionCenterItem[];
  structuredItems?: StructuredPresentationItem[];
  activeTab?: UnifiedPanelTab;
  expandedIds?: ReadonlySet<string>;
  selectedEventId?: string | null;
  loading?: boolean;
  error?: string | null;
  onTabChange?: (tab: UnifiedPanelTab) => void;
  onToggleExpanded?: (eventId: string) => void;
  onClose: () => void;
  onOpenSession: (sessionName: string) => void;
  onDismissPrompt: (promptKey: string) => void;
  onSendPrompt: (promptKey: string, input: string) => void;
  onRunHookAction: (eventId: string, actionId: string) => void;
};

function formatActionCount(count: number) {
  return count === 1 ? "1 action" : `${count} actions`;
}

function setFocusKey(element: HTMLElement, key: string) {
  element.dataset.focusKey = key;
  return element;
}

const STATUS_LABELS = {
  streaming: "Streaming",
  complete: "Complete",
  failed: "Failed",
  waiting: "Waiting",
  blocked: "Blocked",
  "need-input": "Needs input",
  info: "Info"
} as const;

function formatDuration(durationMs: number) {
  return durationMs < 1_000
    ? `${durationMs} ms`
    : `${(durationMs / 1_000).toFixed(2)} s`;
}

function formatStats(item: DerivedStructuredPresentationItem) {
  return [
    item.stats.fileschanged === undefined ? null : `${item.stats.fileschanged} files`,
    item.stats.testspassed === undefined ? null : `${item.stats.testspassed} passed`,
    item.stats.testsfailed === undefined ? null : `${item.stats.testsfailed} failed`,
    item.stats.durationms === undefined ? null : formatDuration(item.stats.durationms),
    item.toolStepCount > 0 ? `${item.toolStepCount} tool steps` : null
  ].filter((value): value is string => value !== null);
}

function renderStructuredDetails(item: DerivedStructuredPresentationItem) {
  const container = document.createElement("div");
  container.className = "structured-event-details";
  materializeStructuredDetails(item, { view: "expanded" }).forEach((block) => {
    const section = document.createElement("section");
    section.className = "structured-event-detail";
    section.dataset.detailType = block.type;
    if (block.title) {
      const title = document.createElement("strong");
      title.textContent = block.title;
      section.append(title);
    }
    const body = document.createElement("pre");
    body.textContent = block.metadata
      ? JSON.stringify(block.metadata, null, 2)
      : block.text ?? "";
    section.append(body);
    container.append(section);
  });
  return container;
}

function renderStructuredEventItem(
  item: DerivedStructuredPresentationItem,
  options: ActionCenterPanelOptions
) {
  const expanded = options.expandedIds?.has(item.id) ?? false;
  const row = document.createElement("article");
  row.className = "structured-event-row";
  row.dataset.eventId = item.id;
  row.tabIndex = -1;
  row.dataset.status = item.status;
  row.dataset.severity = item.severity;
  if (options.selectedEventId === item.id) row.classList.add("is-selected");

  const heading = document.createElement("div");
  heading.className = "structured-event-heading";
  const title = document.createElement("strong");
  title.textContent = item.title;
  const status = document.createElement("span");
  status.className = "structured-event-status";
  status.textContent = STATUS_LABELS[item.status];
  heading.append(title, status);

  const summary = document.createElement("p");
  summary.className = "structured-event-summary";
  summary.textContent = item.summary;
  row.append(heading, summary);

  const stats = formatStats(item);
  if (stats.length) {
    const statsRow = document.createElement("div");
    statsRow.className = "structured-event-stats";
    stats.forEach((stat) => {
      const value = document.createElement("span");
      value.textContent = stat;
      statsRow.append(value);
    });
    row.append(statsRow);
  }

  if (item.details.length > 0 || item.children.length > 0) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    setFocusKey(toggle, `event:${item.id}:toggle`);
    toggle.className = "structured-event-toggle";
    toggle.dataset.action = "toggle-structured-event";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-controls", `structured-event-details-${item.id}`);
    toggle.setAttribute(
      "aria-label",
      `${expanded ? "Hide" : "Show"} details for ${item.title}`
    );
    toggle.textContent = expanded ? "Hide details" : "Show details";
    toggle.addEventListener("click", () => options.onToggleExpanded?.(item.id));
    row.append(toggle);
  }

  if (expanded) {
    const details = renderStructuredDetails(item);
    details.id = `structured-event-details-${item.id}`;
    item.children.forEach((child) => {
      const childRow = document.createElement("div");
      childRow.className = "structured-event-child";
      childRow.textContent = `${child.toolName ?? "Tool"}: ${child.summary}`;
      details.prepend(childRow);
    });
    row.append(details);
  }

  const canOpenHook = item.kind === "hook" && item.attentionRequired && item.sessionName && item.summary !== "事件数据损坏";
  if (item.actions.length > 0 || canOpenHook) {
    const actions = document.createElement("div");
    actions.className = "action-center-actions";
    item.actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      setFocusKey(button, `event:${item.id}:action:${action.id}`);
      button.dataset.action = "run-hook-action";
      button.dataset.hookActionStyle = action.style;
      button.classList.toggle("is-danger", action.style === "danger");
      button.disabled = !action.enabled;
      button.textContent = action.label;
      if (action.disabledReason) button.title = action.disabledReason;
      button.addEventListener("click", () => options.onRunHookAction(`hook:${item.id}`, action.id));
      actions.append(button);
    });
    if (canOpenHook) {
      const open = document.createElement("button");
      open.type = "button";
      setFocusKey(open, `event:${item.id}:open`);
      open.dataset.action = "open-action-session";
      open.textContent = "Open";
      open.addEventListener("click", () => options.onOpenSession(item.sessionName!));
      actions.append(open);
    }
    row.append(actions);
  }

  return row;
}

function renderUnifiedPanelContent(
  panel: HTMLElement,
  options: ActionCenterPanelOptions,
  presentations: DerivedStructuredPresentationItem[]
) {
  const activeTab = options.activeTab ?? "activity";
  const attention = presentations.filter((item) => item.attentionRequired);
  const tabs = document.createElement("div");
  tabs.className = "action-center-tabs";
  tabs.setAttribute("role", "tablist");
  const tabNames = ["activity", "attention"] as const;
  tabNames.forEach((tabName, tabIndex) => {
    const button = document.createElement("button");
    button.type = "button";
    setFocusKey(button, `tab:${tabName}`);
    button.id = `action-center-tab-${tabName}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(activeTab === tabName));
    button.setAttribute("aria-controls", "action-center-tabpanel");
    button.tabIndex = activeTab === tabName ? 0 : -1;
    const count = tabName === "activity" ? presentations.length : attention.length + options.items.filter((item) => item.type !== "hook-event").length;
    button.textContent = `${tabName === "activity" ? "Activity" : "Attention"} ${count}`;
    button.addEventListener("click", () => options.onTabChange?.(tabName));
    button.addEventListener("keydown", (event) => {
      let nextIndex: number | null = null;
      if (event.key === "ArrowRight") nextIndex = (tabIndex + 1) % tabNames.length;
      if (event.key === "ArrowLeft") nextIndex = (tabIndex - 1 + tabNames.length) % tabNames.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabNames.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      const nextTab = tabs.querySelectorAll<HTMLButtonElement>("[role='tab']")[nextIndex];
      nextTab?.focus();
      options.onTabChange?.(tabNames[nextIndex]!);
    });
    tabs.append(button);
  });
  panel.append(tabs);

  const content = document.createElement("div");
  content.id = "action-center-tabpanel";
  content.className = "action-center-list";
  content.setAttribute("role", "tabpanel");
  content.setAttribute("aria-labelledby", `action-center-tab-${activeTab}`);
  const visibleStructured = activeTab === "activity" ? presentations : attention;
  const visibleActions = activeTab === "attention"
    ? options.items.filter((item) => item.type !== "hook-event")
    : [];

  if (options.loading && visibleStructured.length === 0) {
    const state = document.createElement("p");
    state.className = "action-center-empty";
    state.textContent = "Loading activity…";
    content.append(state);
  } else if (options.error && visibleStructured.length === 0) {
    const state = document.createElement("p");
    state.className = "action-center-empty is-reconnecting";
    state.textContent = `Reconnecting… ${options.error}`;
    content.append(state);
  } else if (visibleStructured.length === 0 && visibleActions.length === 0) {
    const state = document.createElement("p");
    state.className = "action-center-empty";
    state.textContent = activeTab === "activity" ? "No activity yet" : "Nothing needs attention";
    content.append(state);
  } else {
    const initialItems = visibleStructured.slice(0, 100);
    initialItems.forEach((item) => content.append(renderStructuredEventItem(item, options)));
    if (visibleStructured.length > initialItems.length) {
      const remaining = visibleStructured.slice(initialItems.length);
      const appendChunk = () => {
        if (!content.isConnected) return;
        remaining.splice(0, 100).forEach((item) => {
          content.append(renderStructuredEventItem(item, options));
        });
        if (remaining.length > 0) window.setTimeout(appendChunk, 16);
      };
      window.setTimeout(appendChunk, 250);
    }
    visibleActions.forEach((item) => content.append(renderActionCenterItem(item, options)));
  }
  panel.append(content);
  const selected = options.selectedEventId
    ? [...content.querySelectorAll<HTMLElement>("[data-event-id]")].find(
        (node) => node.dataset.eventId === options.selectedEventId
      ) ?? null
    : null;
  selected?.scrollIntoView?.({ block: "nearest" });
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
    setFocusKey(button, `prompt:${item.promptKey}:action:${promptAction.key}`);
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
  setFocusKey(openButton, `prompt:${item.promptKey}:open`);
  openButton.dataset.action = "open-action-session";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => options.onOpenSession(item.sessionName));

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  setFocusKey(dismissButton, `prompt:${item.promptKey}:dismiss`);
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
  setFocusKey(openButton, `dead-pane:${item.id}:open`);
  openButton.dataset.action = "open-action-session";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () => options.onOpenSession(item.sessionName));
  actions.append(openButton);

  card.append(header, actions);

  return card;
}

function renderHookEventContentBlock(
  block: NonNullable<Extract<ActionCenterItem, { type: "hook-event" }>["content"]>[number]
) {
  if (block.type === "summary") {
    const summary = document.createElement("p");
    summary.className = "hook-event-content-summary";
    summary.textContent = block.text;
    return summary;
  }

  if (block.type === "text") {
    const text = document.createElement("p");
    text.className = "hook-event-content-text";
    text.textContent = block.text;
    return text;
  }

  const details = document.createElement("details");
  details.className = "hook-event-content-details";
  details.dataset.contentType = block.type;
  details.open = block.collapsed === false;

  const summary = document.createElement("summary");
  summary.textContent =
    block.type === "code"
      ? [
          block.title ?? "Code",
          block.language ? `.${block.language}` : null
        ]
          .filter(Boolean)
          .join(" ")
      : block.title;

  const body = document.createElement("pre");
  body.className =
    block.type === "code"
      ? "hook-event-content-code"
      : "hook-event-content-details-body";
  body.textContent = block.text;

  details.append(summary, body);
  return details;
}

function renderHookEventContent(
  item: Extract<ActionCenterItem, { type: "hook-event" }>
) {
  if (item.content && item.content.length > 0) {
    const content = document.createElement("div");
    content.className = "hook-event-content";
    item.content.forEach((block) => {
      content.append(renderHookEventContentBlock(block));
    });
    return content;
  }

  if (!item.body) {
    return null;
  }

  const body = document.createElement("pre");
  body.className = "action-center-snippet";
  body.textContent = item.body;
  return body;
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
  meta.textContent = [
    item.target.sessionName ?? item.sessionName,
    item.target.projectName,
    item.eventType,
    item.taskId
  ]
    .filter(Boolean)
    .join(" · ");

  const content = renderHookEventContent(item);

  const actions = document.createElement("div");
  actions.className = "action-center-actions";

  item.actions.forEach((hookAction) => {
    const button = document.createElement("button");
    button.type = "button";
    setFocusKey(button, `event:${item.id.replace(/^hook:/, "")}:action:${hookAction.id}`);
    button.dataset.action = "run-hook-action";
    button.dataset.hookActionId = hookAction.id;
    button.dataset.hookActionStyle = hookAction.style;
    button.textContent = hookAction.label;
    button.addEventListener("click", () => {
      options.onRunHookAction(item.id, hookAction.id);
    });
    actions.append(button);
  });

  const openButton = document.createElement("button");
  openButton.type = "button";
  setFocusKey(openButton, `event:${item.id.replace(/^hook:/, "")}:open`);
  openButton.dataset.action = "open-action-session";
  openButton.textContent = "Open";
  openButton.addEventListener("click", () =>
    options.onOpenSession(item.target.sessionName ?? item.sessionName)
  );
  actions.append(openButton);

  card.append(header, meta);

  if (content) {
    card.append(content);
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
  const existingBackdrop = root.querySelector<HTMLElement>(".action-center-backdrop");
  const activeElement = document.activeElement;
  const focusKey =
    existingBackdrop && activeElement instanceof HTMLElement && existingBackdrop.contains(activeElement)
      ? activeElement.dataset.focusKey ?? null
      : null;
  const hadBackdrop = existingBackdrop !== null;
  existingBackdrop?.remove();

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
  const structuredPresentations = options.structuredItems
    ? deriveStructuredPresentation(options.structuredItems)
    : null;
  count.textContent = structuredPresentations
    ? `${structuredPresentations.length} events · ${options.items.filter((item) => item.type !== "hook-event").length} actions`
    : formatActionCount(options.items.length);

  titleGroup.append(title, count);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  setFocusKey(closeButton, "panel:close");
  closeButton.dataset.action = "close-action-center";
  closeButton.setAttribute("aria-label", "Close action center");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", options.onClose);

  header.append(titleGroup, closeButton);
  panel.append(header);

  if (structuredPresentations) {
    renderUnifiedPanelContent(panel, options, structuredPresentations);
  } else if (options.items.length === 0) {
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
  const focusTarget = focusKey
    ? [...backdrop.querySelectorAll<HTMLElement>("[data-focus-key]")].find(
        (element) => element.dataset.focusKey === focusKey
      ) ?? null
    : null;
  if (focusTarget) {
    focusTarget.focus({ preventScroll: true });
  } else if (!hadBackdrop && options.selectedEventId) {
    [...backdrop.querySelectorAll<HTMLElement>("[data-event-id]")]
      .find((element) => element.dataset.eventId === options.selectedEventId)
      ?.focus({ preventScroll: true });
  }
}
