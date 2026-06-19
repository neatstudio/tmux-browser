import type {
  CreateGroupMessageRequest,
  GroupMessage,
  GroupMessageKind,
  GroupMessageTarget
} from "../../shared/groupMessages";
import type { KanbanStatusProject } from "./sessionStatusBar";

export type GroupMessagePanelState = {
  project: KanbanStatusProject;
  currentSessionName: string;
  messages: GroupMessage[];
  onSubmit: (request: CreateGroupMessageRequest) => void;
  onScan: (messageId: string) => void;
  onClose: () => void;
};

function createOption(value: string, label: string) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;

  return option;
}

function parseTarget(value: string): GroupMessageTarget {
  if (value === "others") {
    return { type: "others" };
  }

  if (value.startsWith("session:")) {
    return {
      type: "session",
      sessionName: value.slice("session:".length)
    };
  }

  return {
    type: "role",
    role: value.slice("role:".length)
  };
}

function renderMessages(state: GroupMessagePanelState) {
  const list = document.createElement("div");
  list.className = "group-message-list";

  if (state.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "group-message-empty";
    empty.textContent = "No group messages yet.";
    list.append(empty);

    return list;
  }

  state.messages.forEach((message) => {
    const item = document.createElement("article");
    item.className = `group-message-item is-${message.status}`;

    const header = document.createElement("div");
    header.className = "group-message-item-header";

    const title = document.createElement("strong");
    title.textContent = `${message.kind} · ${message.status}`;

    const scan = document.createElement("button");
    scan.type = "button";
    scan.dataset.action = "scan-group-message";
    scan.textContent = "Scan";
    scan.addEventListener("click", () => {
      state.onScan(message.id);
    });

    header.append(title, scan);

    const body = document.createElement("p");
    body.textContent = message.body;

    const delivery = document.createElement("div");
    delivery.className = "group-message-delivery";
    delivery.textContent = message.deliveries
      .map((target) => `${target.sessionName}:${target.status}`)
      .join(" · ");

    item.append(header, body, delivery);

    message.replies.forEach((reply) => {
      const replyItem = document.createElement("blockquote");
      replyItem.className = "group-message-reply";
      replyItem.textContent = `${reply.fromSession} · ${reply.status}: ${reply.body}`;
      item.append(replyItem);
    });

    list.append(item);
  });

  return list;
}

export function renderGroupMessagePanel(
  root: HTMLElement,
  state: GroupMessagePanelState
) {
  root.querySelector(".group-message-panel")?.remove();

  const panel = document.createElement("section");
  panel.className = "group-message-panel";

  const header = document.createElement("header");
  header.className = "group-message-header";

  const title = document.createElement("strong");
  title.textContent = `${state.project.name} messages`;

  const close = document.createElement("button");
  close.type = "button";
  close.dataset.action = "close-group-message-panel";
  close.textContent = "Close";
  close.addEventListener("click", () => state.onClose());
  header.append(title, close);

  const form = document.createElement("form");
  form.className = "group-message-compose";

  const kind = document.createElement("select");
  kind.name = "group-message-kind";
  kind.append(createOption("task", "Task"), createOption("report", "Report"));

  const target = document.createElement("select");
  target.name = "group-message-target";
  target.append(createOption("others", "All others"));
  state.project.sessions
    .filter((session) => session.name !== state.currentSessionName)
    .forEach((session) => {
      target.append(createOption(`session:${session.name}`, session.label));
      target.append(createOption(`role:${session.label}`, `Role: ${session.label}`));
    });

  const textarea = document.createElement("textarea");
  textarea.name = "group-message-body";
  textarea.placeholder = "Task/report body";
  textarea.rows = 4;

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Send";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.onSubmit({
      fromSession: state.currentSessionName,
      kind: kind.value as GroupMessageKind,
      target: parseTarget(target.value),
      body: textarea.value.trim()
    });
  });

  form.append(kind, target, textarea, submit);
  panel.append(header, form, renderMessages(state));
  root.append(panel);
}
