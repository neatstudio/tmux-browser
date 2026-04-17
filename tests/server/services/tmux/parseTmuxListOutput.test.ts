import { describe, expect, it } from "vitest";

import { parseTmuxListOutput } from "../../../../src/server/services/tmux/parseTmuxListOutput";

describe("parseTmuxListOutput", () => {
  it("parses tmux list output into dashboard rows", () => {
    const output = [
      "build: 2 windows (created Sat Apr 17 10:00:00 2026)",
      "ops: 1 windows (created Sat Apr 17 11:00:00 2026)"
    ].join("\n");

    expect(parseTmuxListOutput(output)).toEqual([
      { name: "build", windows: 2 },
      { name: "ops", windows: 1 }
    ]);
  });
});
