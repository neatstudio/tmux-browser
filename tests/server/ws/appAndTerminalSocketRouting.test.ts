import { createServer } from "node:http";
import { AddressInfo } from "node:net";

import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";

import { createAppEventHub } from "../../../src/server/services/events/createAppEventHub";
import { createAppEventSocketServer } from "../../../src/server/ws/createAppEventSocketServer";
import { createTerminalSocketServer } from "../../../src/server/ws/createTerminalSocketServer";

describe("app and terminal websocket routing", () => {
  const servers: Array<ReturnType<typeof createServer>> = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          })
      )
    );
    servers.length = 0;
  });

  it("keeps /ws/events isolated when terminal websocket is also attached", async () => {
    const eventHub = createAppEventHub();
    const appEvents = createAppEventSocketServer({ eventHub });
    const terminal = createTerminalSocketServer();
    const server = createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });
    servers.push(server);
    appEvents.attachToServer(server);
    terminal.attachToServer(server);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/events`, {
      perMessageDeflate: false
    });
    const messages: unknown[] = [];

    socket.on("message", (payload) => {
      messages.push(JSON.parse(payload.toString()));
    });

    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });

    eventHub.publish({
      type: "sessions-invalidated",
      reason: "session-created",
      sessionName: "build"
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    socket.close();

    expect(messages).toEqual([
      { type: "hello" },
      expect.objectContaining({
        type: "sessions-invalidated",
        reason: "session-created",
        sessionName: "build"
      })
    ]);
  });
});
