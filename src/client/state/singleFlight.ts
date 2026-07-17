type SessionsRequestKeyOptions = {
  includePreview: boolean;
  includePanes: boolean;
  includeServerStatus: boolean;
  mutedSessionNames?: string[];
};

type TimelineRequestKeyOptions = {
  cursor?: string | null;
  limit: number;
  historyExpired: boolean;
};

export function sessionStatusRequestKey(sessionName: string) {
  return `status:${sessionName}`;
}

export function sessionsRequestKey(options: SessionsRequestKeyOptions) {
  const mutedSessionNames = [...(options.mutedSessionNames ?? [])].sort();
  return `sessions:${options.includePreview}:${options.includePanes}:${options.includeServerStatus}:${JSON.stringify(mutedSessionNames)}`;
}

export function timelineRequestKey(options: TimelineRequestKeyOptions) {
  return `timeline:${options.cursor ?? "latest"}:${options.limit}:${options.historyExpired}`;
}

export function createSingleFlight() {
  const inFlight = new Map<string, Promise<unknown>>();

  return {
    run<T>(key: string, operation: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key) as Promise<T> | undefined;
      if (existing) {
        return existing;
      }

      const pending = operation();
      const clear = () => {
        if (inFlight.get(key) === pending) {
          inFlight.delete(key);
        }
      };
      inFlight.set(key, pending);
      void pending.then(clear, clear);
      return pending;
    }
  };
}
