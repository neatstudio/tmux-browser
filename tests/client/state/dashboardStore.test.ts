import { describe, expect, it, vi } from "vitest";

import { createDashboardStore } from "../../../src/client/state/dashboardStore";

describe("createDashboardStore", () => {
  it("loads sessions from the api and exposes them to the renderer", async () => {
    const api = {
      listSessions: vi.fn().mockResolvedValue([{ name: "build", windows: 2 }])
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh();

    expect(store.getState().sessions).toEqual([{ name: "build", windows: 2 }]);
  });
});
