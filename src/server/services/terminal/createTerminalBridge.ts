import { spawn } from "node:child_process";

export type TerminalBridge = {
  onData: (listener: (data: string) => void) => void;
  onExit: (listener: () => void) => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
};

export type CreateTerminalBridge = (options: {
  sessionName: string;
  cols: number;
  rows: number;
}) => TerminalBridge;

export const createTerminalBridge: CreateTerminalBridge = ({
  sessionName,
  cols: _cols,
  rows: _rows
}) => {
  const bridgeProcess = spawn(
    "script",
    ["-q", "/dev/null", "tmux", "attach-session", "-t", sessionName],
    {
      cwd: globalThis.process.cwd(),
      env: {
        ...globalThis.process.env,
        TERM: "xterm-256color"
      },
      stdio: "pipe"
    }
  );

  return {
    onData(listener) {
      bridgeProcess.stdout.on("data", (chunk: Buffer | string) => {
        listener(chunk.toString());
      });
      bridgeProcess.stderr.on("data", (chunk: Buffer | string) => {
        listener(chunk.toString());
      });
    },
    onExit(listener) {
      bridgeProcess.on("close", () => listener());
    },
    write(data) {
      bridgeProcess.stdin.write(data);
    },
    resize(_nextCols, _nextRows) {
      return undefined;
    },
    kill() {
      bridgeProcess.kill();
    }
  };
};
