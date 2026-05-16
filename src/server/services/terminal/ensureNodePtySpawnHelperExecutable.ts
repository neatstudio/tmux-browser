import { createRequire } from "node:module";
import { chmodSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

type HelperDeps = {
  platform?: NodeJS.Platform;
  arch?: string;
  resolvePackageRoot?: () => string;
  fileExists?: (path: string) => boolean;
  statFile?: (path: string) => { mode: number };
  chmodFile?: (path: string, mode: number) => void;
};

function resolveNodePtyPackageRoot(): string {
  return dirname(require.resolve("node-pty/package.json"));
}

export function ensureNodePtySpawnHelperExecutable(
  deps: HelperDeps = {}
): void {
  const platform = deps.platform ?? process.platform;

  if (platform !== "darwin") {
    return;
  }

  const arch = deps.arch ?? process.arch;
  const packageRoot = (deps.resolvePackageRoot ?? resolveNodePtyPackageRoot)();
  const helperPath = join(packageRoot, "prebuilds", `darwin-${arch}`, "spawn-helper");
  const fileExists = deps.fileExists ?? existsSync;

  if (!fileExists(helperPath)) {
    return;
  }

  const statFile = deps.statFile ?? statSync;
  const currentMode = statFile(helperPath).mode;
  const executableMode = currentMode | 0o111;

  if (executableMode === currentMode) {
    return;
  }

  const chmodFile = deps.chmodFile ?? chmodSync;
  chmodFile(helperPath, executableMode);
}
