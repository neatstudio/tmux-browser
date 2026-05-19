import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";

import type { TerminalTheme } from "../theme/themeState";
import type {
  AttachMessage,
  ServerMessage
} from "../../shared/protocol";

const TERMINAL_SCROLLBACK = 5000;
const PIXELS_PER_SCROLL_LINE = 40;
const SHIFT_ENTER_SEQUENCE = "\x1b[13;2u";

type FrameDeps = {
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
};

type Disposable = {
  dispose: () => void;
};

type BrowserSocket = {
  send: (payload: string) => void;
  close: () => void;
  addEventListener: (
    type: string,
    listener: (event?: MessageEvent<string> | Event) => void
  ) => void;
  removeEventListener?: (
    type: string,
    listener: (event?: MessageEvent<string> | Event) => void
  ) => void;
  readyState?: number;
  OPEN?: number;
};

export function createTerminalTabController(deps: {
  socket: BrowserSocket;
  onOutput: (data: string) => void;
  onClosed: () => void;
}) {
  let closedByApp = false;

  function handleMessage(message: ServerMessage) {
    if (message.type === "output") {
      deps.onOutput(message.data);
      return;
    }

    if (message.type === "error") {
      deps.onOutput(`\r\n[error] ${message.message}\r\n`);
      return;
    }

    deps.onClosed();
  }

  function handleSocketMessage(event?: MessageEvent<string> | Event) {
    if (!event || !("data" in event) || typeof event.data !== "string") {
      return;
    }

    handleMessage(JSON.parse(event.data) as ServerMessage);
  }

  function handleSocketClose() {
    if (!closedByApp) {
      deps.onOutput("\r\n[disconnected]\r\n");
    }
  }

  deps.socket.addEventListener("message", handleSocketMessage);
  deps.socket.addEventListener("close", handleSocketClose);

  return {
    handleMessage,
    attach(message: AttachMessage) {
      deps.socket.send(JSON.stringify(message));
    },
    sendInput(data: string) {
      deps.socket.send(JSON.stringify({ type: "input", data }));
    },
    resize(cols: number, rows: number) {
      deps.socket.send(JSON.stringify({ type: "resize", cols, rows }));
    },
    scroll(lines: number) {
      deps.socket.send(JSON.stringify({ type: "scroll", lines }));
    },
    destroy() {
      closedByApp = true;
      deps.socket.removeEventListener?.("message", handleSocketMessage);
      deps.socket.removeEventListener?.("close", handleSocketClose);
      deps.socket.close();
    }
  };
}

function createTerminalSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";

  return new WebSocket(`${protocol}://${window.location.host}/ws/terminal`);
}

export function createTerminalOutputBuffer(
  onFlush: (data: string) => void,
  deps: FrameDeps = {}
) {
  const requestFrame =
    deps.requestFrame ?? ((callback) => window.requestAnimationFrame(callback));
  const cancelFrame =
    deps.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle));
  let pendingOutput = "";
  let pendingFrame: number | null = null;

  function flush() {
    pendingFrame = null;

    if (!pendingOutput) {
      return;
    }

    const output = pendingOutput;
    pendingOutput = "";
    onFlush(output);
  }

  return {
    write(data: string) {
      pendingOutput += data;

      if (pendingFrame !== null) {
        return;
      }

      pendingFrame = requestFrame(flush);
    },
    destroy() {
      if (pendingFrame !== null) {
        cancelFrame(pendingFrame);
        pendingFrame = null;
      }

      flush();
    }
  };
}

function getWheelHistoryLines(event: WheelEvent, rows: number) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * rows;
  }

  const lines = event.deltaY / PIXELS_PER_SCROLL_LINE;

  if (lines === 0) {
    return 0;
  }

  return lines > 0
    ? Math.max(1, Math.round(lines))
    : Math.min(-1, Math.round(lines));
}

function getTmuxWheelScrollLines(event: WheelEvent, rows: number) {
  const historyLines = getWheelHistoryLines(event, rows);

  if (historyLines === 0) {
    return 0;
  }

  return event.altKey ? Math.sign(historyLines) * rows : historyLines;
}

function isShiftEnterEvent(event: KeyboardEvent) {
  return (
    event.shiftKey &&
    (event.key === "Enter" ||
      event.key === "NumpadEnter" ||
      event.code === "Enter" ||
      event.code === "NumpadEnter" ||
      event.keyCode === 13)
  );
}

function createWebglRenderer(
  terminal: Terminal,
  container: HTMLElement
): Disposable | null {
  let webglAddon: WebglAddon | null = null;
  let contextLossDisposable: Disposable | null = null;
  let disposed = false;
  container.dataset.renderer = "dom";

  const disposeWebglRenderer = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    contextLossDisposable?.dispose();
    contextLossDisposable = null;
    webglAddon?.dispose();
    webglAddon = null;
    container.dataset.renderer = "dom";
  };

  try {
    webglAddon = new WebglAddon();
    contextLossDisposable = webglAddon.onContextLoss(disposeWebglRenderer);
    terminal.loadAddon(webglAddon);
    container.dataset.renderer = "webgl";

    return {
      dispose: disposeWebglRenderer
    };
  } catch (error) {
    disposeWebglRenderer();
    console.warn(
      "WebGL terminal renderer unavailable; using DOM renderer.",
      error
    );

    return null;
  }
}

export function createTerminalTab(deps: {
  container: HTMLElement;
  rendererStatusElement?: HTMLElement;
  tabId: string;
  sessionName: string;
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  terminalTheme?: TerminalTheme;
  onClosed: () => void;
}) {
  const terminal = new Terminal({
    cursorBlink: true,
    scrollback: TERMINAL_SCROLLBACK,
    ...(deps.fontSize ? { fontSize: deps.fontSize } : {}),
    ...(deps.fontFamily ? { fontFamily: deps.fontFamily } : {}),
    ...(deps.lineHeight ? { lineHeight: deps.lineHeight } : {}),
    ...(deps.terminalTheme ? { theme: deps.terminalTheme } : {})
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(deps.container);
  fitAddon.fit();
  const webglRenderer = createWebglRenderer(
    terminal,
    deps.rendererStatusElement ?? deps.container
  );

  const outputBuffer = createTerminalOutputBuffer((data) => terminal.write(data));
  let socket: WebSocket | null = null;
  let controller: ReturnType<typeof createTerminalTabController> | null = null;

  const attach = () => {
    fitAddon.fit();
    controller?.attach({
      type: "attach",
      tabId: deps.tabId,
      sessionName: deps.sessionName,
      cols: terminal.cols,
      rows: terminal.rows
    });
  };

  function connect(options: { announce?: boolean } = {}) {
    socket?.removeEventListener("open", attach);
    controller?.destroy();
    socket = createTerminalSocket();
    controller = createTerminalTabController({
      socket,
      onOutput: (data) => outputBuffer.write(data),
      onClosed: deps.onClosed
    });
    socket.addEventListener("open", attach);

    if (options.announce) {
      outputBuffer.write("\r\n[reconnecting]\r\n");
    }
  }

  connect();

  const handleWheel = (event: WheelEvent) => {
    const historyLines = getTmuxWheelScrollLines(event, terminal.rows);

    if (historyLines === 0) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    controller?.scroll(historyLines);
  };

  deps.container.addEventListener("wheel", handleWheel, {
    capture: true,
    passive: false
  });

  terminal.attachCustomKeyEventHandler((event) => {
    if (isShiftEnterEvent(event)) {
      if (event.type === "keydown") {
        if (terminal.modes.bracketedPasteMode) {
          terminal.paste("\n");
        } else {
          // CSI-u preserves Shift+Enter as a modified key for terminal apps.
          controller?.sendInput(SHIFT_ENTER_SEQUENCE);
        }
      }

      return false;
    }

    if (event.type === "keydown" && event.key === "PageUp") {
      controller?.scroll(-terminal.rows);
      return false;
    }

    if (event.type === "keydown" && event.key === "PageDown") {
      controller?.scroll(terminal.rows);
      return false;
    }

    return true;
  });

  const handleWindowResize = () => {
    fitAddon.fit();
    controller?.resize(terminal.cols, terminal.rows);
  };

  window.addEventListener("resize", handleWindowResize);

  terminal.onData((data) => {
    controller?.sendInput(data);
  });

  return {
    sendInput(data: string) {
      controller?.sendInput(data);
    },
    clear() {
      terminal.clear();
    },
    redraw() {
      fitAddon.fit();
      controller?.resize(terminal.cols, terminal.rows);
    },
    reconnect() {
      connect({ announce: true });
    },
    setTheme(theme: TerminalTheme) {
      terminal.options.theme = theme;
    },
    setFontSize(fontSize: number) {
      terminal.options.fontSize = fontSize;
      fitAddon.fit();
      controller?.resize(terminal.cols, terminal.rows);
    },
    setFontFamily(fontFamily: string) {
      terminal.options.fontFamily = fontFamily;
      fitAddon.fit();
      controller?.resize(terminal.cols, terminal.rows);
    },
    setLineHeight(lineHeight: number) {
      terminal.options.lineHeight = lineHeight;
      fitAddon.fit();
      controller?.resize(terminal.cols, terminal.rows);
    },
    destroy() {
      deps.container.removeEventListener("wheel", handleWheel, true);
      window.removeEventListener("resize", handleWindowResize);
      socket?.removeEventListener("open", attach);
      controller?.destroy();
      controller = null;
      socket = null;
      outputBuffer.destroy();
      webglRenderer?.dispose();
      terminal.dispose();
    }
  };
}
