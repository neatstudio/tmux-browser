import type { Server as HttpServer } from "node:http";

import type { WebSocket } from "ws";

import type {
  AppEvent,
  AppEventSocketMessage
} from "../../shared/appEvents.js";
import type { AppEventHub } from "../services/events/createAppEventHub.js";
import { registerWebSocketRoute } from "./webSocketRouter.js";
import { createSocketBackpressure } from "./socketBackpressure.js";

const APP_EVENT_SOCKET_OPTIONS = {
  path: "/ws/events",
  perMessageDeflate: false
} as const;

type EventSocket = {
  readonly bufferedAmount: number;
  send: (payload: string) => void;
  close: (code?: number, reason?: string) => void;
  onClose: (handler: () => void) => void;
};

function serialize(message: AppEventSocketMessage) {
  return JSON.stringify(message);
}

function adaptWebSocket(socket: WebSocket): EventSocket {
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
    onClose(handler) {
      socket.on("close", handler);
    }
  };
}

function createTestSocket(): EventSocket & {
  sent: string[];
  closeCount: number;
  setBufferedAmount: (bytes: number) => void;
} {
  const closeHandlers: Array<() => void> = [];
  const sent: string[] = [];
  let closeCount = 0;
  let bufferedAmount = 0;

  return {
    get bufferedAmount() {
      return bufferedAmount;
    },
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
    setBufferedAmount(bytes) {
      bufferedAmount = bytes;
    },
    get closeCount() {
      return closeCount;
    }
  };
}

export function createAppEventSocketServer(deps: {
  eventHub: AppEventHub;
  serializeEvent?: (event: AppEvent) => string;
}) {
  const sockets = new Map<
    EventSocket,
    ReturnType<typeof createSocketBackpressure>
  >();
  const serializeEvent = deps.serializeEvent ?? serialize;
  deps.eventHub.subscribe((event: AppEvent) => {
    const payload = serializeEvent(event);
    sockets.forEach((delivery) => delivery.enqueue(payload));
  });

  function bindSocket(socket: EventSocket) {
    const delivery = createSocketBackpressure(socket);
    sockets.set(socket, delivery);
    delivery.enqueue(serialize({ type: "hello" }));
    socket.onClose(() => {
      delivery.cancel();
      sockets.delete(socket);
    });
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
