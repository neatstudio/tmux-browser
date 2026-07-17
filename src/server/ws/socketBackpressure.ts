const LOW_WATERMARK_BYTES = 128 * 1024;
const HIGH_WATERMARK_BYTES = 512 * 1024;
const HARD_LIMIT_BYTES = 1024 * 1024;
const RETRY_MS = 16;

type BackpressureSocket = {
  bufferedAmount: number;
  send: (payload: string) => void;
  close: (code?: number, reason?: string) => void;
};

type BackpressureOptions = {
  lowWatermarkBytes?: number;
  highWatermarkBytes?: number;
  hardLimitBytes?: number;
  retryMs?: number;
};

export function createSocketBackpressure(
  socket: BackpressureSocket,
  options: BackpressureOptions = {}
) {
  const lowWatermark = options.lowWatermarkBytes ?? LOW_WATERMARK_BYTES;
  const highWatermark = options.highWatermarkBytes ?? HIGH_WATERMARK_BYTES;
  const hardLimit = options.hardLimitBytes ?? HARD_LIMIT_BYTES;
  const retryMs = options.retryMs ?? RETRY_MS;
  const pending: Array<{ payload: string; bytes: number }> = [];
  let pendingBytes = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let paused = false;
  let closed = false;

  function clearRetryTimer() {
    if (retryTimer === null) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  function cancel() {
    clearRetryTimer();
    pending.length = 0;
    pendingBytes = 0;
    paused = false;
  }

  function closeSlowConsumer() {
    if (closed) return;
    closed = true;
    cancel();
    socket.close(1013, "Client too slow");
  }

  function totalBufferedBytes() {
    return socket.bufferedAmount + pendingBytes;
  }

  function scheduleRetry() {
    if (retryTimer !== null || closed) return;
    retryTimer = setTimeout(retry, retryMs);
    retryTimer.unref?.();
  }

  function drain() {
    if (closed || socket.bufferedAmount > lowWatermark) {
      scheduleRetry();
      return;
    }
    paused = false;
    while (pending.length > 0) {
      const item = pending.shift()!;
      pendingBytes -= item.bytes;
      socket.send(item.payload);
      if (socket.bufferedAmount > highWatermark) {
        paused = true;
        break;
      }
    }
    if (pending.length > 0) scheduleRetry();
  }

  function retry() {
    retryTimer = null;
    if (totalBufferedBytes() > hardLimit) {
      closeSlowConsumer();
      return;
    }
    drain();
  }

  return {
    enqueue(payload: string) {
      if (closed) return false;
      const bytes = Buffer.byteLength(payload);
      if (totalBufferedBytes() + bytes > hardLimit) {
        closeSlowConsumer();
        return false;
      }
      if (!paused && pending.length === 0 && socket.bufferedAmount + bytes <= highWatermark) {
        socket.send(payload);
        return true;
      }
      pending.push({ payload, bytes });
      pendingBytes += bytes;
      paused = true;
      scheduleRetry();
      return true;
    },
    flushFinal() {
      if (closed) return false;
      if (totalBufferedBytes() > hardLimit) {
        closeSlowConsumer();
        return false;
      }
      clearRetryTimer();
      while (pending.length > 0) {
        const item = pending.shift()!;
        pendingBytes -= item.bytes;
        socket.send(item.payload);
      }
      paused = false;
      return true;
    },
    cancel,
    getPendingBytes() {
      return pendingBytes;
    }
  };
}
