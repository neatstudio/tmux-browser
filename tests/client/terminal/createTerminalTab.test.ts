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
      scrollLines: ReturnType<typeof vi.fn>;
      write: ReturnType<typeof vi.fn>;
      paste: ReturnType<typeof vi.fn>;
      clear: ReturnType<typeof vi.fn>;
      refresh: ReturnType<typeof vi.fn>;
      clearTextureAtlas: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
      modes: {
        bracketedPasteMode: boolean;
      };
      buffer: {
        active: {
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
    open = vi.fn();
    onData = vi.fn();
    attachCustomKeyEventHandler = vi.fn(
      (handler: (event: KeyboardEvent) => boolean) => {
        this.customKeyEventHandler = handler;
      }
    );
    scrollLines = vi.fn();
    write = vi.fn();
    paste = vi.fn();
    clear = vi.fn();
    refresh = vi.fn();
    clearTextureAtlas = vi.fn();
    dispose = vi.fn();
    modes = {
      bracketedPasteMode: false
    };
    visibleLines = ["", "", ""];
    buffer = {
      active: {
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
  createTerminalTabController
} from "../../../src/client/terminal/createTerminalTab";
import { createTabState } from "../../../src/client/state/tabState";

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

    createTerminalTabController({
      socket,
      onClosed,
      onOutput
    });

    listeners.get("close")?.(new Event("close"));

    expect(onClosed).not.toHaveBeenCalled();
    expect(onOutput).toHaveBeenCalledWith("\r\n[disconnected]\r\n");
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

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
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
    terminal!.rows = 3;
    terminal!.buffer.active.baseY = 0;
    terminal!.visibleLines = [
      "Old stale prompt: continue? [y/a/n]",
      "Status line",
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
      "Old stale prompt: continue? [y/a/n]\nStatus line\nDo you want to continue? [y/a/n]"
    );

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

    const mounted = createTerminalTab({
      container: document.createElement("div"),
      tabId: "tab-1",
      sessionName: "build",
      onClosed: vi.fn()
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
    expect(terminalTestState.terminals[0]?.instance.write).toHaveBeenCalledWith(
      "\r\n[reconnecting]\r\n",
      expect.any(Function)
    );

    mounted.destroy();
    requestAnimationFrame.mockRestore();

    expect(sockets[1]?.close).toHaveBeenCalledOnce();
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
