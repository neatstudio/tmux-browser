export type SoftKey = {
  id: string;
  label: string;
  title: string;
  sequence: string;
};

export const MOBILE_SOFT_KEYS: SoftKey[] = [
  { id: "esc", label: "Esc", title: "Send Escape", sequence: "\x1b" },
  { id: "tab", label: "Tab", title: "Send Tab", sequence: "\t" },
  { id: "ctrl-c", label: "Ctrl-C", title: "Send Ctrl-C", sequence: "\x03" },
  { id: "ctrl-d", label: "Ctrl-D", title: "Send Ctrl-D", sequence: "\x04" },
  { id: "ctrl-l", label: "Ctrl-L", title: "Send Ctrl-L", sequence: "\x0c" },
  { id: "ctrl-r", label: "Ctrl-R", title: "Send Ctrl-R", sequence: "\x12" },
  { id: "ctrl-a", label: "Ctrl-A", title: "Send Ctrl-A", sequence: "\x01" },
  { id: "ctrl-e", label: "Ctrl-E", title: "Send Ctrl-E", sequence: "\x05" },
  { id: "alt-b", label: "Alt-B", title: "Send Alt-B", sequence: "\x1bb" },
  { id: "alt-f", label: "Alt-F", title: "Send Alt-F", sequence: "\x1bf" },
  { id: "up", label: "↑", title: "Send Arrow Up", sequence: "\x1b[A" },
  { id: "down", label: "↓", title: "Send Arrow Down", sequence: "\x1b[B" },
  { id: "left", label: "←", title: "Send Arrow Left", sequence: "\x1b[D" },
  { id: "right", label: "→", title: "Send Arrow Right", sequence: "\x1b[C" },
  { id: "page-up", label: "PgUp", title: "Send Page Up", sequence: "\x1b[5~" },
  { id: "page-down", label: "PgDn", title: "Send Page Down", sequence: "\x1b[6~" }
];
