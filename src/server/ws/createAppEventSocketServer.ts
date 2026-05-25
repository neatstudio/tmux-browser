import type { Server as HttpServer } from "node:http";

import type { WebSocket } from "ws";

import type {
  AppEvent,
  AppEventSocketMessage
} from "../../shared/appEvents.js";
import type { AppEventHub } from "../services/events/createAppEventHub.js";
import { registerWebSocketRoute } from "./webSocketRouter.js";

const APP_EVENT_SOCKET_OPTIONS = {
  path: "/ws/events",
  perMessageDeflate: false
} as const;

type EventSocket = {
  send: (payload: string) => void;
  close: () => void;
  onClose: (handler: () => void) => void;
};

function serialize(message: AppEventSocketMessage) {
  return JSON.stringify(message);
}

function adaptWebSocket(socket: WebSocket): EventSocket {
  return {
    send(payload) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    },
    close() {
      socket.close();
    },
    onClose(handler) {
      socket.on("close", handler);
    }
  };
}

function createTestSocket(): EventSocket & {
  sent: string[];
  closeCount: number;
} {
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
    onClose(handler) {
      closeHandlers.push(handler);
    },
    sent,
    get closeCount() {
      return closeCount;
    }
  };
}

export function createAppEventSocketServer(deps: { eventHub: AppEventHub }) {
  function bindSocket(socket: EventSocket) {
    socket.send(serialize({ type: "hello" }));
    const unsubscribe = deps.eventHub.subscribe((event: AppEvent) => {
      socket.send(serialize(event));
    });

    socket.onClose(unsubscribe);
  }

  return {
    attachToServer(server: HttpServer) {
      return registerWebSocketRoute(
        server,
        APP_EVENT_SOCKET_OPTIONS.path,
        (socket: WebSocket) => {
          bindSocket(adaptWebSocket(socket));
        },
        {
          perMessageDeflate: APP_EVENT_SOCKET_OPTIONS.perMessageDeflate
        }
      );
    },
    testOnly: {
      options: APP_EVENT_SOCKET_OPTIONS,
      open() {
        const socket = createTestSocket();
        bindSocket(socket);
        return socket;
      }
    }
  };
}
