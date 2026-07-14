import {
  adaptStructuredRecord,
  type StructuredPresentationItem
} from "../structuredPresentation";
import type { TimelineEvent } from "../../shared/timeline";

type ConversationEvent = Extract<TimelineEvent, { type: "conversation-message" }>;

export type TerminalStructuredOutputItem = StructuredPresentationItem;

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

  return [...latestById.values()]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((event) => adaptStructuredRecord(event))
    .filter((item): item is TerminalStructuredOutputItem => item !== null);
}
