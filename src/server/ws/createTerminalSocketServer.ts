import type { Server as HttpServer } from "node:http";

import type { RawData, WebSocket } from "ws";

import type {
  AttachMessage,
  ClientMessage,
  ServerMessage
} from "../../shared/protocol.js";
import {
  type CreateTerminalBridge,
  type TerminalBridge
} from "../services/terminal/createTerminalBridge.js";
import { defaultTerminalBridgeFactory } from "../services/terminal/createTerminalBridgeFactory.js";
import { createBridgeRegistry } from "../services/terminal/bridgeRegistry.js";
import { registerWebSocketRoute } from "./webSocketRouter.js";
import { createSocketBackpressure } from "./socketBackpressure.js";

type Registry = ReturnType<typeof createBridgeRegistry>;

type MessageSocket = {
  readonly bufferedAmount: number;
  send: (payload: string) => void;
  close: (code?: number, reason?: string) => void;
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
    get bufferedAmount() {
      return socket.bufferedAmount;
    },
    send(payload) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    },
    close(code, reason) {
      socket.close(code, reason);
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
  closeCalls: Array<{ code?: number; reason?: string }>;
  setBufferedAmount: (bytes: number) => void;
} {
  const messageHandlers: Array<(payload: string) => void> = [];
  const closeHandlers: Array<() => void> = [];
  const sent: string[] = [];
  let closeCount = 0;
  let bufferedAmount = 0;
  const closeCalls: Array<{ code?: number; reason?: string }> = [];

  return {
    get bufferedAmount() {
      return bufferedAmount;
    },
    send(payload) {
      sent.push(payload);
    },
    close(code, reason) {
      closeCount += 1;
      closeCalls.push({ code, reason });
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
    closeCalls,
    setBufferedAmount(bytes) {
      bufferedAmount = bytes;
    },
    get closeCount() {
      return closeCount;
    }
  };
}

function createSocketOutputBuffer(
  delivery: ReturnType<typeof createSocketBackpressure>
) {
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
    delivery.enqueue(serialize({ type: "output", data: output }));
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
  const buildBridge = deps.createBridge ?? defaultTerminalBridgeFactory;

  const connections = new Map<
    MessageSocket,
    {
      tabId: string | null;
      sessionName: string | null;
      bridge: TerminalBridge | null;
      outputBuffer: ReturnType<typeof createSocketOutputBuffer> | null;
      delivery: ReturnType<typeof createSocketBackpressure>;
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
    connection.delivery.cancel();

    if (connection.bridge) {
      connection.bridge.kill();
      connection.bridge = null;
    }
  }

  function attach(socket: MessageSocket, message: AttachMessage) {
    cleanup(socket);

    const connection = {
      tabId: message.tabId,
      sessionName: message.sessionName,
      bridge: null as TerminalBridge | null,
      outputBuffer: null as ReturnType<typeof createSocketOutputBuffer> | null,
      delivery: createSocketBackpressure(socket),
      cleanedUp: false
    };
    connections.set(socket, connection);

    const bridge = buildBridge({
      sessionName: message.sessionName,
      cols: message.cols,
      rows: message.rows
    });

    connection.bridge = bridge;
    connection.outputBuffer = createSocketOutputBuffer(connection.delivery);
    registry.attach(
      { tabId: message.tabId, sessionName: message.sessionName },
      socket
    );

    bridge.onData((data: string) => {
      connection.outputBuffer?.enqueue(data);
    });

    bridge.onExit(() => {
      connection.outputBuffer?.flush();
      connection.delivery.enqueue(serialize({ type: "session-exit" }));
      const flushed = connection.delivery.flushFinal();
      cleanup(socket);
      if (flushed) socket.close();
    });
  }

  function sendMessage(socket: MessageSocket, message: ServerMessage) {
    connections.get(socket)?.delivery.enqueue(serialize(message));
  }

  function bindSocket(socket: MessageSocket) {
    connections.set(socket, {
      tabId: null,
      sessionName: null,
      bridge: null,
      outputBuffer: null,
      delivery: createSocketBackpressure(socket),
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
          sendMessage(socket, {
            type: "error",
            message: "Terminal not attached"
          });
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

        if (message.type === "clear-history") {
          connection.bridge.clearHistory();
          return;
        }

        connection.bridge.resize(message.cols, message.rows);
      } catch (error) {
        sendMessage(socket, {
          type: "error",
          message: error instanceof Error ? error.message : "Invalid message"
        });

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
      return registerWebSocketRoute(server, "/ws/terminal", (socket: WebSocket) => {
        bindSocket(adaptWebSocket(socket));
      });
    },
    notifySessionExit(sessionName: string) {
      registry.getSocketsForSession(sessionName).forEach((socket) => {
        const messageSocket = socket as MessageSocket;
        const connection = connections.get(messageSocket);
        connection?.delivery.enqueue(serialize({ type: "session-exit" }));
        if (connection?.delivery.flushFinal()) messageSocket.close();
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
