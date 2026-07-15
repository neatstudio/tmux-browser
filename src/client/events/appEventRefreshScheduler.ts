import type { AppEvent } from "../../shared/appEvents";
import type { TimelineEvent } from "../../shared/timeline";

export function createAppEventRefreshScheduler(
  refresh: () => void,
  options: { delayMs?: number } = {}
) {
  const delayMs = options.delayMs ?? 120;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer === null) {
      return;
    }

    clearTimeout(timer);
    timer = null;
  }

  return {
    schedule() {
      if (timer !== null) {
        return;
      }

      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, delayMs);
    },
    cancel: clearTimer
  };
}

export function createAppEventTimelineHandler(options: {
  mergeTimelineEvent: (event: TimelineEvent) => void;
  refreshTimeline: () => void;
  scheduleSessionsRefresh: () => void;
  onAttentionEvent?: (event: Extract<AppEvent, { type: "hook-event" }>) => void;
}) {
  return {
    onEvent(event: AppEvent) {
      if (event.type === "sessions-invalidated") {
        options.scheduleSessionsRefresh();
        return;
      }

      if (event.type === "hook-event") {
        options.onAttentionEvent?.(event);
      }

      options.mergeTimelineEvent(event);
    },
    onReconnect() {
      options.refreshTimeline();
    }
  };
}

export type UnifiedPanelTab = "activity" | "attention";

export type UnifiedPanelState = {
  activeTab: UnifiedPanelTab;
  expandedIds: Set<string>;
  selectedEventId: string | null;
};

export function createUnifiedPanelState() {
  let state: UnifiedPanelState = {
    activeTab: "activity",
    expandedIds: new Set(),
    selectedEventId: null
  };

  return {
    getState() {
      return state;
    },
    selectTab(activeTab: UnifiedPanelTab) {
      state = { ...state, activeTab, selectedEventId: null };
    },
    openActivity() {
      state = { ...state, activeTab: "activity", selectedEventId: null };
    },
    openAttention(eventId: string) {
      const expandedIds = new Set(state.expandedIds);
      expandedIds.add(eventId);
      state = {
        ...state,
        activeTab: "attention",
        selectedEventId: eventId,
        expandedIds
      };
    },
    toggleExpanded(eventId: string) {
      const expandedIds = new Set(state.expandedIds);
      if (expandedIds.has(eventId)) {
        expandedIds.delete(eventId);
      } else {
        expandedIds.add(eventId);
      }
      state = { ...state, expandedIds };
    },
    reconcileTimeline(eventIds: Iterable<string>) {
      const presentIds = new Set(eventIds);
      state = {
        ...state,
        expandedIds: new Set(
          [...state.expandedIds].filter((eventId) => presentIds.has(eventId))
        ),
        selectedEventId:
          state.selectedEventId && presentIds.has(state.selectedEventId)
            ? state.selectedEventId
            : null
      };
    }
  };
}
