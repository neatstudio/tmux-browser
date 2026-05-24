import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const mainSource = readFileSync(
  new URL("../../../src/client/main.ts", import.meta.url),
  "utf8"
);

describe("terminal bundle loading", () => {
  it("keeps xterm out of the dashboard/sidebar entry chunk", () => {
    expect(mainSource).not.toContain(
      'import { createTerminalTab } from "./terminal/createTerminalTab"'
    );
    expect(mainSource).toContain('import("./terminal/createTerminalTab")');
  });
});
