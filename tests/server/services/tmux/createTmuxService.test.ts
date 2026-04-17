import { describe, expect, it, vi } from "vitest";

import { createTmuxService } from "../../../../src/server/services/tmux/createTmuxService";

describe("createTmuxService", () => {
  it("creates a detached session with validated args", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const service = createTmuxService({ run });

    await service.createSession("build");

    expect(run).toHaveBeenCalledWith("new-session", ["-d", "-s", "build"]);
  });
});
