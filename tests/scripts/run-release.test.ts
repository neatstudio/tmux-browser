import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  name: string;
  scripts: Record<string, string>;
};
const packScript = readFileSync("scripts/pack-run.mjs", "utf8");
const publishScript = readFileSync("scripts/publish-run.mjs", "utf8");
const workflow = readFileSync(".github/workflows/release.yml", "utf8");

describe("run release scripts", () => {
  it("uses tmux-ui as the public package identity", () => {
    expect(packageJson.name).toBe("tmux-ui");
  });

  it("splits pack and publish commands", () => {
    expect(packageJson.scripts["pack:run"]).toBe("node scripts/pack-run.mjs");
    expect(packageJson.scripts.publish).toBe("node scripts/publish-run.mjs");
    expect(packageJson.scripts.release).toBeUndefined();
  });

  it("packs stable and versioned run files without remote deployment", () => {
    expect(packScript).toContain("`${projectName}-${version}.run`");
    expect(packScript).toContain('join(releaseDir, "release.run")');
    expect(packScript).not.toContain("stamp");
    expect(packScript).not.toContain("scp");
    expect(packScript).not.toContain("deployTargets");
  });

  it("uses ~/.tmux-ui and a dedicated tmux-ui tmux session", () => {
    expect(packScript).toContain('APP_HOME="\\${TMUX_UI_HOME:-$HOME/.tmux-ui}"');
    expect(packScript).toContain('APP_SESSION="\\${TMUX_UI_SESSION:-tmux-ui}"');
    expect(packScript).toContain('tmux has-session -t "$APP_SESSION"');
    expect(packScript).toContain('tmux new-session -d -s "$APP_SESSION"');
    expect(packScript).not.toContain("tmux has-session -t tmux");
    expect(packScript).not.toContain('lsof -tiTCP:"$port"');
  });

  it("supports uninstall and does not default to starting the server", () => {
    expect(packScript).toContain('COMMAND="\\${1:-help}"');
    expect(packScript).toContain("uninstall    Stop tmux-ui and remove the install directory");
    expect(packScript).toContain("uninstall_server()");
    expect(packScript).toContain('rm -rf "$APP_HOME"');
  });

  it("installs a stable tmux-ui command into the user bin directory", () => {
    expect(packScript).toContain('APP_BIN_DIR="$APP_HOME/bin"');
    expect(packScript).toContain('USER_BIN_DIR="\\${TMUX_UI_USER_BIN:-$HOME/.local/bin}"');
    expect(packScript).toContain('CLI_NAME="\\${TMUX_UI_CLI_NAME:-tmux-ui}"');
    expect(packScript).toContain("install_cli_entrypoint()");
    expect(packScript).toContain('cp "$0" "$APP_BIN_DIR/$CLI_NAME"');
    expect(packScript).toContain('ln -sfn "$APP_BIN_DIR/$CLI_NAME" "$USER_BIN_DIR/$CLI_NAME"');
  });

  it("adds the user bin directory to common shell profile files", () => {
    expect(packScript).toContain("ensure_user_bin_on_path()");
    expect(packScript).toContain(".bash_profile");
    expect(packScript).toContain(".bashrc");
    expect(packScript).toContain(".zprofile");
    expect(packScript).toContain('export PATH="$HOME/.local/bin:$PATH"');
  });

  it("stops legacy gemm4-node processes before restarting tmux-ui", () => {
    expect(packScript).toContain('LEGACY_APP_HOME="\\${TMUX_UI_LEGACY_HOME:-$HOME/.local/share/gemm4-node}"');
    expect(packScript).toContain("stop_legacy_app_processes()");
    expect(packScript).toContain('pgrep -f "node dist/server/index.js"');
    expect(packScript).toContain('readlink "/proc/$pid/cwd"');
    expect(packScript).toContain("stop_port_processes()");
    expect(packScript).toContain('lsof -nP -iTCP:"$port" -sTCP:LISTEN -t');
    expect(packScript).toContain('"$command_line" == *"dist/server/index.js"*');
  });

  it("keeps Tailscale-first host defaults with explicit HOST override", () => {
    expect(packScript).toContain("detect_tailscale_host");
    expect(packScript).toContain("100\\\\.");
    expect(packScript).toContain("detect_tailscale_host_with_ip");
    expect(packScript).toContain("detect_tailscale_host_with_ifconfig");
    expect(packScript).toContain('ifconfig 2>/dev/null');
    expect(packScript).toContain('export HOST="\\${HOST:-$(detect_tailscale_host)}"');
    expect(packScript).toContain("No Tailscale 100.x address found");
  });

  it("publishes only when targets are explicitly provided or configured locally", () => {
    expect(publishScript).toContain(".tmux-ui.publish.json");
    expect(publishScript).toContain('const defaultRunFile = join(rootDir, "release", "release.run")');
    expect(publishScript).toContain('options.targets.push(parseTarget(argv[++index] ?? ""))');
    expect(publishScript).toContain("ssh");
    expect(publishScript).toContain("scp");
    expect(publishScript).toContain("--install");
    expect(publishScript).toContain("--restart");
    expect(publishScript).not.toContain('host: "tw0"');
    expect(publishScript).not.toContain('host: "tw1"');
    expect(publishScript).not.toContain('host: "vn"');
  });

  it("builds GitHub Release artifacts from pack:run", () => {
    expect(workflow).toContain("npm run pack:run");
    expect(workflow).toContain("release/release.run");
    expect(workflow).toContain("release/tmux-ui-${VERSION}.run");
    expect(workflow).toContain('TAG="v${VERSION}"');
    expect(workflow).toContain("gh release create \"$TAG\"");
    expect(workflow).toContain("--target \"$GITHUB_SHA\"");
  });
});
