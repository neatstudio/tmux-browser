import { describe, expect, it, vi } from "vitest";

import { createSidebarFavoritesStore } from "../../../src/client/state/sidebarFavorites";

describe("createSidebarFavoritesStore", () => {
  it("loads and toggles server-backed sidebar favorites", async () => {
    const api = {
      getPreferences: vi.fn().mockResolvedValue({ pinnedSessionNames: ["build"] }),
      setPinnedSession: vi.fn().mockResolvedValue(undefined)
    };
    const store = createSidebarFavoritesStore(api);

    await store.load();

    expect(store.getPinnedSessionNames()).toEqual(["build"]);

    await store.togglePinned("logs");

    expect(api.setPinnedSession).toHaveBeenCalledWith("logs", true);
    expect(store.getPinnedSessionNames()).toEqual(["build", "logs"]);

    await store.togglePinned("build");

    expect(api.setPinnedSession).toHaveBeenCalledWith("build", false);
    expect(store.getPinnedSessionNames()).toEqual(["logs"]);
  });

  it("keeps the app usable when favorites cannot be loaded", async () => {
    const store = createSidebarFavoritesStore({
      getPreferences: vi.fn().mockRejectedValue(new Error("offline")),
      setPinnedSession: vi.fn().mockResolvedValue(undefined)
    });

    await expect(store.load()).resolves.toBeUndefined();

    expect(store.getPinnedSessionNames()).toEqual([]);
  });
});
