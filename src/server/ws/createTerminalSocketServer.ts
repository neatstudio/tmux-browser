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
} {
  const messageHandlers: Array<(payload: string) => void> = [];
  const closeHandlers: Array<() => void> = [];

  return {
    send() {
      return undefined;
    },
    close() {
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
      cleanedUp: false
    };

    connections.set(socket, connection);
    registry.attach(
      { tabId: message.tabId, sessionName: message.sessionName },
      socket
    );

    bridge.onData((data: string) => {
      socket.send(serialize({ type: "output", data }));
    });

    bridge.onExit(() => {
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

        connection.bridge.resize(message.cols, message.rows);
      } catch (error) {
        socket.send(
          serialize({
            type: "error",
            message: error instanceof Error ? error.message : "Invalid message"
          })
        );
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
