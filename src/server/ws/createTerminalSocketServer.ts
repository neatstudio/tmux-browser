import type { Server as HttpServer } from "node:http";

import { WebSocketServer, type RawData, type WebSocket } from "ws";

import type {
  AttachMessage,
  ClientMessage,
  ServerMessage
} from "../../shared/protocol.js";
import {
  createTerminalBridge,
  type CreateTerminalBridge,
  type TerminalBridge
} from "../services/terminal/createTerminalBridge.js";
import { createBridgeRegistry } from "../services/terminal/bridgeRegistry.js";

type Registry = ReturnType<typeof createBridgeRegistry>;

type MessageSocket = {
  send: (payload: string) => void;
  close: () => void;
  onMessage: (handler: (payload: string) => void) => void;
  onClose: (handler: () => void) => void;
};

const OUTPUT_BATCH_MS = 8;

function serialize(message: ServerMessage): string {
  return JSON.stringify(message);
}

function parseMessage(payload: string): ClientMessage {
  return JSON.parse(payload) as ClientMessage;
}

function adaptWebSocket(socket: WebSocket): MessageSocket {
  return {
    send(payload) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    },
    close() {
      socket.close();
    },
    onMessage(handler) {
      socket.on("message", (payload: RawData) => {
        handler(payload.toString());
      });
    },
    onClose(handler) {
      socket.on("close", handler);
    }
  };
}

function createTestSocket(): MessageSocket & {
  receive: (message: ClientMessage) => void;
  sent: string[];
  closeCount: number;
} {
  const messageHandlers: Array<(payload: string) => void> = [];
  const closeHandlers: Array<() => void> = [];
  const sent: string[] = [];
  let closeCount = 0;

  return {
    send(payload) {
      sent.push(payload);
    },
    close() {
      closeCount += 1;
      closeHandlers.forEach((handler) => handler());
    },
    onMessage(handler) {
      messageHandlers.push(handler);
    },
    onClose(handler) {
      closeHandlers.push(handler);
    },
    receive(message) {
      const payload = JSON.stringify(message);
      messageHandlers.forEach((handler) => handler(payload));
    },
    sent,
    get closeCount() {
      return closeCount;
    }
  };
}

function createSocketOutputBuffer(socket: MessageSocket) {
  let pendingOutput = "";
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  function clearPendingTimer() {
    if (pendingTimer === null) {
      return;
    }

    clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  function flush() {
    clearPendingTimer();

    if (!pendingOutput) {
      return;
    }

    const output = pendingOutput;
    pendingOutput = "";
    socket.send(serialize({ type: "output", data: output }));
  }

  return {
    enqueue(data: string) {
      pendingOutput += data;

      if (pendingTimer !== null) {
        return;
      }

      pendingTimer = setTimeout(flush, OUTPUT_BATCH_MS);
      pendingTimer.unref?.();
    },
    flush,
    cancel() {
      clearPendingTimer();
      pendingOutput = "";
    }
  };
}

export function createTerminalSocketServer(deps: {
  createBridge?: CreateTerminalBridge;
  registry?: Registry;
} = {}) {
  const registry = deps.registry ?? createBridgeRegistry();
  const buildBridge = deps.createBridge ?? createTerminalBridge;

  const connections = new Map<
    MessageSocket,
    {
      tabId: string | null;
      sessionName: string | null;
      bridge: TerminalBridge | null;
      outputBuffer: ReturnType<typeof createSocketOutputBuffer> | null;
      cleanedUp: boolean;
    }
  >();

  function cleanup(socket: MessageSocket) {
    const connection = connections.get(socket);

    if (!connection || connection.cleanedUp) {
      return;
    }

    connection.cleanedUp = true;

    if (connection.tabId) {
      registry.detach(connection.tabId);
    }

    connection.outputBuffer?.cancel();
    connection.outputBuffer = null;

    if (connection.bridge) {
      connection.bridge.kill();
      connection.bridge = null;
    }
  }

  function attach(socket: MessageSocket, message: AttachMessage) {
    cleanup(socket);

    const bridge = buildBridge({
      sessionName: message.sessionName,
      cols: message.cols,
      rows: message.rows
    });

    const connection = {
      tabId: message.tabId,
      sessionName: message.sessionName,
      bridge,
      outputBuffer: createSocketOutputBuffer(socket),
      cleanedUp: false
    };

    connections.set(socket, connection);
    registry.attach(
      { tabId: message.tabId, sessionName: message.sessionName },
      socket
    );

    bridge.onData((data: string) => {
      connection.outputBuffer?.enqueue(data);
    });

    bridge.onExit(() => {
      connection.outputBuffer?.flush();
      socket.send(serialize({ type: "session-exit" }));
      cleanup(socket);
      socket.close();
    });
  }

  function bindSocket(socket: MessageSocket) {
    connections.set(socket, {
      tabId: null,
      sessionName: null,
      bridge: null,
      outputBuffer: null,
      cleanedUp: false
    });

    socket.onMessage((payload) => {
      try {
        const message = parseMessage(payload);
        const connection = connections.get(socket);

        if (!connection) {
          return;
        }

        if (message.type === "attach") {
          attach(socket, message);
          return;
        }

        if (!connection.bridge) {
          socket.send(
            serialize({
              type: "error",
              message: "Terminal not attached"
            })
          );
          return;
        }

        if (message.type === "input") {
          connection.bridge.write(message.data);
          return;
        }

        if (message.type === "scroll") {
          connection.bridge.scroll(message.lines);
          return;
        }

        connection.bridge.resize(message.cols, message.rows);
      } catch (error) {
        socket.send(
          serialize({
            type: "error",
            message: error instanceof Error ? error.message : "Invalid message"
          })
        );

        socket.close();
      }
    });

    socket.onClose(() => {
      cleanup(socket);
      connections.delete(socket);
    });
  }

  return {
    registry,
    attachToServer(server: HttpServer) {
      const wss = new WebSocketServer({ server, path: "/ws/terminal" });
      wss.on("connection", (socket: WebSocket) => {
        bindSocket(adaptWebSocket(socket));
      });
      return wss;
    },
    notifySessionExit(sessionName: string) {
      registry.getSocketsForSession(sessionName).forEach((socket) => {
        socket.send(serialize({ type: "session-exit" }));
        socket.close();
      });
    },
    testOnly: {
      open(message: AttachMessage) {
        const socket = createTestSocket();
        bindSocket(socket);
        socket.receive(message);
        return socket;
      }
    }
  };
}
