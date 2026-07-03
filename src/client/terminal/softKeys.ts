export type SoftKey = {
  id: string;
  label: string;
  title: string;
  sequence: string;
};

export const MOBILE_SOFT_KEYS: SoftKey[] = [
  { id: "esc", label: "Esc", title: "Send Escape", sequence: "\x1b" },
  { id: "tab", label: "Tab", title: "Send Tab", sequence: "\t" },
  { id: "ctrl-c", label: "^C", title: "Send Ctrl-C", sequence: "\x03" },
  { id: "ctrl-d", label: "^D", title: "Send Ctrl-D", sequence: "\x04" },
  { id: "ctrl-l", label: "^L", title: "Send Ctrl-L", sequence: "\x0c" },
  { id: "ctrl-r", label: "^R", title: "Send Ctrl-R", sequence: "\x12" },
  { id: "ctrl-a", label: "^A", title: "Send Ctrl-A", sequence: "\x01" },
  { id: "ctrl-e", label: "^E", title: "Send Ctrl-E", sequence: "\x05" },
  { id: "alt-b", label: "M-B", title: "Send Alt-B", sequence: "\x1bb" },
  { id: "alt-f", label: "M-F", title: "Send Alt-F", sequence: "\x1bf" }
];
