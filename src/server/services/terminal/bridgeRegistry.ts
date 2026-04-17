export type BridgeAttachment = {
  sessionName: string;
  socket: {
    send: (payload: string) => void;
    close: () => void;
  };
};

export function createBridgeRegistry() {
  const byTab = new Map<string, BridgeAttachment>();

  return {
    attach(
      record: {
        tabId: string;
        sessionName: string;
      },
      socket: BridgeAttachment["socket"] = {
        send: () => undefined,
        close: () => undefined
      }
    ) {
      byTab.set(record.tabId, {
        sessionName: record.sessionName,
        socket
      });
    },
    detach(tabId: string) {
      byTab.delete(tabId);
    },
    countForSession(sessionName: string) {
      return [...byTab.values()].filter(
        (item) => item.sessionName === sessionName
      ).length;
    },
    getSocketsForSession(sessionName: string) {
      return [...byTab.values()]
        .filter((item) => item.sessionName === sessionName)
        .map((item) => item.socket);
    }
  };
}
