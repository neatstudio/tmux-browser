// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createTerminalTabController } from "../../../src/client/terminal/createTerminalTab";

describe("createTerminalTabController", () => {
  it("closes the browser tab when the server reports session exit", () => {
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn()
    };
    const onClosed = vi.fn();

    const controller = createTerminalTabController({
      socket,
      onClosed,
      onOutput: vi.fn()
    });

    controller.handleMessage({ type: "session-exit" });

    expect(onClosed).toHaveBeenCalled();
  });
});
