import pty from "node-pty";

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
  cols,
  rows
}) => {
  const ptyProcess = pty.spawn("tmux", ["attach-session", "-t", sessionName], {
    cols,
    rows,
    name: "xterm-256color",
    cwd: globalThis.process.cwd(),
    env: globalThis.process.env as Record<string, string>
  });

  return {
    onData(listener) {
      ptyProcess.onData(listener);
    },
    onExit(listener) {
      ptyProcess.onExit(() => listener());
    },
    write(data) {
      ptyProcess.write(data);
    },
    resize(nextCols, nextRows) {
      ptyProcess.resize(nextCols, nextRows);
    },
    kill() {
      ptyProcess.kill();
    }
  };
};
