// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const terminalTestState = vi.hoisted(() => {
  const terminals: Array<{
    options: Record<string, unknown>;
    instance: {
      options: Record<string, unknown>;
      loadAddon: ReturnType<typeof vi.fn>;
      open: ReturnType<typeof vi.fn>;
      onData: ReturnType<typeof vi.fn>;
      attachCustomKeyEventHandler: ReturnType<typeof vi.fn>;
      scrollLines: ReturnType<typeof vi.fn>;
      write: ReturnType<typeof vi.fn>;
      paste: ReturnType<typeof vi.fn>;
      clear: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
      modes: {
        bracketedPasteMode: boolean;
      };
      customKeyEventHandler?: (event: KeyboardEvent) => boolean;
    };
  }> = [];
  const fitAddons: Array<{
    fit: ReturnType<typeof vi.fn>;
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
    webglAddons,
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
    dispose = vi.fn();
    modes = {
      bracketedPasteMode: false
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
    fit = vi.fn();

    constructor() {
      terminalTestState.fitAddons.push(this);
    }
  }
}));

import {
  createTerminalTab,
  createTerminalOutputBuffer,
  createTerminalTabController
} from "../../../src/client/terminal/createTerminalTab";
import { createTabState } from "../../../src/client/state/tabState";

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
});

describe("createTerminalTab", () => {
  beforeEach(() => {
    terminalTestState.terminals.length = 0;
    terminalTestState.fitAddons.length = 0;
    terminalTestState.webglAddons.length = 0;
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

    mounted.clear();
    mounted.redraw();

    expect(terminalTestState.terminals[0]?.instance.clear).toHaveBeenCalledOnce();
    expect(terminalTestState.fitAddons[0]?.fit).toHaveBeenCalledTimes(2);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "resize", cols: 120, rows: 40 })
    );

    mounted.destroy();
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
      2,
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
    expect(terminalTestState.terminals[0]?.instance.loadAddon).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "WebGL terminal renderer unavailable; using DOM renderer.",
      expect.any(Error)
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
