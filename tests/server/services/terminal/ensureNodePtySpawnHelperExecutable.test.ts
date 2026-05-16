import { describe, expect, it, vi } from "vitest";

import { ensureNodePtySpawnHelperExecutable } from "../../../../src/server/services/terminal/ensureNodePtySpawnHelperExecutable";

describe("ensureNodePtySpawnHelperExecutable", () => {
  it("adds execute bits for the macOS spawn-helper when missing", () => {
    const chmodFile = vi.fn();

    ensureNodePtySpawnHelperExecutable({
      platform: "darwin",
      arch: "arm64",
      resolvePackageRoot: () => "/pkg/node-pty",
      fileExists: () => true,
      statFile: () => ({ mode: 0o100644 }),
      chmodFile
    });

    expect(chmodFile).toHaveBeenCalledWith(
      "/pkg/node-pty/prebuilds/darwin-arm64/spawn-helper",
      0o100755
    );
  });

  it("does nothing when the helper is already executable", () => {
    const chmodFile = vi.fn();

    ensureNodePtySpawnHelperExecutable({
      platform: "darwin",
      arch: "arm64",
      resolvePackageRoot: () => "/pkg/node-pty",
      fileExists: () => true,
      statFile: () => ({ mode: 0o100755 }),
      chmodFile
    });

    expect(chmodFile).not.toHaveBeenCalled();
  });

  it("does nothing outside macOS", () => {
    const chmodFile = vi.fn();

    ensureNodePtySpawnHelperExecutable({
      platform: "linux",
      arch: "x64",
      resolvePackageRoot: () => "/pkg/node-pty",
      fileExists: () => true,
      statFile: () => ({ mode: 0o100644 }),
      chmodFile
    });

    expect(chmodFile).not.toHaveBeenCalled();
  });
});
