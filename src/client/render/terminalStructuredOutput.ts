import {
  materializeStructuredDetails,
  type MaterializedStructuredDetailBlock
} from "../structuredPresentation";
import type { TerminalStructuredOutputItem } from "../terminal/structuredOutput";

export type TerminalOutputView = "agent-output" | "raw-terminal";

function formatStats(item: TerminalStructuredOutputItem) {
  const stats: string[] = [];

  if (item.stats.fileschanged !== undefined) {
    stats.push(`${item.stats.fileschanged} files`);
  }
  if (item.stats.testspassed !== undefined) {
    stats.push(`${item.stats.testspassed} passed`);
  }
  if (item.stats.testsfailed !== undefined) {
    stats.push(`${item.stats.testsfailed} failed`);
  }
  if (item.stats.durationms !== undefined) {
    stats.push(`${item.stats.durationms < 1000
      ? `${item.stats.durationms} ms`
      : `${(item.stats.durationms / 1000).toFixed(2)} s`}`);
  }

  return stats;
}

function appendDetails(root: HTMLElement, details: MaterializedStructuredDetailBlock[]) {
  details.forEach((detail) => {
    const block = document.createElement("section");
    block.className = "terminal-structured-output-detail";
    const title = document.createElement("strong");
    title.textContent = detail.title ?? detail.type;
    const content = document.createElement("pre");
    content.textContent = detail.text ?? JSON.stringify(detail.metadata, null, 2);
    block.append(title, content);
    root.append(block);
  });
}

function renderItem(
  item: TerminalStructuredOutputItem,
  expanded: boolean,
  onToggleExpanded: (id: string) => void
) {
  const row = document.createElement("article");
  row.className = `terminal-structured-output-item is-${item.status}`;
  row.dataset.outputId = item.id;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.dataset.action = "toggle-terminal-output";
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.textContent = expanded ? "Hide details" : "Show details";
  toggle.addEventListener("click", () => onToggleExpanded(item.id));

  const heading = document.createElement("strong");
  heading.textContent = item.toolName ?? item.title;
  const summary = document.createElement("p");
  summary.className = "terminal-structured-output-summary";
  summary.textContent = item.summary;
  const status = document.createElement("span");
  status.className = "terminal-structured-output-status";
  status.textContent = item.status;

  const stats = formatStats(item);
  const metadata = document.createElement("span");
  metadata.className = "terminal-structured-output-stats";
  metadata.textContent = stats.join(" · ");

  row.append(heading, status, summary);
  if (stats.length > 0) {
    row.append(metadata);
  }
  row.append(toggle);

  if (expanded) {
    appendDetails(row, materializeStructuredDetails(item, { view: "expanded" }));
  }

  return row;
}

export function renderTerminalStructuredOutput(
  root: HTMLElement,
  options: {
    items: TerminalStructuredOutputItem[];
    view: TerminalOutputView;
    expandedIds: Set<string>;
    onViewChange: (view: TerminalOutputView) => void;
    onToggleExpanded: (id: string) => void;
  }
) {
  root.querySelector(".terminal-structured-output")?.remove();
  root.querySelector(".terminal-structured-output-restore")?.remove();

  if (options.items.length === 0) {
    root.classList.remove("has-agent-output");
    return;
  }

  root.classList.add("has-agent-output");
  const stream = document.createElement("section");
  stream.className = "terminal-structured-output";
  stream.hidden = options.view === "raw-terminal";
  stream.setAttribute("aria-label", "Agent output");

  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = "Agent output";
  const rawTerminalButton = document.createElement("button");
  rawTerminalButton.type = "button";
  rawTerminalButton.dataset.action = "show-raw-terminal";
  rawTerminalButton.textContent = "Raw terminal";
  rawTerminalButton.addEventListener("click", () => {
    options.onViewChange("raw-terminal");
  });
  header.append(title, rawTerminalButton);
  stream.append(header);

  options.items.forEach((item) => {
    stream.append(renderItem(item, options.expandedIds.has(item.id), options.onToggleExpanded));
  });

  root.prepend(stream);

  if (options.view === "raw-terminal") {
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "terminal-structured-output-restore";
    restore.dataset.action = "show-agent-output";
    restore.textContent = "Agent output";
    restore.addEventListener("click", () => {
      options.onViewChange("agent-output");
    });
    root.prepend(restore);
  }
}
