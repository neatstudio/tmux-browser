export type AttachMessage = {
  type: "attach";
  tabId: string;
  sessionName: string;
  cols: number;
  rows: number;
};

export type InputMessage = {
  type: "input";
  data: string;
};

export type ResizeMessage = {
  type: "resize";
  cols: number;
  rows: number;
};

export type ScrollMessage = {
  type: "scroll";
  lines: number;
};

export type ClientMessage =
  | AttachMessage
  | InputMessage
  | ResizeMessage
  | ScrollMessage;

export type OutputMessage = {
  type: "output";
  data: string;
};

export type SessionExitMessage = {
  type: "session-exit";
};

export type ErrorMessage = {
  type: "error";
  message: string;
};

export type ServerMessage = OutputMessage | SessionExitMessage | ErrorMessage;
