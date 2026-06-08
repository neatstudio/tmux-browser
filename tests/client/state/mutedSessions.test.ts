import { describe, expect, it, vi } from "vitest";

import { createMutedSessionsStore } from "../../../src/client/state/mutedSessions";

function createMemoryStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key) {
      return items.get(key) ?? null;
    },
    key(index) {
      return [...items.keys()][index] ?? null;
    },
    removeItem(key) {
      items.delete(key);
    },
    setItem(key, value) {
      items.set(key, value);
    }
  };
}

describe("createMutedSessionsStore", () => {
  it("mutes the tmux-ui service session by default", () => {
    const store = createMutedSessionsStore(createMemoryStorage());

    expect(store.getMutedSessionNames()).toEqual(["tmux-ui"]);
    expect(store.isMuted("tmux-ui")).toBe(true);
  });

  it("persists manual mute toggles and allows unmuting defaults", () => {
    const storage = createMemoryStorage();
    const store = createMutedSessionsStore(storage);

    store.toggleMuted("tmux-ui");
    store.toggleMuted("logs");

    const restored = createMutedSessionsStore(storage);

    expect(restored.getMutedSessionNames()).toEqual(["logs"]);
    expect(restored.isMuted("tmux-ui")).toBe(false);
  });

  it("renames muted session preferences", () => {
    const storage = createMemoryStorage();
    const store = createMutedSessionsStore(storage);

    store.toggleMuted("worker");
    store.renameSession("worker", "worker-v2");

    expect(createMutedSessionsStore(storage).getMutedSessionNames()).toEqual([
      "tmux-ui",
      "worker-v2"
    ]);
  });

  it("loads and toggles muted sessions through server preferences", async () => {
    const api = {
      getPreferences: vi.fn().mockResolvedValue({
        pinnedSessionNames: [],
        mutedSessionNames: ["logs"],
        sessionSettings: {}
      }),
      setMutedSession: vi.fn().mockResolvedValue(undefined)
    };
    const store = createMutedSessionsStore(createMemoryStorage(), api);

    await store.load();

    expect(store.getMutedSessionNames()).toEqual(["logs"]);

    await store.toggleMuted("worker");

    expect(api.setMutedSession).toHaveBeenCalledWith("worker", true);
    expect(store.getMutedSessionNames()).toEqual(["logs", "worker"]);
  });
});
