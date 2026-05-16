import { spawn } from "node:child_process";

export type GitSummary = {
  branch: string;
  dirty: boolean;
};

type RunGit = (cwd: string, args: string[]) => Promise<string>;

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: process.env
    });

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
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr || `git exited with code ${code}`));
    });
  });
}

export async function getGitSummary(
  cwd: string | null | undefined,
  deps: { run?: RunGit } = {}
): Promise<GitSummary | null> {
  if (!cwd) {
    return null;
  }

  const run = deps.run ?? runGit;

  try {
    const branch =
      (await run(cwd, ["branch", "--show-current"])) ||
      (await run(cwd, ["rev-parse", "--short", "HEAD"]));
    const status = await run(cwd, ["status", "--porcelain"]);

    return {
      branch,
      dirty: status.length > 0
    };
  } catch {
    return null;
  }
}
