import { describe, expect, it } from "vitest";

import { createBridgeRegistry } from "../../../../src/server/services/terminal/bridgeRegistry";

describe("createBridgeRegistry", () => {
  it("tracks attachments by tab id and session name", () => {
    const registry = createBridgeRegistry();

    registry.attach({ tabId: "tab-1", sessionName: "build" });

    expect(registry.countForSession("build")).toBe(1);
  });
});
