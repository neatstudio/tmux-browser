import { describe, expect, it } from "vitest";

import {
  MOBILE_EDITING_KEYS,
  MOBILE_SHIFT_CURSOR_KEYS,
  MOBILE_SOFT_KEYS
} from "../../../src/client/terminal/softKeys";

describe("mobile terminal soft keys", () => {
  it("defines common phone-unfriendly terminal keys with PTY sequences", () => {
    expect(
      Object.fromEntries(MOBILE_SOFT_KEYS.map((key) => [key.id, key.sequence]))
    ).toMatchObject({
      esc: "\x1b",
      tab: "\t",
      "shift-enter": "\x1b[13;2u",
      "ctrl-c": "\x03",
      "ctrl-d": "\x04",
      "ctrl-l": "\x0c",
      "ctrl-r": "\x12",
      "ctrl-a": "\x01",
      "ctrl-e": "\x05",
      left: "\x1b[D",
      up: "\x1b[A",
      down: "\x1b[B",
      right: "\x1b[C"
    });
    expect(MOBILE_SOFT_KEYS.map((key) => key.id)).not.toEqual(
      expect.arrayContaining([
        "page-up",
        "page-down",
        "alt-b",
        "alt-f",
        "shift-left",
        "shift-up",
        "shift-down",
        "shift-right"
      ])
    );
    expect(MOBILE_SOFT_KEYS.map((key) => key.label)).toEqual([
      "Esc",
      "Tab",
      "S↵",
      "^C",
      "^D",
      "^L",
      "^R",
      "^A",
      "^E",
      "←",
      "↑",
      "↓",
      "→"
    ]);
  });

  it("keeps Shift+arrow sequences available for the mobile Shift toggle", () => {
    expect(
      Object.fromEntries(MOBILE_SHIFT_CURSOR_KEYS.map((key) => [key.id, key.sequence]))
    ).toEqual({
      "shift-left": "\x1b[1;2D",
      "shift-up": "\x1b[1;2A",
      "shift-down": "\x1b[1;2B",
      "shift-right": "\x1b[1;2C"
    });
  });

  it("keeps only direct editing keys in the mobile editing key cluster", () => {
    expect(MOBILE_EDITING_KEYS.map((key) => key.id)).toEqual([
      "left",
      "up",
      "down",
      "right",
      "shift-enter"
    ]);
  });
});
