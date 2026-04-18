import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";

import type {
  AttachMessage,
  ServerMessage
} from "../../shared/protocol";

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
      deps.onClosed();
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
    destroy() {
      closedByApp = true;
      deps.socket.removeEventListener?.("message", handleSocketMessage);
      deps.socket.removeEventListener?.("close", handleSocketClose);
      deps.socket.close();
    }
  };
}

export function createTerminalTab(deps: {
  container: HTMLElement;
  tabId: string;
  sessionName: string;
  onClosed: () => void;
}) {
  const terminal = new Terminal({
    cursorBlink: true,
    convertEol: true
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(deps.container);
  fitAddon.fit();

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(
    `${protocol}://${window.location.host}/ws/terminal`
  );

  const controller = createTerminalTabController({
    socket,
    onOutput: (data) => terminal.write(data),
    onClosed: deps.onClosed
  });

  const attach = () => {
    fitAddon.fit();
    controller.attach({
      type: "attach",
      tabId: deps.tabId,
      sessionName: deps.sessionName,
      cols: terminal.cols,
      rows: terminal.rows
    });
  };

  const handleWindowResize = () => {
    fitAddon.fit();
    controller.resize(terminal.cols, terminal.rows);
  };

  socket.addEventListener("open", attach);
  window.addEventListener("resize", handleWindowResize);

  terminal.onData((data) => {
    controller.sendInput(data);
  });

  return {
    destroy() {
      window.removeEventListener("resize", handleWindowResize);
      controller.destroy();
      terminal.dispose();
    }
  };
}
