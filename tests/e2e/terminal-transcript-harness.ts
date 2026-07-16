import "../../src/client/styles.css";
import { renderSessionFloatingMenu } from "../../src/client/render/sessionFloatingMenu";
import { renderTerminalStructuredOutput } from "../../src/client/render/terminalStructuredOutput";
import { createTerminalTab } from "../../src/client/terminal/createTerminalTab";
import {
  deriveTerminalAgentTranscriptForStructuredHistory,
  type TerminalAgentTranscript,
  type TerminalStyledLine
} from "../../src/client/terminal/structuredOutput";
import { createTerminalStructuredOutputState } from "../../src/client/terminal/structuredOutputState";

type CapturedMessage = {
  type: string;
  data?: string;
  cols?: number;
  rows?: number;
};

const tabId = "terminal-transcript-harness";
const terminalTypography = {
  fontFamily: '"Iosevka Term", monospace',
  fontSize: 15,
  lineHeight: 1.4
};
const sentMessages: CapturedMessage[] = [];
let socket: HarnessWebSocket | null = null;
let copiedText = "";
let paneSummaryCalls = 0;
const paneClicks: string[] = [];
let lastSnapshot: {
  text: string;
  startLine: number;
  styledLines: TerminalStyledLine[];
  isTranscriptCandidate: boolean;
  tailRows: number;
} | null = null;
let liveTranscriptEnabled = false;

class HarnessWebSocket {
  static readonly OPEN = 1;
  readonly OPEN = HarnessWebSocket.OPEN;
  readyState = HarnessWebSocket.OPEN;
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(_url: string) {
    socket = this;
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  send(payload: string) {
    sentMessages.push(JSON.parse(payload) as CapturedMessage);
  }

  close() {
    this.readyState = 3;
    this.emit("close", new Event("close"));
  }

  emitPty(data: string) {
    this.emit(
      "message",
      new MessageEvent("message", {
        data: JSON.stringify({ type: "output", data })
      })
    );
  }

  private emit(type: string, event: Event) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

const transcript: TerminalAgentTranscript = {
  blocks: [
    {
      id: "narrative:intro",
      kind: "narrative",
      text: "Preparing the terminal transcript."
    },
    {
      id: "blank:two-lines",
      kind: "narrative",
      text: "",
      blankLineCount: 2
    },
    {
      id: "activity:inspect",
      kind: "activity",
      groupId: "group:work",
      title: "Inspect terminal state",
      text: "Inspect terminal state\nread xterm output",
      styledLines: [
        {
          absoluteLine: 10,
          spans: [{ text: "Inspect terminal state", style: { color: "#92d192", bold: true } }]
        },
        {
          absoluteLine: 11,
          spans: [{ text: "read xterm output", style: { color: "#8bb8ff" } }]
        }
      ]
    },
    {
      id: "activity:test",
      kind: "activity",
      groupId: "group:work",
      title: "Run focused tests",
      text: "Run focused tests\n92 tests passed",
      styledLines: [
        {
          absoluteLine: 12,
          spans: [{ text: "Run focused tests", style: { color: "#e6c384", bold: true } }]
        },
        {
          absoluteLine: 13,
          spans: [{ text: "92 tests passed", style: { color: "#92d192" } }]
        }
      ]
    },
    {
      id: "activity:render",
      kind: "activity",
      groupId: "group:work",
      title: "Render transcript overlay",
      text: "Render transcript overlay\nkeep terminal colors",
      styledLines: [
        {
          absoluteLine: 14,
          spans: [{ text: "Render transcript overlay", style: { color: "#d7a6ff", italic: true } }]
        },
        {
          absoluteLine: 15,
          spans: [{ text: "keep terminal colors", style: { color: "#7fd7d7", dim: true } }]
        }
      ]
    },
    {
      id: "narrative:outro",
      kind: "narrative",
      text: "The live terminal remains available below the overlay."
    }
  ]
};
let currentTranscript: TerminalAgentTranscript | null = transcript;

const root = document.querySelector<HTMLElement>("#terminal-transcript-root")!;
root.className = "panels-root";
root.style.height = "100dvh";
document.body.style.margin = "0";
document.body.style.background = "var(--terminal-bg)";
window.WebSocket = HarnessWebSocket as unknown as typeof WebSocket;

const panel = document.createElement("section");
panel.className = "terminal-panel is-active";
const frame = document.createElement("div");
frame.className = "terminal-frame";
panel.append(frame);
root.append(panel);

function getTerminalSize() {
  const latestTerminalSize = sentMessages.findLast(
    (message) =>
      (message.type === "attach" || message.type === "resize") &&
      message.cols !== undefined &&
      message.rows !== undefined
  );

  return {
    cols: latestTerminalSize?.cols ?? 0,
    rows: latestTerminalSize?.rows ?? 0
  };
}

function getPaneSummaries() {
  paneSummaryCalls += 1;
  const { cols, rows } = getTerminalSize();
  const leftWidth = Math.max(1, Math.floor(cols / 2));
  const createPane = (paneId: string, paneLeft: number, paneWidth: number) => ({
    sessionName: "terminal-transcript",
    paneId,
    windowIndex: 0,
    windowName: "harness",
    windowActive: true,
    paneIndex: paneId === "%1" ? 0 : 1,
    paneActive: paneId === "%1",
    currentCommand: "codex",
    currentPath: "/tmp/harness",
    paneDead: false,
    paneDeadStatus: null,
    panePid: 100,
    paneLeft,
    paneTop: 0,
    paneWidth,
    paneHeight: rows
  });

  return [
    createPane("%1", 0, leftWidth),
    createPane("%2", leftWidth, Math.max(1, cols - leftWidth))
  ];
}

function applySnapshot(
  text: string,
  startLine: number,
  styledLines: TerminalStyledLine[],
  isTranscriptCandidate: boolean,
  tailRows: number
) {
  lastSnapshot = { text, startLine, styledLines, isTranscriptCandidate, tailRows };

  if (!liveTranscriptEnabled) {
    return;
  }

  currentTranscript = isTranscriptCandidate
    ? deriveTerminalAgentTranscriptForStructuredHistory(
        text, startLine, styledLines, tailRows
      )
    : null;
  render();
}

const mounted = createTerminalTab({
  container: frame,
  rendererStatusElement: panel,
  tabId,
  sessionName: "terminal-transcript",
  fontFamily: terminalTypography.fontFamily,
  fontSize: terminalTypography.fontSize,
  lineHeight: terminalTypography.lineHeight,
  terminalTheme: {
    background: "#111111",
    foreground: "#dbe5ed",
    cursor: "#ffffff",
    selectionBackground: "#3b4752",
    green: "#92d192",
    yellow: "#e6c384",
    blue: "#8bb8ff",
    magenta: "#d7a6ff",
    cyan: "#7fd7d7"
  },
  onClosed: () => {},
  onOutput: (_data, text, startLine, styledLines, isTranscriptCandidate, tailRows) => {
    applySnapshot(text, startLine, styledLines, isTranscriptCandidate, tailRows);
  },
  onSnapshot: (text, startLine, styledLines, isTranscriptCandidate, tailRows) => {
    applySnapshot(text, startLine, styledLines, isTranscriptCandidate, tailRows);
  },
  getPaneSummaries,
  onPaneClick: (event) => {
    const relativeX = event.clientX - event.rect.left;
    paneClicks.push(relativeX < event.rect.width / 2 ? "%1" : "%2");
  }
});

renderSessionFloatingMenu(panel, {
  currentSessionName: "terminal-transcript",
  sessions: ["terminal-transcript"],
  onOpenDashboard: () => {},
  onOpenKanban: () => {},
  onOpenSession: () => {},
  onConfig: () => {},
  onRename: () => {},
  onSendCommand: () => {},
  onRefresh: () => {},
  onCreateSession: () => {}
});

const outputState = createTerminalStructuredOutputState();
let view: "agent-output" | "raw-terminal" = "agent-output";

function render() {
  const blocks = currentTranscript?.blocks ?? [];
  const activityIds = blocks
    .filter((block) => block.kind === "activity")
    .map((block) => block.id);
  outputState.reconcile(tabId, blocks.map((block) => block.id));
  renderTerminalStructuredOutput(frame, {
    items: [],
    transcript: currentTranscript,
    view,
    expandedIds: outputState.getExpandedIds(tabId),
    onViewChange: (nextView) => {
      view = nextView;
      render();
    },
    onToggleExpanded: (id) => {
      outputState.toggleTranscriptExpanded(tabId, id, activityIds);
      render();
    }
  });
  frame.classList.toggle(
    "is-agent-output-hidden",
    view === "agent-output" && currentTranscript !== null
  );
}

render();

declare global {
  interface Window {
    __terminalTranscriptHarness: {
      emitPty: (data: string) => void;
      sendInterrupt: () => void;
      setLiveTranscript: (enabled: boolean) => void;
      toggleBrowserScroll: () => void;
      copyPaneSelectionWithCtrlC: () => void;
      getState: () => {
        sentMessages: CapturedMessage[];
        terminalSize: { cols: number; rows: number };
        visibleText: string;
        copiedText: string;
        paneSummaryCalls: number;
        paneClicks: string[];
        lastSnapshot: {
          text: string;
          startLine: number;
        } | null;
        typography: {
          fontFamily: string;
          fontSize: string;
          lineHeight: string;
        };
      };
    };
  }
}

window.__terminalTranscriptHarness = {
  emitPty(data) {
    socket?.emitPty(data);
  },
  sendInterrupt() {
    mounted.sendInput("\x03");
  },
  setLiveTranscript(enabled) {
    liveTranscriptEnabled = enabled;
    currentTranscript = enabled && lastSnapshot
      ? deriveTerminalAgentTranscriptForStructuredHistory(
          lastSnapshot.text,
          lastSnapshot.startLine,
          lastSnapshot.styledLines,
          lastSnapshot.tailRows
        )
      : enabled
        ? null
        : transcript;
    render();
  },
  toggleBrowserScroll() {
    mounted.toggleBrowserScroll();
  },
  copyPaneSelectionWithCtrlC() {
    const target = frame.querySelector<HTMLElement>(".xterm") ?? frame;
    target.dispatchEvent(new KeyboardEvent("keydown", {
      key: "c",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    }));
    const copyEvent = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(copyEvent, "clipboardData", {
      value: {
        setData(type: string, value: string) {
          if (type === "text/plain") {
            copiedText = value;
          }
        }
      }
    });
    target.dispatchEvent(copyEvent);
  },
  getState() {
    const transcriptElement = frame.querySelector<HTMLElement>(".terminal-agent-transcript");
    const typography = transcriptElement ? getComputedStyle(transcriptElement) : null;
    return {
      sentMessages: [...sentMessages],
      terminalSize: getTerminalSize(),
      visibleText: mounted.getVisibleText(),
      copiedText,
      paneSummaryCalls,
      paneClicks: [...paneClicks],
      lastSnapshot: lastSnapshot
        ? { text: lastSnapshot.text, startLine: lastSnapshot.startLine }
        : null,
      typography: {
        fontFamily: typography?.fontFamily ?? terminalTypography.fontFamily,
        fontSize: typography?.fontSize ?? `${terminalTypography.fontSize}px`,
        lineHeight: typography?.lineHeight ??
          `${terminalTypography.fontSize * terminalTypography.lineHeight}px`
      }
    };
  }
};
