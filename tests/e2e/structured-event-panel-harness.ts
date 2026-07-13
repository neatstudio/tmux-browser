import "../../src/client/styles.css";
import { renderActionCenterPanel } from "../../src/client/render/actionCenter";
import { adaptStructuredRecord } from "../../src/client/structuredPresentation";
import { createUnifiedPanelState } from "../../src/client/events/appEventRefreshScheduler";
import fixture from "./structured-event-panel-fixture.json";

const root = document.querySelector<HTMLElement>("#panel-root")!;
const state = createUnifiedPanelState();
let open = false;
const records = new URLSearchParams(window.location.search).has("benchmark")
  ? ((await fetch("/api/timeline?limit=1000").then((response) => response.json())) as { events: unknown[] }).events
  : fixture;
const structuredItems = records
  .map((record) => adaptStructuredRecord(record))
  .filter((item) => item !== null);

function render() {
  renderActionCenterPanel(root, {
    open,
    items: [],
    structuredItems,
    ...state.getState(),
    loading: false,
    error: null,
    onTabChange: (tab) => {
      if (tab === "activity") state.openActivity();
      else state.openAttention("attention-1");
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
}

document.querySelector("#open-panel")?.addEventListener("click", () => {
  open = true;
  state.openActivity();
  render();
});
