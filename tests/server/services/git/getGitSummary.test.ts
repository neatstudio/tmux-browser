import { describe, expect, it, vi } from "vitest";

import { getGitSummary } from "../../../../src/server/services/git/getGitSummary";

describe("getGitSummary", () => {
  it("returns branch and dirty state for a git worktree", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce("main")
      .mockResolvedValueOnce(" M src/app.ts");

    await expect(getGitSummary("/repo", { run })).resolves.toEqual({
      branch: "main",
      dirty: true
    });
  });

  it("falls back to the short commit when branch name is unavailable", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("abc1234")
      .mockResolvedValueOnce("");

    await expect(getGitSummary("/repo", { run })).resolves.toEqual({
      branch: "abc1234",
      dirty: false
    });
  });

  it("returns null outside a git worktree", async () => {
    const run = vi.fn().mockRejectedValue(new Error("not a git repository"));

    await expect(getGitSummary("/tmp", { run })).resolves.toBeNull();
  });
});
