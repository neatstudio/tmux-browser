import "@xterm/xterm/css/xterm.css";

import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";

import type { TerminalTheme } from "../theme/themeState";
import type {
  AttachMessage,
  ServerMessage
} from "../../shared/protocol";
import {
  getImageUrlFromDataTransfer,
  getImageFileFromFiles,
  getImageFileFromItems,
  hasImageFileCandidate,
  hasImageUrlCandidate,
  uploadImageForSession,
  uploadImageUrlForSession
} from "../imageUpload";

const TERMINAL_SCROLLBACK = 5000;
const PIXELS_PER_SCROLL_LINE = 40;
const TOUCH_PIXELS_PER_SCROLL_LINE = 12;
const SHIFT_ENTER_SEQUENCE = "\x1b[13;2u";

type FrameDeps = {
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
};

type Disposable = {
  dispose: () => void;
};

type RenderedOutputListener = (rawData: string, visibleText: string) => void;

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
  const pendingMessages: string[] = [];

  function isSocketOpen() {
    if (deps.socket.readyState === undefined) {
      return true;
    }

    const openState = deps.socket.OPEN ?? WebSocket.OPEN;

    return deps.socket.readyState === openState;
  }

  function sendOrQueue(message: unknown) {
    const payload = JSON.stringify(message);

    if (isSocketOpen()) {
      deps.socket.send(payload);
      return;
    }

    pendingMessages.push(payload);
  }

  function flushPendingMessages() {
    while (pendingMessages.length > 0 && isSocketOpen()) {
      const payload = pendingMessages.shift();

      if (payload) {
        deps.socket.send(payload);
      }
    }
  }

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
  deps.socket.addEventListener("open", flushPendingMessages);

  return {
    handleMessage,
    attach(message: AttachMessage) {
      sendOrQueue(message);
    },
    sendInput(data: string) {
      sendOrQueue({ type: "input", data });
    },
    resize(cols: number, rows: number) {
      sendOrQueue({ type: "resize", cols, rows });
    },
    scroll(lines: number) {
      sendOrQueue({ type: "scroll", lines });
    },
    clearHistory() {
      sendOrQueue({ type: "clear-history" });
    },
    destroy() {
      closedByApp = true;
      deps.socket.removeEventListener?.("message", handleSocketMessage);
      deps.socket.removeEventListener?.("close", handleSocketClose);
      deps.socket.removeEventListener?.("open", flushPendingMessages);
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

function openTerminalWebLink(event: MouseEvent, uri: string) {
  event.preventDefault();

  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(uri);
  const target = hasProtocol ? uri : `https://${uri}`;

  try {
    const url = new URL(target);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }

    window.open(url.href, "_blank", "noopener,noreferrer");
  } catch {
    // Ignore malformed linkifier matches instead of forwarding unsafe strings.
  }
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

function refreshTerminalRenderer(terminal: Terminal) {
  try {
    terminal.clearTextureAtlas();
  } catch {
    // Non-WebGL renderers may not have an active texture atlas to clear.
  }

  try {
    terminal.refresh(0, Math.max(0, terminal.rows - 1));
  } catch (error) {
    console.warn("Terminal refresh skipped; renderer is not usable.", error);
  }
}

function getRenderedTerminalText(terminal: Terminal) {
  const buffer = terminal.buffer.active;
  const startLine = Math.max(0, buffer.baseY);
  const endLine = Math.min(buffer.length, startLine + terminal.rows);
  const lines: string[] = [];

  for (let lineIndex = startLine; lineIndex < endLine; lineIndex += 1) {
    const line = buffer.getLine(lineIndex);

    if (!line) {
      continue;
    }

    lines.push(line.translateToString(true));
  }

  return lines.join("\n").trim();
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
  onOutput?: RenderedOutputListener;
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
  const webLinksAddon = new WebLinksAddon(openTerminalWebLink);
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);
  terminal.open(deps.container);

  const outputBuffer = createTerminalOutputBuffer((data) => {
    terminal.write(data, () => {
      deps.onOutput?.(data, getRenderedTerminalText(terminal));
    });
  });
  let socket: WebSocket | null = null;
  let controller: ReturnType<typeof createTerminalTabController> | null = null;
  let browserScrollEnabled = false;
  let touchScrollY: number | null = null;
  let pointerScrollY: number | null = null;
  let activePointerId: number | null = null;
  let pendingResizeFrame: number | null = null;
  const scrollStatusElement = deps.rendererStatusElement ?? deps.container;
  let hasWarnedAboutFitFailure = false;

  function safeFitTerminal() {
    try {
      fitAddon.fit();
      hasWarnedAboutFitFailure = false;
      return true;
    } catch (error) {
      if (!hasWarnedAboutFitFailure) {
        console.warn("Terminal fit skipped; renderer is not usable.", error);
        hasWarnedAboutFitFailure = true;
      }
      return false;
    }
  }

  function safeFitAndResize() {
    if (!safeFitTerminal()) {
      return;
    }

    refreshTerminalRenderer(terminal);
    controller?.resize(terminal.cols, terminal.rows);
  }

  function scheduleFitAndResize() {
    if (pendingResizeFrame !== null) {
      return;
    }

    pendingResizeFrame = window.requestAnimationFrame(() => {
      pendingResizeFrame = null;
      safeFitAndResize();
    });
  }

  function syncBrowserScrollMode() {
    scrollStatusElement.classList.toggle(
      "is-browser-scroll",
      browserScrollEnabled
    );
    scrollStatusElement.dataset.scrollMode = browserScrollEnabled
      ? "browser"
      : "tmux";
  }

  async function uploadAndInsertImage(file: File) {
    outputBuffer.write("\r\n[uploading image]\r\n");

    try {
      const upload = await uploadImageForSession(deps.sessionName, file);
      controller?.sendInput(upload.absolutePath);
      outputBuffer.write(`\r\n[image path inserted] ${upload.absolutePath}\r\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      outputBuffer.write(`\r\n[image upload failed] ${message}\r\n`);
    }
  }

  async function uploadAndInsertImageUrl(url: string) {
    outputBuffer.write("\r\n[uploading image url]\r\n");

    try {
      const upload = await uploadImageUrlForSession(deps.sessionName, url);
      controller?.sendInput(upload.absolutePath);
      outputBuffer.write(`\r\n[image path inserted] ${upload.absolutePath}\r\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      outputBuffer.write(`\r\n[image upload failed] ${message}\r\n`);
    }
  }

  const handlePaste = (event: ClipboardEvent) => {
    const file = getImageFileFromItems(event.clipboardData?.items);

    if (!file) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    void uploadAndInsertImage(file);
  };

  const handleDrop = (event: DragEvent) => {
    const file =
      getImageFileFromItems(event.dataTransfer?.items) ??
      getImageFileFromFiles(event.dataTransfer?.files);

    if (file) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void uploadAndInsertImage(file);
      return;
    }

    if (!hasImageUrlCandidate(event.dataTransfer ?? undefined)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    void getImageUrlFromDataTransfer(event.dataTransfer ?? undefined).then((url) => {
      if (url) {
        void uploadAndInsertImageUrl(url);
      }
    });
  };

  const handleDragOver = (event: DragEvent) => {
    if (
      !hasImageFileCandidate({
        items: event.dataTransfer?.items,
        files: event.dataTransfer?.files
      }) &&
      !hasImageUrlCandidate(event.dataTransfer ?? undefined)
    ) {
      return;
    }

    event.preventDefault();
    event.dataTransfer!.dropEffect = "copy";
  };

  safeFitTerminal();
  const webglRenderer = createWebglRenderer(
    terminal,
    deps.rendererStatusElement ?? deps.container
  );
  syncBrowserScrollMode();

  const attach = () => {
    safeFitTerminal();
    controller?.attach({
      type: "attach",
      tabId: deps.tabId,
      sessionName: deps.sessionName,
      cols: terminal.cols,
      rows: terminal.rows
    });
  };

  function connect(options: { announce?: boolean } = {}) {
    controller?.destroy();
    socket = createTerminalSocket();
    controller = createTerminalTabController({
      socket,
      onOutput: (data) => {
        outputBuffer.write(data);
      },
      onClosed: deps.onClosed
    });
    attach();

    if (options.announce) {
      outputBuffer.write("\r\n[reconnecting]\r\n");
    }
  }

  connect();

  const handleWheel = (event: WheelEvent) => {
    if (browserScrollEnabled) {
      return;
    }

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
  const imageDropTarget = deps.rendererStatusElement ?? deps.container;
  imageDropTarget.addEventListener("paste", handlePaste, true);
  imageDropTarget.addEventListener("drop", handleDrop, true);
  imageDropTarget.addEventListener("dragover", handleDragOver, true);

  const handleTouchStart = (event: TouchEvent) => {
    if (browserScrollEnabled || event.touches.length !== 1) {
      touchScrollY = null;
      return;
    }

    touchScrollY = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (
      browserScrollEnabled ||
      event.touches.length !== 1 ||
      touchScrollY === null
    ) {
      return;
    }

    const nextY = event.touches[0]?.clientY;

    if (nextY === undefined) {
      return;
    }

    const deltaY = nextY - touchScrollY;
    const lines = -Math.trunc(deltaY / TOUCH_PIXELS_PER_SCROLL_LINE);

    if (lines === 0) {
      return;
    }

    touchScrollY = nextY;
    event.preventDefault();
    event.stopImmediatePropagation();
    controller?.scroll(lines);
  };

  const handleTouchEnd = () => {
    touchScrollY = null;
  };

  deps.container.addEventListener("touchstart", handleTouchStart, {
    capture: true,
    passive: true
  });
  deps.container.addEventListener("touchmove", handleTouchMove, {
    capture: true,
    passive: false
  });
  deps.container.addEventListener("touchend", handleTouchEnd, {
    capture: true
  });
  deps.container.addEventListener("touchcancel", handleTouchEnd, {
    capture: true
  });

  const handlePointerDown = (event: PointerEvent) => {
    if (browserScrollEnabled || event.pointerType !== "touch") {
      pointerScrollY = null;
      activePointerId = null;
      return;
    }

    pointerScrollY = event.clientY;
    activePointerId = event.pointerId;
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (
      browserScrollEnabled ||
      event.pointerType !== "touch" ||
      pointerScrollY === null ||
      activePointerId !== event.pointerId
    ) {
      return;
    }

    const deltaY = event.clientY - pointerScrollY;
    const lines = -Math.trunc(deltaY / TOUCH_PIXELS_PER_SCROLL_LINE);

    if (lines === 0) {
      return;
    }

    pointerScrollY = event.clientY;
    event.preventDefault();
    event.stopImmediatePropagation();
    controller?.scroll(lines);
  };

  const handlePointerEnd = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) {
      return;
    }

    pointerScrollY = null;
    activePointerId = null;
  };

  deps.container.addEventListener("pointerdown", handlePointerDown, {
    capture: true
  });
  deps.container.addEventListener("pointermove", handlePointerMove, {
    capture: true,
    passive: false
  });
  deps.container.addEventListener("pointerup", handlePointerEnd, {
    capture: true
  });
  deps.container.addEventListener("pointercancel", handlePointerEnd, {
    capture: true
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
    safeFitAndResize();
  };

  window.addEventListener("resize", handleWindowResize);
  const resizeObserver =
    "ResizeObserver" in window
      ? new ResizeObserver(() => {
          scheduleFitAndResize();
        })
      : null;
  resizeObserver?.observe(deps.container);

  terminal.onData((data) => {
    controller?.sendInput(data);
  });

  return {
    sendInput(data: string) {
      controller?.sendInput(data);
    },
    getVisibleText() {
      return getRenderedTerminalText(terminal);
    },
    clear() {
      terminal.clear();
      controller?.clearHistory();
    },
    redraw() {
      safeFitAndResize();
    },
    reconnect() {
      connect({ announce: true });
    },
    scrollPage(direction: "back" | "forward") {
      controller?.scroll(direction === "back" ? -terminal.rows : terminal.rows);
    },
    toggleBrowserScroll() {
      browserScrollEnabled = !browserScrollEnabled;
      syncBrowserScrollMode();

      return browserScrollEnabled;
    },
    isBrowserScrollEnabled() {
      return browserScrollEnabled;
    },
    setTheme(theme: TerminalTheme) {
      terminal.options.theme = theme;
      refreshTerminalRenderer(terminal);
    },
    setFontSize(fontSize: number) {
      terminal.options.fontSize = fontSize;
      safeFitAndResize();
    },
    setFontFamily(fontFamily: string) {
      terminal.options.fontFamily = fontFamily;
      safeFitAndResize();
    },
    setLineHeight(lineHeight: number) {
      terminal.options.lineHeight = lineHeight;
      safeFitAndResize();
    },
    destroy() {
      if (pendingResizeFrame !== null) {
        window.cancelAnimationFrame(pendingResizeFrame);
        pendingResizeFrame = null;
      }

      resizeObserver?.disconnect();
      deps.container.removeEventListener("wheel", handleWheel, true);
      imageDropTarget.removeEventListener("paste", handlePaste, true);
      imageDropTarget.removeEventListener("drop", handleDrop, true);
      imageDropTarget.removeEventListener("dragover", handleDragOver, true);
      deps.container.removeEventListener("touchstart", handleTouchStart, true);
      deps.container.removeEventListener("touchmove", handleTouchMove, true);
      deps.container.removeEventListener("touchend", handleTouchEnd, true);
      deps.container.removeEventListener("touchcancel", handleTouchEnd, true);
      deps.container.removeEventListener("pointerdown", handlePointerDown, true);
      deps.container.removeEventListener("pointermove", handlePointerMove, true);
      deps.container.removeEventListener("pointerup", handlePointerEnd, true);
      deps.container.removeEventListener("pointercancel", handlePointerEnd, true);
      window.removeEventListener("resize", handleWindowResize);
      controller?.destroy();
      controller = null;
      socket = null;
      outputBuffer.destroy();
      webglRenderer?.dispose();
      scrollStatusElement.classList.remove("is-browser-scroll");
      delete scrollStatusElement.dataset.scrollMode;
      terminal.dispose();
    }
  };
}
