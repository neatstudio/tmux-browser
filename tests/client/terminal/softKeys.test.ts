import { describe, expect, it } from "vitest";

import { MOBILE_SOFT_KEYS } from "../../../src/client/terminal/softKeys";

describe("mobile terminal soft keys", () => {
  it("defines common phone-unfriendly terminal keys with PTY sequences", () => {
    expect(
      Object.fromEntries(MOBILE_SOFT_KEYS.map((key) => [key.id, key.sequence]))
    ).toMatchObject({
      esc: "\x1b",
      tab: "\t",
      "ctrl-c": "\x03",
      "ctrl-d": "\x04",
      "ctrl-l": "\x0c",
      up: "\x1b[A",
      down: "\x1b[B",
      left: "\x1b[D",
      right: "\x1b[C",
      "page-up": "\x1b[5~",
      "page-down": "\x1b[6~"
    });
  });
});
