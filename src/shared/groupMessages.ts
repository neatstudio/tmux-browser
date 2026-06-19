export type GroupMessageKind = "task" | "report";

export type GroupMessageStatus =
  | "pending"
  | "partial"
  | "replied"
  | "stale"
  | "failed";

export type GroupReplyStatus = "done" | "blocked" | "need-input" | "ack";

export type GroupMessageTarget =
  | { type: "session"; sessionName: string }
  | { type: "others" }
  | { type: "role"; role: string };

export type GroupMessageDeliveryStatus = "pending" | "sent" | "failed";

export type GroupMessageDelivery = {
  sessionName: string;
  status: GroupMessageDeliveryStatus;
  mode?: "agent-input" | "shell-print";
  error?: string;
};

export type GroupMessageReply = {
  messageId: string;
  fromSession: string;
  status: GroupReplyStatus;
  body: string;
  capturedAt: string;
};

export type ParsedGroupMessageReply = Omit<GroupMessageReply, "capturedAt">;

export type GroupMessage = {
  id: string;
  projectName: string;
  fromSession: string;
  toSessions: string[];
  kind: GroupMessageKind;
  status: GroupMessageStatus;
  body: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  deliveries: GroupMessageDelivery[];
  replies: GroupMessageReply[];
  warnings: string[];
};

export type CreateGroupMessageRequest = {
  fromSession: string;
  kind: GroupMessageKind;
  target: GroupMessageTarget;
  body: string;
};
