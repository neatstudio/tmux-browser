import { describe, expect, it } from "vitest";

import { createTmuxCommandEnv } from "../../../../src/server/services/tmux/runTmuxCommand";

describe("createTmuxCommandEnv", () => {
  it("keeps tmux format control separators stable under service managers", () => {
    const env = createTmuxCommandEnv({
      PATH: "/opt/homebrew/bin:/usr/bin:/bin"
    });

    expect(env.PATH).toBe("/opt/homebrew/bin:/usr/bin:/bin");
    expect(env.LANG).toBe("en_US.UTF-8");
    expect(env.LC_CTYPE).toBe("UTF-8");
  });

  it("preserves an existing locale", () => {
    const env = createTmuxCommandEnv({
      LANG: "zh_CN.UTF-8",
      LC_CTYPE: "zh_CN.UTF-8"
    });

    expect(env.LANG).toBe("zh_CN.UTF-8");
    expect(env.LC_CTYPE).toBe("zh_CN.UTF-8");
  });
});
