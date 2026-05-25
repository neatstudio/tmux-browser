import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";

import { WebSocketServer, type WebSocket } from "ws";

type RouteState = {
  routes: Map<string, WebSocketServer>;
};

const serverRoutes = new WeakMap<HttpServer, RouteState>();

function getPathname(req: IncomingMessage) {
  try {
    return new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    return "/";
  }
}

function getRouteState(server: HttpServer) {
  const existing = serverRoutes.get(server);

  if (existing) {
    return existing;
  }

  const state: RouteState = {
    routes: new Map()
  };

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const wss = state.routes.get(getPathname(req));

    if (!wss) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  serverRoutes.set(server, state);

  return state;
}

export function registerWebSocketRoute(
  server: HttpServer,
  path: string,
  onConnection: (socket: WebSocket, req: IncomingMessage) => void,
  options: Omit<
    ConstructorParameters<typeof WebSocketServer>[0],
    "server" | "path" | "noServer"
  > = {}
) {
  const state = getRouteState(server);

  if (state.routes.has(path)) {
    throw new Error(`WebSocket route already registered: ${path}`);
  }

  const wss = new WebSocketServer({
    noServer: true,
    ...options
  });
  wss.on("connection", onConnection);
  state.routes.set(path, wss);

  return wss;
}
