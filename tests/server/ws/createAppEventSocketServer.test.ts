import { describe, expect, it } from "vitest";

import { createAppEventHub } from "../../../src/server/services/events/createAppEventHub";
import { createAppEventSocketServer } from "../../../src/server/ws/createAppEventSocketServer";

describe("createAppEventSocketServer", () => {
  it("sends hello and forwards published app events", () => {
    const eventHub = createAppEventHub();
    const server = createAppEventSocketServer({ eventHub });
    const socket = server.testOnly.open();

    const event = eventHub.publish({
      type: "sessions-invalidated",
      reason: "pane-split",
      sessionName: "build"
    });

    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: "hello" },
      event
    ]);
  });

  it("stops forwarding events after the socket closes", () => {
    const eventHub = createAppEventHub();
    const server = createAppEventSocketServer({ eventHub });
    const socket = server.testOnly.open();

    socket.close();
    eventHub.publish({
      type: "sessions-invalidated",
      reason: "session-killed",
      sessionName: "build"
    });

    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: "hello" }
    ]);
  });

  it("disables websocket compression for lightweight event frames", () => {
    const eventHub = createAppEventHub();
    const server = createAppEventSocketServer({ eventHub });

    expect(server.testOnly.options).toMatchObject({
      path: "/ws/events",
      perMessageDeflate: false
    });
  });
});
