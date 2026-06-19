import type {
  GroupMessage,
  GroupMessageDeliveryStatus,
  GroupMessageKind,
  GroupMessageReply,
  GroupMessageStatus
} from "../../../shared/groupMessages.js";

export type CreateGroupMessageStoreOptions = {
  now?: () => Date;
};

export type CreateGroupMessageInput = {
  projectName: string;
  fromSession: string;
  toSessions: string[];
  kind: GroupMessageKind;
  body: string;
  warnings: string[];
};

export type DeliveryResult = {
  status: Exclude<GroupMessageDeliveryStatus, "pending">;
  mode?: "agent-input" | "shell-print";
  error?: string;
};

function createMessageId(now: Date, sequence: number) {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");

  return `gm-${stamp}-${String(sequence).padStart(4, "0")}`;
}

function getReplyDedupeKey(reply: GroupMessageReply) {
  return `${reply.messageId}\u0000${reply.fromSession}\u0000${reply.body}`;
}

function cloneMessage(message: GroupMessage): GroupMessage {
  return {
    ...message,
    toSessions: [...message.toSessions],
    deliveries: message.deliveries.map((delivery) => ({ ...delivery })),
    replies: message.replies.map((reply) => ({ ...reply })),
    warnings: [...message.warnings]
  };
}

function computeStatus(message: GroupMessage): GroupMessageStatus {
  const deliveredSessions = message.deliveries
    .filter((delivery) => delivery.status === "sent")
    .map((delivery) => delivery.sessionName);
  const failedCount = message.deliveries.filter(
    (delivery) => delivery.status === "failed"
  ).length;
  const pendingCount = message.deliveries.filter(
    (delivery) => delivery.status === "pending"
  ).length;

  if (deliveredSessions.length === 0 && failedCount > 0 && pendingCount === 0) {
    return "failed";
  }

  const repliedSessions = new Set(message.replies.map((reply) => reply.fromSession));

  if (
    deliveredSessions.length > 0 &&
    deliveredSessions.every((sessionName) => repliedSessions.has(sessionName))
  ) {
    return "replied";
  }

  if (failedCount > 0 || message.replies.length > 0) {
    return "partial";
  }

  return "pending";
}

export function createGroupMessageStore(options: CreateGroupMessageStoreOptions = {}) {
  const now = options.now ?? (() => new Date());
  const messages = new Map<string, GroupMessage>();
  let sequence = 0;

  function getExistingMessage(messageId: string) {
    const message = messages.get(messageId);

    if (!message) {
      throw new Error(`Group message ${messageId} not found`);
    }

    return message;
  }

  function touch(message: GroupMessage, date = now()) {
    message.updatedAt = date.toISOString();
    message.status = computeStatus(message);

    return cloneMessage(message);
  }

  return {
    createMessage(input: CreateGroupMessageInput) {
      const createdAt = now();
      const id = createMessageId(createdAt, ++sequence);
      const message: GroupMessage = {
        id,
        projectName: input.projectName,
        fromSession: input.fromSession,
        toSessions: [...input.toSessions],
        kind: input.kind,
        status: "pending",
        body: input.body.trim(),
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
        expiresAt: null,
        deliveries: input.toSessions.map((sessionName) => ({
          sessionName,
          status: "pending"
        })),
        replies: [],
        warnings: [...input.warnings]
      };

      messages.set(id, message);

      return cloneMessage(message);
    },
    listProjectMessages(projectName: string) {
      return [...messages.values()]
        .filter((message) => message.projectName === projectName)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(cloneMessage);
    },
    getMessage(projectName: string, messageId: string) {
      const message = messages.get(messageId);

      if (!message || message.projectName !== projectName) {
        return null;
      }

      return cloneMessage(message);
    },
    markDelivery(messageId: string, sessionName: string, result: DeliveryResult) {
      const message = getExistingMessage(messageId);
      const delivery = message.deliveries.find(
        (candidate) => candidate.sessionName === sessionName
      );

      if (!delivery) {
        throw new Error(`Delivery target ${sessionName} not found`);
      }

      delivery.status = result.status;

      if (result.mode) {
        delivery.mode = result.mode;
      } else {
        delete delivery.mode;
      }

      if (result.error) {
        delivery.error = result.error;
      } else {
        delete delivery.error;
      }

      return touch(message);
    },
    addReplies(messageId: string, replies: GroupMessageReply[]) {
      const message = getExistingMessage(messageId);
      const seen = new Set(message.replies.map(getReplyDedupeKey));

      for (const reply of replies) {
        if (reply.messageId !== message.id) {
          continue;
        }

        const key = getReplyDedupeKey(reply);

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        message.replies.push({ ...reply });
      }

      return touch(message);
    }
  };
}
