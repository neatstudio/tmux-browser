import { describe, expect, it, vi } from "vitest";

import { createBridgeRegistry } from "../../../src/server/services/terminal/bridgeRegistry";
import { createTerminalSocketServer } from "../../../src/server/ws/createTerminalSocketServer";

describe("createTerminalSocketServer", () => {
  it("kills only the attach client when the socket closes", () => {
    let killCount = 0;
    const pty = {
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: () => {
        killCount += 1;
      }
    };
    const createBridge = vi.fn().mockReturnValue(pty);

    const server = createTerminalSocketServer({
      createBridge,
      registry: createBridgeRegistry()
    });

    const socket = server.testOnly.open({
      type: "attach",
      tabId: "tab-1",
      sessionName: "build",
      cols: 80,
      rows: 24
    });

    expect(createBridge).toHaveBeenCalledTimes(1);
    expect(server.registry.countForSession("build")).toBe(1);

    socket.close();

    expect(killCount).toBe(1);
  });
});
