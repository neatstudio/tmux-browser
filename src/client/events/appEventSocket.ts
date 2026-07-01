import type {
  AppEvent,
  AppEventSocketMessage
} from "../../shared/appEvents";

type WebSocketLikeCtor = new (url: string) => WebSocket;

type LocationLike = Pick<Location, "protocol" | "host">;

function getAppEventSocketUrl(location: LocationLike) {
  const protocol = location.protocol === "https:" ? "wss" : "ws";

  return `${protocol}://${location.host}/ws/events`;
}

function isAppEvent(message: AppEventSocketMessage): message is AppEvent {
  return message.type !== "hello";
}

export function createAppEventSocket(options: {
  WebSocketCtor?: WebSocketLikeCtor;
  location?: LocationLike;
  reconnectMs?: number;
  onReconnect?: () => void;
  onEvent: (event: AppEvent) => void;
}) {
  const WebSocketCtor = options.WebSocketCtor ?? WebSocket;
  const locationLike = options.location ?? window.location;
  const reconnectMs = options.reconnectMs ?? 2_000;
  let socket: WebSocket | null = null;
  let enabled = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let connectionToken = 0;
  let isReconnectAttempt = false;
  let hasOpened = false;

  function clearReconnectTimer() {
    if (reconnectTimer === null) {
      return;
    }

    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function connect() {
    enabled = true;
    clearReconnectTimer();

    const currentToken = (connectionToken += 1);
    socket?.close();
    const currentSocket = new WebSocketCtor(getAppEventSocketUrl(locationLike));
    socket = currentSocket;

    currentSocket.addEventListener("open", () => {
      if (currentToken !== connectionToken) {
        return;
      }

      if (!isReconnectAttempt) {
        hasOpened = true;
        return;
      }

      isReconnectAttempt = false;
      hasOpened = true;
      options.onReconnect?.();
    });

    currentSocket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      let message: AppEventSocketMessage;

      try {
        message = JSON.parse(event.data) as AppEventSocketMessage;
      } catch {
        return;
      }

      if (isAppEvent(message)) {
        options.onEvent(message);
      }
    });

    currentSocket.addEventListener("close", () => {
      if (!enabled || currentToken !== connectionToken) {
        return;
      }

      isReconnectAttempt = hasOpened;
      reconnectTimer = setTimeout(connect, reconnectMs);
    });
  }

  function close() {
    enabled = false;
    connectionToken += 1;
    isReconnectAttempt = false;
    hasOpened = false;
    clearReconnectTimer();
    socket?.close();
    socket = null;
  }

  return {
    connect,
    close
  };
}
