import { SHIFT_ENTER_SEQUENCE } from "./keySequences";

export type SoftKey = {
  id: string;
  label: string;
  title: string;
  sequence: string;
};

export const MOBILE_CURSOR_KEYS: SoftKey[] = [
  { id: "left", label: "←", title: "Move cursor left", sequence: "\x1b[D" },
  { id: "up", label: "↑", title: "Move cursor or history up", sequence: "\x1b[A" },
  { id: "down", label: "↓", title: "Move cursor or history down", sequence: "\x1b[B" },
  { id: "right", label: "→", title: "Move cursor right", sequence: "\x1b[C" }
];

export const MOBILE_SHIFT_CURSOR_KEYS: SoftKey[] = [
  { id: "shift-left", label: "S←", title: "Send Shift+Left", sequence: "\x1b[1;2D" },
  { id: "shift-up", label: "S↑", title: "Send Shift+Up", sequence: "\x1b[1;2A" },
  { id: "shift-down", label: "S↓", title: "Send Shift+Down", sequence: "\x1b[1;2B" },
  { id: "shift-right", label: "S→", title: "Send Shift+Right", sequence: "\x1b[1;2C" }
];

export const MOBILE_SHIFT_ENTER_KEY: SoftKey = {
  id: "shift-enter",
  label: "S↵",
  title: "Send Shift+Enter newline",
  sequence: SHIFT_ENTER_SEQUENCE
};

export const MOBILE_EDITING_KEYS: SoftKey[] = [
  ...MOBILE_CURSOR_KEYS,
  ...MOBILE_SHIFT_CURSOR_KEYS,
  MOBILE_SHIFT_ENTER_KEY
];

export const MOBILE_SOFT_KEYS: SoftKey[] = [
  { id: "esc", label: "Esc", title: "Send Escape", sequence: "\x1b" },
  { id: "tab", label: "Tab", title: "Send Tab", sequence: "\t" },
  MOBILE_SHIFT_ENTER_KEY,
  { id: "ctrl-c", label: "^C", title: "Send Ctrl-C", sequence: "\x03" },
  { id: "ctrl-d", label: "^D", title: "Send Ctrl-D", sequence: "\x04" },
  { id: "ctrl-l", label: "^L", title: "Send Ctrl-L", sequence: "\x0c" },
  { id: "ctrl-r", label: "^R", title: "Send Ctrl-R", sequence: "\x12" },
  { id: "ctrl-a", label: "^A", title: "Send Ctrl-A", sequence: "\x01" },
  { id: "ctrl-e", label: "^E", title: "Send Ctrl-E", sequence: "\x05" },
  ...MOBILE_CURSOR_KEYS,
  ...MOBILE_SHIFT_CURSOR_KEYS
];
