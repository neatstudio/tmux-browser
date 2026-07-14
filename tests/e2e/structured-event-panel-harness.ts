import "../../src/client/styles.css";
import { renderActionCenterPanel } from "../../src/client/render/actionCenter";
import { renderHookEventToast } from "../../src/client/render/hookEventToast";
import { adaptStructuredRecord } from "../../src/client/structuredPresentation";
import { applyStructuredActionAvailability } from "../../src/client/structuredActionRunner";
import { createUnifiedPanelState } from "../../src/client/events/appEventRefreshScheduler";
import fixture from "./structured-event-panel-fixture.json";

const root = document.querySelector<HTMLElement>("#panel-root")!;
const state = createUnifiedPanelState();
let open = false;
let toastDismissed = false;
const records = new URLSearchParams(window.location.search).has("benchmark")
  ? ((await fetch("/api/timeline?limit=1000").then((response) => response.json())) as { events: unknown[] }).events
  : fixture;
const hydratedRecords = records.map((record) => {
  const value = record as Record<string, unknown>;
  const metadata = value.metadata as Record<string, unknown> | undefined;
  return metadata?.fixturelongwordcharacters === 2048
    ? { ...value, content: `npm test\n${"x".repeat(2048)}` }
    : value;
});
let structuredItems = applyStructuredActionAvailability(
  hydratedRecords.map((record) => adaptStructuredRecord(record)).filter((item) => item !== null),
  []
);

declare global {
  interface Window {
    __structuredActivityTest: {
      streamRevision: (revision: number) => void;
    };
  }
}

function render() {
  renderActionCenterPanel(root, {
    open,
    items: [],
    structuredItems,
    ...state.getState(),
    loading: false,
    error: null,
    onTabChange: (tab) => {
      state.selectTab(tab);
      render();
    },
    onToggleExpanded: (id) => {
      state.toggleExpanded(id);
      render();
    },
    onClose: () => { open = false; render(); },
    onOpenSession: () => {},
    onDismissPrompt: () => {},
    onSendPrompt: () => {},
    onRunHookAction: () => {}
  });
  renderHookEventToast(
    root,
    toastDismissed ? [] : structuredItems.filter((item) => item.kind === "hook"),
    {
      onDismiss: () => { toastDismissed = true; render(); },
      onOpenSession: () => {},
      onOpenActions: (id) => {
        toastDismissed = true;
        open = true;
        state.openAttention(id);
        render();
      },
      onSendEnter: () => {},
      onRunAction: () => {}
    }
  );
}

window.__structuredActivityTest = {
  streamRevision(revision) {
    structuredItems = structuredItems.map((item) =>
      item.id === "complete-1"
        ? {
            ...item,
            status: "streaming",
            summary: `Streaming revision ${revision}`
          }
        : item
    );
    render();
  }
};

document.querySelector("#open-panel")?.addEventListener("click", () => {
  open = true;
  state.openActivity();
  render();
});

render();
