// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const terminalTestState = vi.hoisted(() => {
  const terminals: Array<{
    options: Record<string, unknown>;
    instance: {
      options: Record<string, unknown>;
      rows: number;
      loadAddon: ReturnType<typeof vi.fn>;
      open: ReturnType<typeof vi.fn>;
      onData: ReturnType<typeof vi.fn>;
      attachCustomKeyEventHandler: ReturnType<typeof vi.fn>;
      focus: ReturnType<typeof vi.fn>;
      scrollLines: ReturnType<typeof vi.fn>;
      write: ReturnType<typeof vi.fn>;
      paste: ReturnType<typeof vi.fn>;
      clear: ReturnType<typeof vi.fn>;
      refresh: ReturnType<typeof vi.fn>;
      clearTextureAtlas: ReturnType<typeof vi.fn>;
      clearSelection: ReturnType<typeof vi.fn>;
      getSelectionPosition: ReturnType<typeof vi.fn>;
      onSelectionChange: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
      modes: {
        bracketedPasteMode: boolean;
      };
      buffer: {
        active: {
          viewportY: number;
          baseY: number;
          length: number;
          getLine: ReturnType<typeof vi.fn>;
        };
      };
      customKeyEventHandler?: (event: KeyboardEvent) => boolean;
    };
  }> = [];
  const fitAddons: Array<{
    fit: ReturnType<typeof vi.fn>;
  }> = [];
  const webLinksAddons: Array<{
    dispose: ReturnType<typeof vi.fn>;
    handler?: (event: MouseEvent, uri: string) => void;
  }> = [];
  const webglAddons: Array<{
    dispose: ReturnType<typeof vi.fn>;
    onContextLoss: ReturnType<typeof vi.fn>;
    contextLossListener?: () => void;
    contextLossRegistrationDispose?: ReturnType<typeof vi.fn>;
  }> = [];

  return {
    terminals,
    fitAddons,
    webLinksAddons,
    webglAddons,
    fitShouldThrow: false,
    webglConstructShouldThrow: false,
    webglLoadShouldThrow: false
  };
});

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    options: Record<string, unknown>;
    cols = 120;
    rows = 40;
    loadAddon = vi.fn((addon: unknown) => {
      if (
        terminalTestState.webglLoadShouldThrow &&
        terminalTestState.webglAddons.includes(
          addon as (typeof terminalTestState.webglAddons)[number]
        )
      ) {
        throw new Error("webgl load failed");
      }
    });
    open = vi.fn((container: HTMLElement) => {
      const xterm = document.createElement("div");
      xterm.className = "xterm";
      Object.defineProperty(xterm, "getBoundingClientRect", {
        value: () => ({
          left: 0,
          top: 0,
          width: 800,
          height: 240,
          right: 800,
          bottom: 240,
          x: 0,
          y: 0,
          toJSON: () => ({})
        }),
        configurable: true
      });
      container.append(xterm);
    });
    onData = vi.fn();
    attachCustomKeyEventHandler = vi.fn(
      (handler: (event: KeyboardEvent) => boolean) => {
        this.customKeyEventHandler = handler;
      }
    );
    focus = vi.fn();
    scrollLines = vi.fn();
    write = vi.fn();
    paste = vi.fn();
    clear = vi.fn();
    refresh = vi.fn();
    clearTextureAtlas = vi.fn();
    clearSelection = vi.fn();
    getSelectionPosition = vi.fn();
    onSelectionChange = vi.fn((handler: () => void) => {
      this.selectionChangeHandler = handler;
      return {
        dispose: vi.fn()
      };
    });
    dispose = vi.fn();
    modes = {
      bracketedPasteMode: false
    };
    visibleLines = ["", "", ""];
    buffer = {
      active: {
        viewportY: 0,
        baseY: 0,
        length: 3,
        getLine: vi.fn((index: number) => {
          const line = this.visibleLines[index];

          if (line === undefined) {
            return undefined;
          }

          return {
            translateToString: vi.fn(() => line)
          };
        })
      }
    };
    customKeyEventHandler?: (event: KeyboardEvent) => boolean;
    selectionChangeHandler?: () => void;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      terminalTestState.terminals.push({
        options,
        instance: this
      });
    }
  }
}));

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {
    dispose = vi.fn();
    onContextLoss = vi.fn((listener: () => void) => {
      this.contextLossListener = listener;
      this.contextLossRegistrationDispose = vi.fn();

      return {
        dispose: this.contextLossRegistrationDispose
      };
    });
    contextLossListener?: () => void;
    contextLossRegistrationDispose?: ReturnType<typeof vi.fn>;

    constructor() {
      if (terminalTestState.webglConstructShouldThrow) {
        throw new Error("webgl unavailable");
      }

      terminalTestState.webglAddons.push(this);
    }
  }
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = vi.fn(() => {
      if (terminalTestState.fitShouldThrow) {
        throw new DOMException(
          "An attempt was made to use an object that is not, or is no longer, usable"
        );
      }
    });

    constructor() {
      terminalTestState.fitAddons.push(this);
    }
  }
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {
    dispose = vi.fn();
    handler?: (event: MouseEvent, uri: string) => void;

    constructor(handler?: (event: MouseEvent, uri: string) => void) {
      this.handler = handler;
      terminalTestState.webLinksAddons.push(this);
    }
  }
}));

import {
  createTerminalTab,
  createTerminalOutputBuffer,
  createTerminalTabController,
  stripTerminalDeviceAttributeResponses
} from "../../../src/client/terminal/createTerminalTab";
import { createTabState } from "../../../src/client/state/tabState";
import type { PaneSummary } from "../../../src/client/api/sessionApi";

function createTouchGestureEvent(type: string, clientY: number) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true
  });

  Object.defineProperty(event, "touches", {
    value: type === "touchend" || type === "touchcancel" ? [] : [{ clientY }],
    configurable: true
  });

  return event;
}

function createPointerGestureEvent(type: string, clientY: number) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true
  });

  Object.defineProperties(event, {
    clientY: {
      value: clientY,
      configurable: true
    },
    pointerId: {
      value: 7,
      configurable: true
    },
    pointerType: {
      value: "touch",
      configurable: true
    }
  });

  return event;
}

function createTerminalPane(overrides: Partial<PaneSummary>): PaneSummary {
  return {
    sessionName: "build",
    paneId: "%1",
    windowIndex: 0,
    windowName: "main",
    windowActive: true,
    paneIndex: 0,
    paneActive: false,
    currentCommand: "zsh",
    runtimeKind: "shell",
    currentPath: "/tmp/project",
    paneDead: false,
    paneDeadStatus: null,
    panePid: 100,
    paneLeft: 0,
    paneTop: 0,
    paneWidth: 40,
    paneHeight: 24,
    ...overrides
  };
}

describe("stripTerminalDeviceAttributeResponses", () => {
  it("removes terminal device attribute responses before they reach the shell", () => {
    expect(
      stripTerminalDeviceAttributeResponses("\x1b[?1;2c\x1b[>0;276;0c")
    ).toBe("");
    expect(
      stripTerminalDeviceAttributeResponses("typed\x1b[?1;2c text\x1b[>0;276;0c")
    ).toBe("typed text");
  });

  it("preserves modified key sequences used by the mobile toolbar", () => {
    const shiftedCursorKeys = "\x1b[1;2D\x1b[1;2A\x1b[1;2B\x1b[1;2C";
    const shiftEnter = "\x1b[13;2u";

    expect(
      stripTerminalDeviceAttributeResponses(`${shiftedCursorKeys}${shiftEnter}`)
    ).toBe(`${shiftedCursorKeys}${shiftEnter}`);
  });
});

describe("createTerminalTabController", () => {
  it("closes the browser tab when the server reports session exit", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn()
    };
    const onClosed = vi.fn();

    const controller = createTerminalTabController({
      socket,
      onClosed,
      onOutput: vi.fn()
    });

    controller.handleMessage({ type: "session-exit" });

    expect(onClosed).toHaveBeenCalled();
  });

  it("keeps the browser tab when the websocket closes without session exit", () => {
    const listeners = new Map<string, (event?: Event) => void>();
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn((type: string, listener: (event?: Event) => void) => {
        listeners.set(type, listener);
      })
    };
    const onClosed = vi.fn();
    const onOutput = vi.fn();
    const onDisconnect = vi.fn();

    createTerminalTabController({
      socket,
      onClosed,
      onOutput,
      onDisconnect
    });

    listeners.get("close")?.(new Event("close"));

    expect(onClosed).not.toHaveBeenCalled();
    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onOutput).not.toHaveBeenCalled();
  });

  it("queues input until the websocket is open and attached", () => {
    const listeners = new Map<string, (event?: Event) => void>();
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn((type: string, listener: (event?: Event) => void) => {
        listeners.set(type, listener);
      }),
      readyState: 0,
      OPEN: 1
    };
    const controller = createTerminalTabController({
      socket,
      onClosed: vi.fn(),
      onOutput: vi.fn()
    });

    controller.attach({
      type: "attach",
      tabId: "tab-1",
      sessionName: "build",
      cols: 120,
      rows: 40
    });
    controller.sendInput("y\r");

    expect(socket.send).not.toHaveBeenCalled();

    socket.readyState = 1;
    listeners.get("open")?.(new Event("open"));

    expect(socket.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({
        type: "attach",
        tabId: "tab-1",
        sessionName: "build",
        cols: 120,
        rows: 40
      })
    );
    expect(socket.send).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ type: "input", data: "y\r" })
    );
  });

  it("does not erase a pinned tab from storage during page reload socket close", () => {
    localStorage.clear();
    sessionStorage.clear();

    const state = createTabState();
    const opened = state.openTab("build");
    state.togglePinned(opened.id);

    const listeners = new Map<string, (event?: Event) => void>();
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn((type: string, listener: (event?: Event) => void) => {
        listeners.set(type, listener);
      })
    };

    createTerminalTabController({
      socket,
      onClosed: () => state.forceCloseTab(opened.id),
      onOutput: vi.fn()
    });

    listeners.get("close")?.(new Event("close"));

    expect(createTabState().getTabs()).toEqual([
      {
        id: opened.id,
        sessionName: "build",
        title: "build",
        pinned: true
      }
    ]);
  });
});

describe("createTerminalOutputBuffer", () => {
  it("batches multiple output chunks into one terminal write per animation frame", () => {
    let scheduledCallback: FrameRequestCallback | null = null;
    const write = vi.fn();
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledCallback = callback;
      return 1;
    });
    const buffer = createTerminalOutputBuffer(write, {
      requestFrame,
      cancelFrame: vi.fn()
    });

    buffer.write("first ");
    buffer.write("second");

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();

    scheduledCallback?.(performance.now());

    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith("first second");
  });

  it("flushes pending output before destroy", () => {
    const write = vi.fn();
    const cancelFrame = vi.fn();
    const buffer = createTerminalOutputBuffer(write, {
      requestFrame: vi.fn(() => 9),
      cancelFrame
    });

    buffer.write("pending");
    buffer.destroy();

    expect(cancelFrame).toHaveBeenCalledWith(9);
    expect(write).toHaveBeenCalledWith("pending");
  });

  it("batches output without reading rendered text itself", () => {
    const terminalTextSnapshots: string[] = [];
    let scheduledCallback: FrameRequestCallback | null = null;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledCallback = callback;
      return 1;
    });
    const buffer = createTerminalOutputBuffer(
      (data) => {
        terminalTextSnapshots.push(data);
      },
      {
        requestFrame,
        cancelFrame: vi.fn()
      }
    );

    buffer.write("raw ansi bytes");
    scheduledCallback?.(performance.now());

    expect(terminalTextSnapshots).toEqual(["raw ansi bytes"]);
  });
});

describe("createTerminalTab", () => {
  beforeEach(() => {
    terminalTestState.terminals.length = 0;
    terminalTestState.fitAddons.length = 0;
    terminalTestState.webLinksAddons.length = 0;
    terminalTestState.webglAddons.length = 0;
    terminalTestState.fitShouldThrow = false;
    terminalTestState.webglConstructShouldThrow = false;
    terminalTestState.webglLoadShouldThrow = false;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates xterm without convertEol for PTY streams", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const onConnectionStateChange = vi.fn();
    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn(),
      onConnectionStateChange
    });

    expect(terminalTestState.terminals).toHaveLength(1);
    expect(terminalTestState.terminals[0]?.options).toEqual({
      cursorBlink: true,
      scrollback: 5000
    });

    mounted.destroy();
  });

  it("reports rendered terminal text after output is written to xterm", () => {
    let scheduledCallback: FrameRequestCallback | null = null;
    const socketListeners = new Map<string, (event?: MessageEvent<string>) => void>();
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(
        (type: string, listener: (event?: MessageEvent<string>) => void) => {
          socketListeners.set(type, listener);
        }
      ),
      removeEventListener: vi.fn()
    };
    const onOutput = vi.fn();

    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (callback: FrameRequestCallback) => {
        scheduledCallback = callback;

        return 1;
      }
    );
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn(),
      onOutput
    });
    const terminal = terminalTestState.terminals[0]?.instance;
    terminal!.rows = 10;
    terminal!.buffer.active.baseY = 0;
    terminal!.buffer.active.viewportY = 0;
    terminal!.buffer.active.length = 10;
    terminal!.visibleLines = [
      "stale 1",
      "stale 2",
      "line 3",
      "line 4",
      "line 5",
      "line 6",
      "line 7",
      "line 8",
      "line 9",
      "Do you want to continue? [y/a/n]"
    ];

    socketListeners.get("message")?.({
      data: JSON.stringify({ type: "output", data: "\x1b[2Jraw tui repaint" })
    } as MessageEvent<string>);
    scheduledCallback?.(performance.now());

    expect(terminal?.write).toHaveBeenCalledWith(
      "\x1b[2Jraw tui repaint",
      expect.any(Function)
    );
    const writeCallback = terminal?.write.mock.calls[0]?.[1] as
      | (() => void)
      | undefined;
    writeCallback?.();

    expect(onOutput).toHaveBeenCalledWith(
      "\x1b[2Jraw tui repaint",
      "line 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nDo you want to continue? [y/a/n]"
    );

    mounted.destroy();
  });

  it("flushes the final prompt snapshot after the final terminal write", () => {
    let scheduledCallback: FrameRequestCallback | null = null;
    const socketListeners = new Map<string, (event?: MessageEvent<string>) => void>();
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(
        (type: string, listener: (event?: MessageEvent<string>) => void) => {
          socketListeners.set(type, listener);
        }
      ),
      removeEventListener: vi.fn()
    };
    const calls: string[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledCallback = callback;
      return 1;
    });
    vi.stubGlobal(WebSocket.name, class {
      constructor() {
        return socket;
      }
    });

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-final",
      sessionName: "build",
      onClosed: () => calls.push("closed"),
      onOutput: () => calls.push("snapshot")
    });
    socketListeners.get("message")?.({
      data: JSON.stringify({ type: "output", data: "final output" })
    } as MessageEvent<string>);
    socketListeners.get("message")?.({
      data: JSON.stringify({ type: "session-exit" })
    } as MessageEvent<string>);

    expect(calls).toEqual([]);
    scheduledCallback?.(performance.now());
    expect(calls).toEqual([]);
    const writeCallback = terminalTestState.terminals[0]?.instance.write.mock.calls[0]?.[1] as
      | (() => void)
      | undefined;
    writeCallback?.();

    expect(calls).toEqual(["snapshot", "closed"]);
    mounted.destroy();
  });

  it("applies the configured terminal theme and can update it later", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const initialTheme = {
      background: "#111111",
      foreground: "#eeeeee"
    };
    const nextTheme = {
      background: "#f7f3eb",
      foreground: "#1e2524"
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      terminalTheme: initialTheme,
      onClosed: vi.fn()
    });

    expect(terminalTestState.terminals[0]?.options).toMatchObject({
      theme: initialTheme
    });

    mounted.setTheme(nextTheme);

    expect(terminalTestState.terminals[0]?.instance.options.theme).toBe(nextTheme);

    mounted.destroy();
  });

  it("applies the configured font size and can update it later", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      fontSize: 16,
      onClosed: vi.fn()
    });

    expect(terminalTestState.terminals[0]?.options).toMatchObject({
      fontSize: 16
    });

    mounted.setFontSize(18);

    expect(terminalTestState.terminals[0]?.instance.options.fontSize).toBe(18);

    mounted.destroy();
  });

  it("applies configured typography and can update it later", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      fontFamily: "Menlo, monospace",
      lineHeight: 1.2,
      onClosed: vi.fn()
    });

    expect(terminalTestState.terminals[0]?.options).toMatchObject({
      fontFamily: "Menlo, monospace",
      lineHeight: 1.2
    });

    mounted.setFontFamily("JetBrains Mono, monospace");
    mounted.setLineHeight(1.5);

    expect(terminalTestState.terminals[0]?.instance.options.fontFamily).toBe(
      "JetBrains Mono, monospace"
    );
    expect(terminalTestState.terminals[0]?.instance.options.lineHeight).toBe(1.5);

    mounted.destroy();
  });

  it("exposes clear and redraw controls for page recovery", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();
    terminalTestState.fitAddons[0]?.fit.mockClear();

    mounted.clear();
    mounted.redraw();

    expect(terminalTestState.terminals[0]?.instance.clear).toHaveBeenCalledOnce();
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "clear-history" })
    );
    expect(terminalTestState.fitAddons[0]?.fit).toHaveBeenCalledOnce();
    expect(terminalTestState.terminals[0]?.instance.clearTextureAtlas).toHaveBeenCalled();
    expect(terminalTestState.terminals[0]?.instance.refresh).toHaveBeenCalledWith(
      0,
      39
    );
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "resize", cols: 120, rows: 40 })
    );

    mounted.destroy();
  });

  it("clears the terminal and tmux history with Ctrl+K", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    const terminal = terminalTestState.terminals[0]?.instance;
    socket.send.mockClear();

    const handled = terminal?.customKeyEventHandler?.(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
    );

    expect(handled).toBe(false);
    expect(terminal?.clear).toHaveBeenCalledOnce();
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "clear-history" })
    );
    expect(socket.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: "input", data: "\x0b" })
    );

    mounted.destroy();
  });

  it("sends raw terminal control sequences through the mounted terminal API", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();

    mounted.sendInput("\x03");
    mounted.sendInput("\t");

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input", data: "\x03" })
    );
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input", data: "\t" })
    );

    mounted.destroy();
  });

  it("does not forward terminal device attribute responses from xterm back to the PTY", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    const terminal = terminalTestState.terminals[0]?.instance;
    const handleData = terminal?.onData.mock.calls[0]?.[0] as
      | ((data: string) => void)
      | undefined;
    socket.send.mockClear();

    handleData?.("\x1b[?1;2c");
    handleData?.("\x1b[>0;276;0c");
    handleData?.("typed\x1b[?1;2c\r");
    handleData?.("\x1b[99;5u");

    expect(socket.send).toHaveBeenCalledTimes(2);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input", data: "typed\r" })
    );
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input", data: "\x03" })
    );

    mounted.destroy();
  });

  it("refits when the terminal frame size changes after layout updates", () => {
    let scheduledCallback: FrameRequestCallback | null = null;
    let resizeCallback: ResizeObserverCallback | null = null;
    const resizeObservers: Array<{
      observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (callback: FrameRequestCallback) => {
        scheduledCallback = callback;

        return 1;
      }
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();

        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
          resizeObservers.push(this);
        }
      }
    );
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();
    terminalTestState.fitAddons[0]?.fit.mockClear();

    resizeCallback?.([], resizeObservers[0] as ResizeObserver);

    expect(terminalTestState.fitAddons[0]?.fit).not.toHaveBeenCalled();

    scheduledCallback?.(performance.now());

    expect(resizeObservers[0]?.observe).toHaveBeenCalledWith(container);
    expect(terminalTestState.fitAddons[0]?.fit).toHaveBeenCalledOnce();
    expect(terminalTestState.terminals[0]?.instance.clearTextureAtlas).toHaveBeenCalled();
    expect(terminalTestState.terminals[0]?.instance.refresh).toHaveBeenCalledWith(
      0,
      39
    );
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "resize", cols: 120, rows: 40 })
    );

    mounted.destroy();

    expect(resizeObservers[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it("uploads pasted images and inserts the saved path without submitting", async () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          absolutePath: "/Users/gouki/.tmux-ui/uploads/build/paste.png"
        })
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "paste.png", {
      type: "image/png"
    });
    const event = new Event("paste", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => file
          }
        ]
      },
      configurable: true
    });

    container.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(event.defaultPrevented).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/uploads/image", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "X-Tmux-Session": "build"
      },
      body: file
    });
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "input",
        data: "/Users/gouki/.tmux-ui/uploads/build/paste.png"
      })
    );

    mounted.destroy();
  });

  it("uploads selected mobile images and inserts the saved path", async () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          absolutePath: "/Users/gouki/.tmux-ui/uploads/build/mobile.png"
        })
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();

    const imageInput = container.querySelector<HTMLInputElement>(
      "input[data-terminal-image-input='library']"
    )!;
    const cameraInput = container.querySelector<HTMLInputElement>(
      "input[data-terminal-image-input='camera']"
    )!;
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "mobile.png", {
      type: "image/png"
    });

    expect(imageInput).not.toBeNull();
    expect(imageInput.accept).toBe("image/*");
    expect(cameraInput.accept).toBe("image/*");
    expect(cameraInput.getAttribute("capture")).toBe("environment");

    Object.defineProperty(imageInput, "files", {
      value: { 0: file, length: 1, item: () => file },
      configurable: true
    });
    imageInput.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetch).toHaveBeenCalledWith("/api/uploads/image", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "X-Tmux-Session": "build"
      },
      body: file
    });
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "input",
        data: "/Users/gouki/.tmux-ui/uploads/build/mobile.png"
      })
    );

    mounted.destroy();

    expect(
      container.querySelector("input[data-terminal-image-input='library']")
    ).toBeNull();
  });

  it("uploads dropped image files even when the browser omits the MIME type", async () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          absolutePath: "/Users/gouki/.tmux-ui/uploads/build/drop.png"
        })
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "drop.png", {
      type: ""
    });
    const dragOverEvent = new Event("dragover", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(dragOverEvent, "dataTransfer", {
      value: {
        dropEffect: "none",
        items: [],
        files: { 0: file, length: 1, item: () => file }
      },
      configurable: true
    });

    container.dispatchEvent(dragOverEvent);

    const dropEvent = new Event("drop", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        items: [],
        files: { 0: file, length: 1, item: () => file }
      },
      configurable: true
    });

    container.dispatchEvent(dropEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dragOverEvent.defaultPrevented).toBe(true);
    expect(dropEvent.defaultPrevented).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/uploads/image", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Tmux-Session": "build"
      },
      body: file
    });
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "input",
        data: "/Users/gouki/.tmux-ui/uploads/build/drop.png"
      })
    );

    mounted.destroy();
  });

  it("uploads dropped web image urls and prevents browser navigation", async () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          absolutePath: "/Users/gouki/.tmux-ui/uploads/build/web-drop.png"
        })
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();

    const dataTransfer = {
      dropEffect: "none",
      items: [
        {
          kind: "string",
          type: "text/uri-list",
          getAsString: (callback: (value: string) => void) =>
            callback("https://img.example.test/web-drop.png")
        }
      ],
      files: { length: 0, item: () => null },
      types: ["text/uri-list"]
    };
    const dragOverEvent = new Event("dragover", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(dragOverEvent, "dataTransfer", {
      value: dataTransfer,
      configurable: true
    });

    container.dispatchEvent(dragOverEvent);

    const dropEvent = new Event("drop", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: dataTransfer,
      configurable: true
    });

    container.dispatchEvent(dropEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dragOverEvent.defaultPrevented).toBe(true);
    expect((dragOverEvent as DragEvent).dataTransfer?.dropEffect).toBe("copy");
    expect(dropEvent.defaultPrevented).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/uploads/image-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tmux-Session": "build"
      },
      body: JSON.stringify({
        url: "https://img.example.test/web-drop.png"
      })
    });
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "input",
        data: "/Users/gouki/.tmux-ui/uploads/build/web-drop.png"
      })
    );

    mounted.destroy();
  });

  it("allows dragover when the browser hides file details until drop", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });

    const dragOverEvent = new Event("dragover", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(dragOverEvent, "dataTransfer", {
      value: {
        dropEffect: "none",
        items: [{ kind: "file", type: "", getAsFile: () => null }],
        files: { length: 0, item: () => null }
      },
      configurable: true
    });

    container.dispatchEvent(dragOverEvent);

    expect(dragOverEvent.defaultPrevented).toBe(true);
    expect((dragOverEvent as DragEvent).dataTransfer?.dropEffect).toBe("copy");

    mounted.destroy();
  });

  it("accepts image drops on the whole terminal panel, including status controls", async () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          absolutePath: "/Users/gouki/.tmux-ui/uploads/build/panel-drop.png"
        })
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const panel = document.createElement("div");
    const mounted = createTerminalTab({
      container,
      rendererStatusElement: panel,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "panel-drop.png", {
      type: ""
    });
    const dropEvent = new Event("drop", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        items: [],
        files: { 0: file, length: 1, item: () => file }
      },
      configurable: true
    });

    panel.dispatchEvent(dropEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dropEvent.defaultPrevented).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/uploads/image", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Tmux-Session": "build"
      },
      body: file
    });
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "input",
        data: "/Users/gouki/.tmux-ui/uploads/build/panel-drop.png"
      })
    );

    mounted.destroy();
  });

  it("keeps redraw from throwing when the terminal renderer is no longer usable", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });

    terminalTestState.fitShouldThrow = true;

    expect(() => mounted.redraw()).not.toThrow();
    expect(socket.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: "resize", cols: 120, rows: 40 })
    );

    terminalTestState.fitShouldThrow = false;
    mounted.destroy();
  });

  it("reconnects the terminal websocket on demand", () => {
    let scheduledCallback: FrameRequestCallback | null = null;
    const sockets: Array<{
      send: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
    }> = [];

    vi.stubGlobal(
      "WebSocket",
      class {
        send = vi.fn();
        close = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();

        constructor() {
          sockets.push(this);
        }
      }
    );

    const onConnectionStateChange = vi.fn();
    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn(),
      onConnectionStateChange
    });
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        scheduledCallback = callback;

        return 1;
      });

    expect(sockets).toHaveLength(1);

    mounted.reconnect();
    scheduledCallback?.(performance.now());

    expect(sockets).toHaveLength(2);
    expect(sockets[0]?.close).toHaveBeenCalledOnce();
    expect(onConnectionStateChange).toHaveBeenCalledWith("reconnecting");
    expect(terminalTestState.terminals[0]?.instance.write).not.toHaveBeenCalledWith(
      expect.stringContaining("[reconnecting]"),
      expect.any(Function)
    );

    mounted.destroy();
    requestAnimationFrame.mockRestore();

    expect(sockets[1]?.close).toHaveBeenCalledOnce();
  });

  it("automatically reconnects after an unexpected terminal websocket close", () => {
    vi.useFakeTimers();
    let scheduledCallback: FrameRequestCallback | null = null;
    const sockets: Array<{
      send: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
      listeners: Map<string, (event?: Event) => void>;
    }> = [];

    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (callback: FrameRequestCallback) => {
        scheduledCallback = callback;

        return 1;
      }
    );
    vi.stubGlobal(
      "WebSocket",
      class {
        send = vi.fn();
        close = vi.fn();
        listeners = new Map<string, (event?: Event) => void>();
        addEventListener = vi.fn(
          (type: string, listener: (event?: Event) => void) => {
            this.listeners.set(type, listener);
          }
        );
        removeEventListener = vi.fn(
          (type: string, listener: (event?: Event) => void) => {
            if (this.listeners.get(type) === listener) {
              this.listeners.delete(type);
            }
          }
        );

        constructor() {
          sockets.push(this);
        }
      }
    );

    const onConnectionStateChange = vi.fn();
    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn(),
      onConnectionStateChange
    });

    expect(sockets).toHaveLength(1);

    sockets[0]?.listeners.get("close")?.(new Event("close"));

    expect(sockets).toHaveLength(1);

    vi.advanceTimersByTime(2_000);
    scheduledCallback?.(performance.now());

    expect(sockets).toHaveLength(2);
    expect(sockets[1]?.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "attach",
        tabId: "tab-1",
        sessionName: "build",
        cols: 120,
        rows: 40
      })
    );
    expect(onConnectionStateChange).toHaveBeenCalledWith("disconnected");
    expect(onConnectionStateChange).toHaveBeenCalledWith("reconnecting");
    expect(terminalTestState.terminals[0]?.instance.write).not.toHaveBeenCalledWith(
      expect.stringContaining("[disconnected]"),
      expect.any(Function)
    );
    expect(terminalTestState.terminals[0]?.instance.write).not.toHaveBeenCalledWith(
      expect.stringContaining("[reconnecting]"),
      expect.any(Function)
    );

    mounted.destroy();
    vi.useRealTimers();
  });

  it("loads the WebGL renderer addon when it is available", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );
    const container = document.createElement("div");

    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });

    expect(container.dataset.renderer).toBe("webgl");
    expect(terminalTestState.webglAddons).toHaveLength(1);
    expect(terminalTestState.terminals[0]?.instance.loadAddon).toHaveBeenNthCalledWith(
      3,
      terminalTestState.webglAddons[0]
    );

    mounted.destroy();

    expect(terminalTestState.webglAddons[0]?.dispose).toHaveBeenCalledOnce();
  });

  it("keeps the DOM renderer when WebGL cannot be created", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    terminalTestState.webglConstructShouldThrow = true;

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );
    const container = document.createElement("div");

    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });

    expect(container.dataset.renderer).toBe("dom");
    expect(terminalTestState.webglAddons).toHaveLength(0);
    expect(terminalTestState.terminals[0]?.instance.loadAddon).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      "WebGL terminal renderer unavailable; using DOM renderer.",
      expect.any(Error)
    );

    mounted.destroy();
  });

  it("loads safe clickable web links for terminal output", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );
    const container = document.createElement("div");

    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    const clickEvent = new MouseEvent("click", { cancelable: true });
    const preventDefault = vi.spyOn(clickEvent, "preventDefault");

    expect(terminalTestState.webLinksAddons).toHaveLength(1);

    terminalTestState.webLinksAddons[0]?.handler?.(
      clickEvent,
      "example.com/docs"
    );
    terminalTestState.webLinksAddons[0]?.handler?.(
      clickEvent,
      "file:///etc/passwd"
    );

    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(
      "https://example.com/docs",
      "_blank",
      "noopener,noreferrer"
    );

    mounted.destroy();
  });

  it("falls back to the DOM renderer after WebGL context loss", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );
    const container = document.createElement("div");

    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    const webglAddon = terminalTestState.webglAddons[0];

    expect(container.dataset.renderer).toBe("webgl");

    webglAddon?.contextLossListener?.();

    expect(container.dataset.renderer).toBe("dom");
    expect(webglAddon?.contextLossRegistrationDispose).toHaveBeenCalledOnce();
    expect(webglAddon?.dispose).toHaveBeenCalledOnce();

    mounted.destroy();

    expect(webglAddon?.dispose).toHaveBeenCalledOnce();
  });

  it("keeps the DOM renderer when WebGL loading fails", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    terminalTestState.webglLoadShouldThrow = true;

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );
    const container = document.createElement("div");

    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });

    expect(container.dataset.renderer).toBe("dom");
    expect(terminalTestState.webglAddons).toHaveLength(1);
    expect(terminalTestState.webglAddons[0]?.dispose).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "WebGL terminal renderer unavailable; using DOM renderer.",
      expect.any(Error)
    );

    mounted.destroy();
  });

  it("pastes a newline on Shift+Enter when the terminal app supports bracketed paste", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    const terminal = terminalTestState.terminals[0]?.instance;
    terminal!.modes.bracketedPasteMode = true;
    socket.send.mockClear();

    const handled = terminal?.customKeyEventHandler?.({
      type: "keydown",
      key: "Enter",
      shiftKey: true
    } as KeyboardEvent);
    const followUpKeypressHandled = terminal?.customKeyEventHandler?.({
      type: "keypress",
      key: "Enter",
      shiftKey: true
    } as KeyboardEvent);

    expect(handled).toBe(false);
    expect(followUpKeypressHandled).toBe(false);
    expect(terminal?.paste).toHaveBeenCalledWith("\n");
    expect(terminal?.paste).toHaveBeenCalledOnce();
    expect(socket.send).not.toHaveBeenCalled();

    mounted.destroy();
  });

  it("falls back to a CSI-u Shift+Enter sequence when bracketed paste is not enabled", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();

    const handled = terminalTestState.terminals[0]?.instance.customKeyEventHandler?.({
      type: "keydown",
      key: "Enter",
      shiftKey: true
    } as KeyboardEvent);
    const followUpKeypressHandled =
      terminalTestState.terminals[0]?.instance.customKeyEventHandler?.({
        type: "keypress",
        key: "Enter",
        shiftKey: true
      } as KeyboardEvent);

    expect(handled).toBe(false);
    expect(followUpKeypressHandled).toBe(false);
    expect(socket.send).toHaveBeenCalledOnce();
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input", data: "\x1b[13;2u" })
    );

    mounted.destroy();
  });

  it("sends a plain Ctrl-C byte instead of a CSI-u sequence", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();

    const handled = terminalTestState.terminals[0]?.instance.customKeyEventHandler?.({
      type: "keydown",
      key: "c",
      ctrlKey: true
    } as KeyboardEvent);

    expect(handled).toBe(false);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input", data: "\x03" })
    );
  });

  it("does not intercept IME composition key events", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();

    const handled = terminalTestState.terminals[0]?.instance.customKeyEventHandler?.({
      type: "keydown",
      key: "Enter",
      shiftKey: true,
      isComposing: true
    } as KeyboardEvent);

    expect(handled).toBe(true);
    expect(socket.send).not.toHaveBeenCalled();

    mounted.destroy();
  });

  it("exposes an imperative focus method for restoring mobile keyboard input", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    const terminal = terminalTestState.terminals[0]?.instance;
    terminal?.focus.mockClear();

    mounted.focus();

    expect(terminal?.focus).toHaveBeenCalledOnce();

    mounted.destroy();
  });

  it("routes plain wheel gestures to tmux history before xterm can treat them as input", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const target = document.createElement("div");
    const bubbleListener = vi.fn();
    container.append(target);
    container.addEventListener("wheel", bubbleListener);

    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 48
    });

    target.dispatchEvent(wheelEvent);

    expect(bubbleListener).not.toHaveBeenCalled();
    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "scroll", lines: 1 })
    );
    expect(
      terminalTestState.terminals[0]?.instance.scrollLines
    ).not.toHaveBeenCalled();

    mounted.destroy();
  });

  it("can let browser scrolling handle wheel gestures on demand", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const panel = document.createElement("div");
    const target = document.createElement("div");
    const bubbleListener = vi.fn();
    container.append(target);
    container.addEventListener("wheel", bubbleListener);

    const mounted = createTerminalTab({
      container,
      rendererStatusElement: panel,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });

    expect(mounted.isBrowserScrollEnabled()).toBe(false);
    expect(panel.dataset.scrollMode).toBe("tmux");

    expect(mounted.toggleBrowserScroll()).toBe(true);
    expect(mounted.isBrowserScrollEnabled()).toBe(true);
    expect(panel.classList.contains("is-browser-scroll")).toBe(true);
    expect(panel.dataset.scrollMode).toBe("browser");

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 48
    });

    target.dispatchEvent(wheelEvent);

    expect(bubbleListener).toHaveBeenCalledOnce();
    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(socket.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: "scroll", lines: 1 })
    );

    expect(mounted.toggleBrowserScroll()).toBe(false);

    const tmuxWheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 48
    });

    target.dispatchEvent(tmuxWheelEvent);

    expect(tmuxWheelEvent.defaultPrevented).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "scroll", lines: 1 })
    );

    mounted.destroy();
  });

  it("maps touch drag gestures to tmux history scroll on tablets", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const target = document.createElement("div");
    const bubbleListener = vi.fn();
    container.append(target);
    container.addEventListener("touchmove", bubbleListener);

    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });

    target.dispatchEvent(createTouchGestureEvent("touchstart", 152));
    const moveEvent = createTouchGestureEvent("touchmove", 200);
    target.dispatchEvent(moveEvent);

    expect(bubbleListener).not.toHaveBeenCalled();
    expect(moveEvent.defaultPrevented).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "scroll", lines: -4 })
    );

    mounted.destroy();
  });

  it("focuses the terminal after a mobile tap", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    const terminal = terminalTestState.terminals[0]?.instance;
    terminal?.focus.mockClear();

    container.dispatchEvent(createTouchGestureEvent("touchstart", 160));
    container.dispatchEvent(createTouchGestureEvent("touchend", 160));

    expect(terminal?.focus).toHaveBeenCalledOnce();

    mounted.destroy();
  });

  it("does not focus the terminal after a mobile history scroll gesture", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    const terminal = terminalTestState.terminals[0]?.instance;
    terminal?.focus.mockClear();

    container.dispatchEvent(createTouchGestureEvent("touchstart", 160));
    container.dispatchEvent(createTouchGestureEvent("touchmove", 220));
    container.dispatchEvent(createTouchGestureEvent("touchend", 220));

    expect(terminal?.focus).not.toHaveBeenCalled();

    mounted.destroy();
  });

  it("lets browser scroll handle touch gestures in browser scroll mode", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const target = document.createElement("div");
    const bubbleListener = vi.fn();
    container.append(target);
    container.addEventListener("touchmove", bubbleListener);

    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });

    mounted.toggleBrowserScroll();
    target.dispatchEvent(createTouchGestureEvent("touchstart", 152));
    const moveEvent = createTouchGestureEvent("touchmove", 200);
    target.dispatchEvent(moveEvent);

    expect(bubbleListener).toHaveBeenCalledOnce();
    expect(moveEvent.defaultPrevented).toBe(false);
    expect(socket.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: "scroll", lines: -4 })
    );

    mounted.destroy();
  });

  it("maps pointer drag gestures to tmux history scroll on iPad browsers", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const target = document.createElement("div");
    const bubbleListener = vi.fn();
    container.append(target);
    container.addEventListener("pointermove", bubbleListener);

    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });

    target.dispatchEvent(createPointerGestureEvent("pointerdown", 160));
    const moveEvent = createPointerGestureEvent("pointermove", 220);
    target.dispatchEvent(moveEvent);

    expect(bubbleListener).not.toHaveBeenCalled();
    expect(moveEvent.defaultPrevented).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "scroll", lines: -5 })
    );

    mounted.destroy();
  });

  it("focuses the terminal after a mouse click on the pane", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    const terminal = terminalTestState.terminals[0]?.instance;
    terminal?.focus.mockClear();

    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 120,
      clientY: 160
    });
    const mouseUp = new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 121,
      clientY: 160
    });

    container.dispatchEvent(mouseDown);
    container.dispatchEvent(mouseUp);

    expect(terminal?.focus).toHaveBeenCalledOnce();

    mounted.destroy();
  });

  it("notifies the caller after a mouse click so the tmux pane can be selected", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    Object.defineProperty(container, "getBoundingClientRect", {
      value: vi.fn(() => ({
        left: 100,
        top: 20,
        width: 800,
        height: 400
      })),
      configurable: true
    });
    const onPaneClick = vi.fn();
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn(),
      onPaneClick
    });

    container.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 620,
        clientY: 140
      })
    );
    container.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 620,
        clientY: 140
      })
    );

    expect(onPaneClick).toHaveBeenCalledWith({
      clientX: 620,
      clientY: 140,
      rect: {
        left: 100,
        top: 20,
        width: 800,
        height: 400
      },
      cols: 120,
      rows: 40
    });

    mounted.destroy();
  });

  it("does not refocus the terminal while dragging to select text", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    const terminal = terminalTestState.terminals[0]?.instance;
    terminal?.focus.mockClear();

    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
      detail: 1
    });
    const mouseMove = new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX: 140,
      clientY: 100
    });
    const mouseUp = new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      clientX: 140,
      clientY: 100
    });

    container.dispatchEvent(mouseDown);
    container.dispatchEvent(mouseMove);
    container.dispatchEvent(mouseUp);

    expect(terminal?.focus).not.toHaveBeenCalled();

    mounted.destroy();
  });

  it("does not notify pane selection while dragging to select text", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const onPaneClick = vi.fn();
    const container = document.createElement("div");
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn(),
      onPaneClick
    });

    container.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 100
      })
    );
    container.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: 140,
        clientY: 100
      })
    );
    container.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 140,
        clientY: 100
      })
    );

    expect(onPaneClick).not.toHaveBeenCalled();

    mounted.destroy();
  });

  it("copies multiline text from the starting pane without including neighboring panes", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 240,
        right: 800,
        bottom: 240,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }),
      configurable: true
    });
    const clipboardText = vi.fn();
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn(),
      getPaneSummaries: () => [
        createTerminalPane({
          paneId: "%1",
          paneIndex: 0,
          paneActive: false,
          paneLeft: 0,
          paneWidth: 40
        }),
        createTerminalPane({
          paneId: "%2",
          paneIndex: 1,
          paneActive: true,
          paneLeft: 40,
          paneWidth: 40
        })
      ]
    });

    const terminal = terminalTestState.terminals[0]?.instance;
    const leftText = "L".repeat(40);
    const rightRows = [
      "0123456789abcdefghijklmnopqrstuvwxyz....",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789....",
      "right-pane-last-row-content.............."
    ];
    terminal!.buffer.active.baseY = 99;
    terminal!.buffer.active.viewportY = 10;
    terminal!.buffer.active.length = 13;
    terminal!.cols = 80;
    terminal!.rows = 24;
    terminal!.buffer.active.getLine.mockImplementation((index: number) => {
      const line = `${leftText}${rightRows[index - 10] ?? ""}`;

      return {
        translateToString: vi.fn(
          (_trimRight?: boolean, startColumn?: number, endColumn?: number) =>
            line.slice(startColumn ?? 0, endColumn ?? line.length)
        )
      };
    });

    container.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 460,
        clientY: 5
      })
    );
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 500,
        clientY: 15
      })
    );
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 580,
        clientY: 15
      })
    );

    const selectionOverlay = container.querySelector(
      ".terminal-pane-selection-overlay"
    );

    expect(selectionOverlay).not.toBeNull();
    expect(selectionOverlay?.parentElement?.classList.contains("xterm")).toBe(
      true
    );
    expect(selectionOverlay?.querySelectorAll(".terminal-pane-selection-line"))
      .toHaveLength(2);

    document.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 580,
        clientY: 15
      })
    );

    const copyEvent = new Event("copy", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(copyEvent, "clipboardData", {
      value: {
        setData: clipboardText
      },
      configurable: true
    });

    container.dispatchEvent(copyEvent);

    expect(clipboardText).toHaveBeenCalledWith(
      "text/plain",
      [
        rightRows[0].slice(6),
        rightRows[1].slice(0, 18)
      ].join("\n")
    );
    expect(copyEvent.defaultPrevented).toBe(true);
    expect(terminal?.clearSelection).not.toHaveBeenCalled();

    mounted.destroy();
  });

  it("maps pane selection drags against the xterm viewport rect", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 50,
        width: 800,
        height: 340,
        right: 800,
        bottom: 390,
        x: 0,
        y: 50,
        toJSON: () => ({})
      }),
      configurable: true
    });
    const mounted = createTerminalTab({
      container,
      tabId: "tab-viewport-rect",
      sessionName: "build",
      onClosed: vi.fn(),
      getPaneSummaries: () => [
        createTerminalPane({
          paneId: "%1",
          paneIndex: 0,
          paneActive: false,
          paneLeft: 0,
          paneWidth: 40
        }),
        createTerminalPane({
          paneId: "%2",
          paneIndex: 1,
          paneActive: true,
          paneLeft: 40,
          paneWidth: 40
        })
      ]
    });

    const terminal = terminalTestState.terminals[0]?.instance;
    terminal!.cols = 80;
    terminal!.rows = 40;
    const terminalElement = container.querySelector<HTMLElement>(".xterm");
    Object.defineProperty(terminalElement, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 50,
        width: 800,
        height: 240,
        right: 800,
        bottom: 290,
        x: 0,
        y: 50,
        toJSON: () => ({})
      }),
      configurable: true
    });

    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 460,
      clientY: 55
    });
    container.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);

    const mouseMove = new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 580,
      clientY: 65
    });
    container.dispatchEvent(mouseMove);
    expect(mouseMove.defaultPrevented).toBe(true);
    container.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 580,
        clientY: 65
      })
    );

    expect(container.querySelectorAll(".terminal-pane-selection-line"))
      .toHaveLength(3);

    mounted.destroy();
  });

  it("clears a multi-line selection that starts and ends in one pane but covers another pane", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn(),
      getPaneSummaries: () => [
        {
          sessionName: "build",
          paneId: "%1",
          windowIndex: 0,
          windowName: "main",
          windowActive: true,
          paneIndex: 0,
          paneActive: false,
          currentCommand: "zsh",
          runtimeKind: "shell",
          currentPath: "/tmp/project",
          paneDead: false,
          paneDeadStatus: null,
          panePid: 100,
          paneLeft: 0,
          paneTop: 0,
          paneWidth: 40,
          paneHeight: 24
        },
        {
          sessionName: "build",
          paneId: "%2",
          windowIndex: 0,
          windowName: "main",
          windowActive: true,
          paneIndex: 1,
          paneActive: true,
          currentCommand: "zsh",
          runtimeKind: "shell",
          currentPath: "/tmp/project",
          paneDead: false,
          paneDeadStatus: null,
          panePid: 101,
          paneLeft: 40,
          paneTop: 0,
          paneWidth: 40,
          paneHeight: 24
        }
      ]
    });

    const terminal = terminalTestState.terminals[0]?.instance;
    terminal!.buffer.active.viewportY = 0;
    terminal?.getSelectionPosition.mockReturnValue({
      start: { x: 50, y: 5 },
      end: { x: 60, y: 7 }
    });

    terminal?.selectionChangeHandler?.();

    expect(terminal?.clearSelection).toHaveBeenCalledOnce();

    mounted.destroy();
  });

  it("does not intercept browser copy when there is only one pane", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 240,
        right: 800,
        bottom: 240,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }),
      configurable: true
    });
    const clipboardText = vi.fn();
    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn(),
      getPaneSummaries: () => [
        createTerminalPane({
          paneId: "%1",
          paneIndex: 0,
          paneActive: true,
          paneLeft: 0,
          paneWidth: 80
        })
      ]
    });

    const terminal = terminalTestState.terminals[0]?.instance;
    terminal!.cols = 80;
    terminal!.rows = 24;

    container.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 120,
        clientY: 5
      })
    );
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 280,
        clientY: 15
      })
    );

    const copyEvent = new Event("copy", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(copyEvent, "clipboardData", {
      value: {
        setData: clipboardText
      },
      configurable: true
    });

    container.dispatchEvent(copyEvent);

    expect(clipboardText).not.toHaveBeenCalled();
    expect(copyEvent.defaultPrevented).toBe(false);
    expect(container.querySelector(".terminal-pane-selection-overlay")).toBeNull();

    mounted.destroy();
  });

  it("does not clear an existing selection when the drag leaves the starting pane", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn(),
      getPaneSummaries: () => [
        {
          sessionName: "build",
          paneId: "%1",
          windowIndex: 0,
          windowName: "main",
          windowActive: true,
          paneIndex: 0,
          paneActive: true,
          currentCommand: "zsh",
          runtimeKind: "shell",
          currentPath: "/tmp/project",
          paneDead: false,
          paneDeadStatus: null,
          panePid: 100,
          paneLeft: 0,
          paneTop: 0,
          paneWidth: 40,
          paneHeight: 24
        },
        {
          sessionName: "build",
          paneId: "%2",
          windowIndex: 0,
          windowName: "main",
          windowActive: true,
          paneIndex: 1,
          paneActive: false,
          currentCommand: "zsh",
          runtimeKind: "shell",
          currentPath: "/tmp/project",
          paneDead: false,
          paneDeadStatus: null,
          panePid: 101,
          paneLeft: 40,
          paneTop: 0,
          paneWidth: 40,
          paneHeight: 24
        }
      ]
    });

    const terminal = terminalTestState.terminals[0]?.instance;
    terminal?.clearSelection.mockClear();

    const container = document.createElement("div");
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 240,
        right: 800,
        bottom: 240,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }),
      configurable: true
    });

    terminal?.getSelectionPosition.mockReturnValue({
      start: { x: 10, y: 5 },
      end: { x: 30, y: 5 }
    });
    terminal!.buffer.active.viewportY = 0;

    terminal?.selectionChangeHandler?.();
    expect(terminal?.clearSelection).not.toHaveBeenCalled();

    container.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 610,
        clientY: 100
      })
    );
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 200,
        clientY: 100
      })
    );

    expect(terminal?.clearSelection).not.toHaveBeenCalled();

    mounted.destroy();
  });

  it("exposes page-sized tmux history scrolling for mobile controls", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();

    mounted.scrollPage("back");
    mounted.scrollPage("forward");

    expect(socket.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ type: "scroll", lines: -40 })
    );
    expect(socket.send).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ type: "scroll", lines: 40 })
    );

    mounted.destroy();
  });

  it("uses Option+wheel to page through tmux pane history", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const container = document.createElement("div");
    const target = document.createElement("div");
    const bubbleListener = vi.fn();
    container.append(target);
    container.addEventListener("wheel", bubbleListener);

    const mounted = createTerminalTab({
      container,
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -2,
      deltaMode: 1,
      altKey: true
    });

    target.dispatchEvent(wheelEvent);

    expect(bubbleListener).not.toHaveBeenCalled();
    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "scroll", lines: -40 })
    );
    expect(
      terminalTestState.terminals[0]?.instance.scrollLines
    ).not.toHaveBeenCalled();

    mounted.destroy();
  });

  it("maps PageUp and PageDown to tmux pane history navigation", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          return socket;
        }
      }
    );

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
    });
    socket.send.mockClear();

    const pageUpHandled = terminalTestState.terminals[0]?.instance.customKeyEventHandler?.({
      type: "keydown",
      key: "PageUp"
    } as KeyboardEvent);
    const pageDownHandled = terminalTestState.terminals[0]?.instance.customKeyEventHandler?.({
      type: "keydown",
      key: "PageDown"
    } as KeyboardEvent);

    expect(pageUpHandled).toBe(false);
    expect(pageDownHandled).toBe(false);
    expect(socket.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ type: "scroll", lines: -40 })
    );
    expect(socket.send).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ type: "scroll", lines: 40 })
    );
    expect(
      terminalTestState.terminals[0]?.instance.scrollLines
    ).not.toHaveBeenCalled();

    mounted.destroy();
  });
});
