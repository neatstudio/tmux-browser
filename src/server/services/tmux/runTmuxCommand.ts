import { spawn } from "node:child_process";

export type TmuxCommandResult = {
  stdout: string;
  stderr: string;
};

export type RunTmuxCommand = (
  command: string,
  args: string[]
) => Promise<TmuxCommandResult>;

export const runTmuxCommand: RunTmuxCommand = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn("tmux", [command, ...args]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr || `tmux ${command} exited with code ${code}`));
    });
  });
