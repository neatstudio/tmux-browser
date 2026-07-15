import {
  adaptStructuredRecord,
  type StructuredPresentationItem
} from "../structuredPresentation";
import type { TimelineEvent } from "../../shared/timeline";

type ConversationEvent = Extract<TimelineEvent, { type: "conversation-message" }>;

export type TerminalStructuredOutputItem = StructuredPresentationItem;

export type TerminalStyledSpan = {
  text: string;
  style: {
    color?: string;
    bold?: true;
    italic?: true;
    dim?: true;
  };
};

export type TerminalStyledLine = {
  absoluteLine: number;
  wrapped?: boolean;
  spans: TerminalStyledSpan[];
};

export type TerminalAgentTranscriptBlock =
  | {
      id: string;
      kind: "narrative";
      text: string;
      blankLineCount?: number;
      styledLines?: TerminalStyledLine[];
    }
  | {
      id: string;
      kind: "activity";
      groupId?: string;
      title: string;
      text: string;
      styledLines?: TerminalStyledLine[];
    };

export type TerminalAgentTranscript = {
  blocks: TerminalAgentTranscriptBlock[];
};

const PROCESS_RECORDS = [
  "Viewed Image",
  "Waiting for agents",
  "Finished waiting",
  "Interacted with",
  "Explored",
  "Edited",
  "Analyzing",
  "Planning",
  "Ran"
] as const;

function isTmuxStatusLine(line: string) {
  const normalized = line.trim();

  return (
    normalized.startsWith("[") &&
    normalized.includes("\"") &&
    /\d{1,2}:\d{2}\s+\d{2}-[A-Za-z]{3}-\d{2}$/.test(normalized)
  );
}

function normalizeTranscriptGroup(lines: string[]) {
  return lines
    .filter((line) => !isTmuxStatusLine(line));
}

function getProcessRecordTitle(line: string) {
  const match = line.match(/^[•·]\s+(.+)$/);

  if (!match) {
    return null;
  }

  const heading = match[1];

  return PROCESS_RECORDS.find(
    (title) => heading === title || heading.startsWith(`${title} `)
  ) ?? null;
}

export function hasTerminalAgentTranscriptCandidates(visibleText: string) {
  let candidateCount = 0;

  for (const line of visibleText.replace(/\r\n?/g, "\n").split("\n")) {
    if (!isTmuxStatusLine(line) && getProcessRecordTitle(line)) {
      candidateCount += 1;

      if (candidateCount >= 2) {
        return true;
      }
    }
  }

  return false;
}

function isTranscriptContinuation(line: string) {
  const trimmed = line.trim();

  return /^\s+/.test(line) || trimmed.startsWith("└") || trimmed.startsWith("│");
}

function getStableTranscriptId(
  title: string,
  heading: string,
  firstDetailLine: string,
  absoluteLine: number
) {
  let hash = 2166136261;

  for (const character of `${absoluteLine}\n${heading}\n${firstDetailLine}`) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  }

  return `activity:${title.toLowerCase().replaceAll(" ", "-")}:${(hash >>> 0).toString(36)}`;
}

export function deriveTerminalAgentTranscript(
  visibleText: string,
  visibleStartLine = 0,
  styledLines: TerminalStyledLine[] = []
): TerminalAgentTranscript | null {
  const blocks: TerminalAgentTranscriptBlock[] = [];
  const narrativeLines: string[] = [];
  const narrativeLineNumbers: number[] = [];
  const styledLinesByNumber = new Map(
    styledLines.map((line) => [line.absoluteLine, line])
  );
  const logicalLines: Array<{
    text: string;
    absoluteLine: number;
    lineNumbers: number[];
  }> = [];

  visibleText.replace(/\r\n?/g, "\n").split("\n").forEach((text, lineIndex) => {
    const absoluteLine = visibleStartLine + lineIndex;
    const styledLine = styledLinesByNumber.get(absoluteLine);
    const previous = logicalLines.at(-1);

    if (styledLine?.wrapped && previous) {
      previous.text += text;
      previous.lineNumbers.push(absoluteLine);
      return;
    }

    logicalLines.push({ text, absoluteLine, lineNumbers: [absoluteLine] });
  });
  let activity: {
    groupId: string;
    title: string;
    heading: string;
    absoluteLine: number;
    lines: string[];
    lineNumbers: number[];
  } | null = null;
  let nextActivityGroupIndex = 0;
  let currentActivityGroupId: string | null = null;
  let hasNarrativeSinceActivity = false;

  const flushNarrative = () => {
    const normalizedLines = normalizeTranscriptGroup(narrativeLines);
    const text = normalizedLines.join("\n");
    const blankLineCount = normalizedLines.every((line) => !line.trim())
      ? normalizedLines.length
      : null;
    narrativeLines.length = 0;
    const blockStyledLines = narrativeLineNumbers
      .map((lineNumber) => styledLinesByNumber.get(lineNumber))
      .filter((line): line is TerminalStyledLine => line !== undefined);
    narrativeLineNumbers.length = 0;

    if (normalizedLines.length > 0) {
      blocks.push({
        id: `narrative:${blocks.length}`,
        kind: "narrative",
        text: blankLineCount === null ? text : "",
        ...(blankLineCount === null ? {} : { blankLineCount }),
        ...(blockStyledLines.length > 0 ? { styledLines: blockStyledLines } : {})
      });
    }
  };
  const flushActivity = () => {
    if (!activity) {
      return;
    }

    const baseId = getStableTranscriptId(
      activity.title,
      activity.heading,
      activity.lines[1] ?? "",
      activity.absoluteLine
    );
    blocks.push({
      id: baseId,
      kind: "activity",
      groupId: activity.groupId,
      title: activity.title,
      text: activity.lines.join("\n"),
      ...(() => {
        const blockStyledLines = activity.lineNumbers
          .map((lineNumber) => styledLinesByNumber.get(lineNumber))
          .filter((line): line is TerminalStyledLine => line !== undefined);
        return blockStyledLines.length > 0 ? { styledLines: blockStyledLines } : {};
      })()
    });
    activity = null;
  };

  logicalLines.forEach(({ text: line, absoluteLine, lineNumbers }) => {
      if (isTmuxStatusLine(line)) {
        return;
      }

      const title = getProcessRecordTitle(line);

      if (title) {
        flushActivity();
        flushNarrative();
        if (!currentActivityGroupId || hasNarrativeSinceActivity) {
          currentActivityGroupId = `activity-group:${nextActivityGroupIndex++}`;
        }
        hasNarrativeSinceActivity = false;
        const heading = line.replace(/^[•·]\s+/, "");
        activity = {
          groupId: currentActivityGroupId,
          title,
          heading,
          absoluteLine,
          lines: [heading],
          lineNumbers: [...lineNumbers]
        };
        return;
      }

      if (activity && line.trim() && isTranscriptContinuation(line)) {
        activity.lines.push(line.trim());
        activity.lineNumbers.push(...lineNumbers);
        return;
      }

      if (activity && line.trim()) {
        flushActivity();
      }

      narrativeLines.push(line);
      narrativeLineNumbers.push(...lineNumbers);
      if (line.trim()) {
        hasNarrativeSinceActivity = true;
      }
    });

  flushActivity();
  flushNarrative();

  return blocks.filter((block) => block.kind === "activity").length >= 2
    ? { blocks }
    : null;
}

function isVisibleConversation(
  event: TimelineEvent,
  sessionName: string
): event is ConversationEvent {
  return (
    event.type === "conversation-message" &&
    event.sessionName === sessionName &&
    (event.role === "assistant" || event.role === "tool")
  );
}

export function deriveTerminalStructuredOutput(
  sessionName: string,
  timelineEvents: TimelineEvent[]
): TerminalStructuredOutputItem[] {
  const latestById = new Map<string, ConversationEvent>();

  timelineEvents.forEach((event) => {
    if (!isVisibleConversation(event, sessionName)) {
      return;
    }

    const existing = latestById.get(event.id);

    if (!existing || event.revision > existing.revision) {
      latestById.set(event.id, event);
    }
  });

  const items = [...latestById.values()]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((event) => adaptStructuredRecord(event))
    .filter((item): item is TerminalStructuredOutputItem => item !== null);

  return items;
}

export function deriveTerminalOutputPresentation(
  sessionName: string,
  timelineEvents: TimelineEvent[],
  visibleText = "",
  visibleStartLine = 0,
  styledLines: TerminalStyledLine[] = []
) {
  const items = deriveTerminalStructuredOutput(sessionName, timelineEvents);

  return {
    items,
    transcript: items.length > 0
      ? null
      : deriveTerminalAgentTranscript(visibleText, visibleStartLine, styledLines)
  };
}

export function shouldRenderTerminalOutputPresentation(
  output: ReturnType<typeof deriveTerminalOutputPresentation>,
  hasExistingOutput: boolean
) {
  return hasExistingOutput || output.items.length > 0 || output.transcript !== null;
}
