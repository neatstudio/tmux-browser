import { describe, expect, it } from "vitest";

import { classifySessionRuntime } from "../../../../src/server/services/groupMessages/classifySessionRuntime";

describe("classifySessionRuntime", () => {
  it("classifies agent, shell, and unknown foreground commands", () => {
    expect(classifySessionRuntime("codex")).toEqual({
      command: "codex",
      kind: "agent"
    });
    expect(classifySessionRuntime("/opt/homebrew/bin/claude")).toEqual({
      command: "claude",
      kind: "agent"
    });
    expect(classifySessionRuntime("zsh")).toEqual({
      command: "zsh",
      kind: "shell"
    });
    expect(classifySessionRuntime("node")).toEqual({
      command: "node",
      kind: "unknown"
    });
    expect(classifySessionRuntime(null)).toEqual({
      command: null,
      kind: "unknown"
    });
  });
});
