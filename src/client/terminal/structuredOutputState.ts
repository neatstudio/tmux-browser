import type { TerminalOutputView } from "../render/terminalStructuredOutput";

type TabState = {
  view: TerminalOutputView | null;
  expandedIds: Set<string>;
};

export function createTerminalStructuredOutputState() {
  const states = new Map<string, TabState>();

  function getOrCreate(tabId: string) {
    const existing = states.get(tabId);

    if (existing) {
      return existing;
    }

    const next = { view: null, expandedIds: new Set<string>() };
    states.set(tabId, next);
    return next;
  }

  return {
    getView(tabId: string, hasItems: boolean): TerminalOutputView {
      const state = states.get(tabId);

      if (!hasItems) {
        return "raw-terminal";
      }

      return state?.view ?? "agent-output";
    },
    setView(tabId: string, view: TerminalOutputView) {
      getOrCreate(tabId).view = view;
    },
    getExpandedIds(tabId: string) {
      return new Set(states.get(tabId)?.expandedIds ?? []);
    },
    toggleExpanded(tabId: string, id: string) {
      const expandedIds = getOrCreate(tabId).expandedIds;

      if (expandedIds.has(id)) {
        expandedIds.delete(id);
      } else {
        expandedIds.add(id);
      }
    },
    toggleTranscriptExpanded(tabId: string, id: string, transcriptIds: Iterable<string>) {
      const expandedIds = getOrCreate(tabId).expandedIds;
      const transcriptIdSet = new Set(transcriptIds);

      if (!transcriptIdSet.has(id)) {
        return;
      }

      const wasExpanded = expandedIds.has(id);
      transcriptIdSet.forEach((transcriptId) => expandedIds.delete(transcriptId));

      if (!wasExpanded) {
        expandedIds.add(id);
      }
    },
    reconcile(tabId: string, ids: Iterable<string>) {
      const state = states.get(tabId);

      if (!state) {
        return;
      }

      const presentIds = new Set(ids);
      state.expandedIds = new Set(
        [...state.expandedIds].filter((id) => presentIds.has(id))
      );
    },
    remove(tabId: string) {
      states.delete(tabId);
    }
  };
}
