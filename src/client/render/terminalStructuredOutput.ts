import {
  materializeStructuredDetails,
  type MaterializedStructuredDetailBlock
} from "../structuredPresentation";
import type {
  TerminalAgentTranscript,
  TerminalStructuredOutputItem
} from "../terminal/structuredOutput";

export type TerminalOutputView = "agent-output" | "raw-terminal";

type TranscriptNarrativeBlock = Extract<
  TerminalAgentTranscript["blocks"][number],
  { kind: "narrative" }
>;
type TranscriptActivityBlock = Extract<
  TerminalAgentTranscript["blocks"][number],
  { kind: "activity" }
>;
type TranscriptActivityGroupEntry = TranscriptNarrativeBlock | TranscriptActivityBlock;

const transcriptScopeByRoot = new WeakMap<HTMLElement, string>();
let nextTranscriptScopeId = 0;

function getTranscriptScope(root: HTMLElement) {
  const existing = transcriptScopeByRoot.get(root);

  if (existing) {
    return existing;
  }

  const scope = `terminal-agent-transcript-${nextTranscriptScopeId++}`;
  transcriptScopeByRoot.set(root, scope);
  return scope;
}

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

function renderTranscript(
  transcript: TerminalAgentTranscript,
  expandedIds: Set<string>,
  onToggleExpanded: (id: string) => void,
  scope: string
) {
  const root = document.createElement("section");
  root.className = "terminal-agent-transcript";

  let index = 0;
  while (index < transcript.blocks.length) {
    const block = transcript.blocks[index]!;

    if (block.kind === "narrative") {
      appendTranscriptNarrative(root, block);
      index += 1;
      continue;
    }

    const groupId = block.groupId ?? block.id;
    const entries: TranscriptActivityGroupEntry[] = [block];
    index += 1;

    while (index < transcript.blocks.length) {
      const next = transcript.blocks[index]!;

      if (next.kind === "narrative" && next.blankLineCount !== undefined) {
        entries.push(next);
        index += 1;
        continue;
      }

      if (next.kind === "activity" && (next.groupId ?? next.id) === groupId) {
        entries.push(next);
        index += 1;
        continue;
      }

      break;
    }

    root.append(renderTranscriptActivityGroup(entries, expandedIds, onToggleExpanded, scope));
  }

  return root;
}

function appendTranscriptNarrative(
  root: HTMLElement,
  block: TranscriptNarrativeBlock
) {
  if (block.blankLineCount !== undefined) {
    const spacer = document.createElement("div");
    spacer.className = "terminal-agent-transcript-blank";
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.setProperty(
      "--terminal-agent-transcript-blank-lines",
      String(block.blankLineCount)
    );
    root.append(spacer);
    return;
  }

  const narrative = document.createElement("p");
  narrative.className = "terminal-agent-transcript-narrative";
  appendStyledLines(narrative, block.styledLines, block.text);
  root.append(narrative);
}

function renderTranscriptActivityGroup(
  entries: TranscriptActivityGroupEntry[],
  expandedIds: Set<string>,
  onToggleExpanded: (id: string) => void,
  scope: string
) {
  const group = document.createElement("section");
  group.className = "terminal-agent-transcript-activity-group";
  const activities = entries.filter(
    (entry): entry is TranscriptActivityBlock => entry.kind === "activity"
  );
  const expandedActivity = activities.find((activity) => expandedIds.has(activity.id));

  entries.forEach((entry) => {
    if (entry.kind === "narrative") {
      appendTranscriptNarrative(group, entry);
      return;
    }

    const activity = entry;
    const expanded = expandedActivity?.id === activity.id;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.dataset.action = "toggle-terminal-transcript";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = activity.title;
    const headingStyle = activity.styledLines?.[0]?.spans.find((span) => span.text.trim())?.style;
    if (headingStyle) applyTerminalTextStyle(toggle, headingStyle);
    toggle.addEventListener("click", () => onToggleExpanded(activity.id));
    group.append(toggle);

    if (expanded && activity.text) {
      const detail = document.createElement("pre");
      detail.id = getTranscriptDetailId(scope, activity.id);
      toggle.setAttribute("aria-controls", detail.id);
      detail.className = "terminal-agent-transcript-detail";
      appendStyledLines(detail, activity.styledLines, activity.text);
      group.append(detail);
    }
  });

  return group;
}

function getTranscriptDetailId(scope: string, activityId: string) {
  return `${scope}-detail-${activityId}`;
}

function appendStyledLines(
  root: HTMLElement,
  lines: TerminalAgentTranscript["blocks"][number]["styledLines"],
  fallbackText: string
) {
  if (!lines?.length) {
    root.textContent = fallbackText;
    return;
  }

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0 && !line.wrapped) {
      root.append("\n");
    }

    line.spans.forEach(({ text, style }) => {
      const span = document.createElement("span");
      span.textContent = text;
      applyTerminalTextStyle(span, style);
      root.append(span);
    });
  });
}

function applyTerminalTextStyle(
  element: HTMLElement,
  style: NonNullable<TerminalAgentTranscript["blocks"][number]["styledLines"]>[number]["spans"][number]["style"]
) {
  if (style.color) element.style.color = style.color;
  if (style.bold) element.style.fontWeight = "700";
  if (style.italic) element.style.fontStyle = "italic";
  if (style.dim) element.style.opacity = "0.65";
}

export function renderTerminalStructuredOutput(
  root: HTMLElement,
  options: {
    items: TerminalStructuredOutputItem[];
    transcript?: TerminalAgentTranscript | null;
    view: TerminalOutputView;
    expandedIds: Set<string>;
    onViewChange: (view: TerminalOutputView) => void;
    onToggleExpanded: (id: string) => void;
  }
) {
  root.querySelector(".terminal-structured-output")?.remove();
  root.querySelector(".terminal-structured-output-restore")?.remove();

  if (options.items.length === 0 && !options.transcript) {
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

  if (options.transcript) {
    stream.append(renderTranscript(
      options.transcript,
      options.expandedIds,
      options.onToggleExpanded,
      getTranscriptScope(root)
    ));
  }

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
