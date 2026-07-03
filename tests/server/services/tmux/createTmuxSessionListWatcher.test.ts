import { describe, expect, it, vi } from "vitest";

import { createAppEventHub } from "../../../../src/server/services/events/createAppEventHub";
import { createTmuxSessionListWatcher } from "../../../../src/server/services/tmux/createTmuxSessionListWatcher";

describe("createTmuxSessionListWatcher", () => {
  it("publishes an invalidation event when the tmux session list changes", async () => {
    const eventHub = createAppEventHub();
    const events: unknown[] = [];
    eventHub.subscribe((event) => events.push(event));
    const tmuxService = {
      listSessionNames: vi
        .fn()
        .mockResolvedValueOnce(["build", "logs"])
        .mockResolvedValueOnce(["build"])
    };
    const watcher = createTmuxSessionListWatcher({
      tmuxService: tmuxService as never,
      eventHub
    });

    await watcher.testOnly.pollOnce();
    await watcher.testOnly.pollOnce();

    expect(tmuxService.listSessionNames).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "sessions-invalidated",
      reason: "session-list-changed"
    });
  });
});
