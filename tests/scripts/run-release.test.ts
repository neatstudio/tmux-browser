import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  formatChineseReleaseNotes,
  formatReleaseNotes
} from "../../scripts/generate-release-notes.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  name: string;
  scripts: Record<string, string>;
};
const packScript = readFileSync("scripts/pack-run.mjs", "utf8");
const publishScript = readFileSync("scripts/publish-run.mjs", "utf8");
const releaseNotesScript = readFileSync("scripts/generate-release-notes.mjs", "utf8");
const workflow = readFileSync(".github/workflows/release.yml", "utf8");
const readme = readFileSync("README.md", "utf8");
const readmeZh = readFileSync("README.zh-CN.md", "utf8");
const publishExample = readFileSync(".tmux-ui.publish.json.example", "utf8");

describe("run release scripts", () => {
  it("uses tmux-ui as the public package identity", () => {
    expect(packageJson.name).toBe("tmux-ui");
  });

  it("splits pack and publish commands", () => {
    expect(packageJson.scripts["pack:run"]).toBe("node scripts/pack-run.mjs");
    expect(packageJson.scripts.publish).toBe("node scripts/publish-run.mjs");
    expect(packageJson.scripts["release:notes"]).toBe(
      "node scripts/generate-release-notes.mjs"
    );
    expect(packageJson.scripts.release).toBeUndefined();
  });

  it("packs stable and versioned run files without remote deployment", () => {
    expect(packScript).toContain("`${projectName}-${version}.run`");
    expect(packScript).toContain('join(releaseDir, "release.run")');
    expect(packScript).not.toContain("stamp");
    expect(packScript).not.toContain("scp");
    expect(packScript).not.toContain("deployTargets");
  });

  it("embeds release commit and build time for health checks", () => {
    expect(packScript).toContain('git", ["rev-parse", "--short", "HEAD"]');
    expect(packScript).toContain("const builtAt = new Date().toISOString()");
    expect(packScript).toContain('export TMUX_UI_COMMIT="\\${TMUX_UI_COMMIT:-');
    expect(packScript).toContain('export TMUX_UI_BUILT_AT="\\${TMUX_UI_BUILT_AT:-');
  });

  it("loads node through nvm in non-interactive service shells", () => {
    expect(packScript).toContain('local node_version="\\${TMUX_UI_NODE_VERSION:-22}"');
    expect(packScript).toContain('[[ -d "$directory" ]] || return 0');
    expect(packScript).toContain('prepend_path_if_dir "$HOME/.local/bin"');
    expect(packScript).toContain('prepend_path_if_dir "$HOME/.hermes/node/bin"');
    expect(packScript).toContain('prepend_path_if_dir "/opt/homebrew/bin"');
    expect(packScript).toContain('prepend_path_if_dir "/usr/local/bin"');
    expect(packScript).toContain("require_command tmux");
    expect(packScript).toContain("require_command()");
    expect(packScript).toContain('nvm install "$node_version"');
    expect(packScript).toContain('nvm use "$node_version"');
  });

  it("uses ~/.tmux-ui and a dedicated tmux-ui tmux session", () => {
    expect(packScript).toContain('APP_HOME="\\${TMUX_UI_HOME:-$HOME/.tmux-ui}"');
    expect(packScript).toContain('APP_SESSION="\\${TMUX_UI_SESSION:-tmux-ui}"');
    expect(packScript).toContain('tmux has-session -t "$APP_SESSION"');
    expect(packScript).toContain('tmux new-session -d -s "$APP_SESSION" -c "$HOME"');
    expect(packScript).not.toContain("tmux has-session -t tmux");
    expect(packScript).not.toContain('lsof -tiTCP:"$port"');
  });

  it("restarts inside the install directory without leaving the tmux session cwd there", () => {
    expect(packScript).toContain(
      'tmux respawn-pane -k -t "$APP_SESSION" -c "$APP_HOME"'
    );
    expect(packScript).not.toContain("cd '$APP_HOME' && PORT=");
  });

  it("protects start from running as a bare foreground process outside tmux", () => {
    expect(packScript).toContain("start_server_in_tmux()");
    expect(packScript).toContain('if [[ -z "\\${TMUX:-}" ]]; then');
    expect(packScript).toContain(
      'Not running inside tmux. Starting tmux-ui in tmux session'
    );
    expect(packScript).toContain("start_server_in_tmux");
  });

  it("supports systemd service mode without a tmux keeper session", () => {
    expect(packScript).toContain('SERVICE_NAME="\\${TMUX_UI_SERVICE_NAME:-tmux-ui}"');
    expect(packScript).toContain(
      'SYSTEMD_UNIT_PATH="\\${TMUX_UI_SYSTEMD_UNIT:-/etc/systemd/system/$SERVICE_NAME.service}"'
    );
    expect(packScript).toContain("service-install  Install systemd/launchd service");
    expect(packScript).toContain("service-start    Start systemd/launchd service");
    expect(packScript).toContain("service-restart  Restart systemd/launchd service");
    expect(packScript).toContain("service-status   Show systemd/launchd service status");
    expect(packScript).toContain("service-stop     Stop systemd/launchd service");
    expect(packScript).toContain("service-uninstall Stop and remove systemd/launchd service");
    expect(packScript).toContain("write_systemd_unit()");
    expect(packScript).toContain('ExecStart=$APP_HOME/start.sh');
    expect(packScript).toContain("Environment=PATH=$HOME/.local/bin:$HOME/.hermes/node/bin");
    expect(packScript).toContain("/opt/homebrew/bin:/opt/homebrew/sbin");
    expect(packScript).toContain("systemctl daemon-reload");
    expect(packScript).toContain('systemctl enable "$SERVICE_NAME.service"');
    expect(packScript).toContain('systemctl restart "$SERVICE_NAME.service"');
    expect(packScript).toContain("wait_for_systemd_active()");
    expect(packScript).toContain('systemctl is-active --quiet "$SERVICE_NAME.service"');
    expect(packScript).toContain("wait_for_http_health_once()");
    expect(packScript).toContain('rm -f "$SYSTEMD_UNIT_PATH"');
  });

  it("supports macOS launchd service mode for local installs", () => {
    expect(packScript).toContain('LAUNCHD_LABEL="\\${TMUX_UI_LAUNCHD_LABEL:-com.neatstudio.$SERVICE_NAME}"');
    expect(packScript).toContain('LAUNCHD_PLIST_PATH="\\${TMUX_UI_LAUNCHD_PLIST:-$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist}"');
    expect(packScript).toContain("write_launchd_plist()");
    expect(packScript).toContain("<key>KeepAlive</key>");
    expect(packScript).toContain("<key>PATH</key>");
    expect(packScript).toContain('launchctl bootstrap "gui/$(id -u)" "$LAUNCHD_PLIST_PATH"');
    expect(packScript).toContain('launchctl kickstart -k "gui/$(id -u)/$LAUNCHD_LABEL"');
    expect(packScript).toContain('launchctl bootout "gui/$(id -u)" "$LAUNCHD_PLIST_PATH"');
    expect(packScript).toContain("stop_launchd_service_if_present()");
    expect(packScript).toContain("bootstrap_launchd_service_if_needed()");
    expect(packScript).toContain("print_launchd_status()");
    expect(packScript).toContain("wait_for_launchd_running()");
    expect(packScript).toContain("is_launchd_running()");
    expect(packScript).toContain('curl -fsS "http://$host:$port/api/health"');
    expect(packScript).toContain('echo "launchd service: $LAUNCHD_LABEL"');
    expect(packScript).toContain('echo "state: \\${state:-unknown}"');
  });

  it("supports uninstall and does not default to starting the server", () => {
    expect(packScript).toContain('COMMAND="\\${1:-help}"');
    expect(packScript).toContain("uninstall    Stop tmux-ui and remove the install directory");
    expect(packScript).toContain("uninstall_server()");
    expect(packScript).toContain('rm -rf "$APP_HOME"');
  });

  it("exposes short tmux resurrection management commands", () => {
    expect(packScript).toContain("tmux-install  Install tmux-resurrect and tmux-continuum");
    expect(packScript).toContain("tmux-status   Show tmux resurrection status");
    expect(packScript).toContain("tmux-save     Save tmux sessions now");
    expect(packScript).toContain("tmux-restore  Restore saved tmux sessions");
    expect(packScript).toContain("tmux-update   Update tmux resurrection plugins");
    expect(packScript).toContain("install_tmux_resurrection()");
    expect(packScript).toContain("restore_tmux_if_empty()");
    expect(packScript).toContain('TMUX_UI_TMUX_AUTO_RESTORE="\\${TMUX_UI_TMUX_AUTO_RESTORE:-1}"');
    expect(packScript).toContain('tmux-install)');
    expect(packScript).toContain('tmux-restore)');
    expect(packScript).toContain('tmux-save)');
    expect(packScript).not.toContain("tmux-resurrect-install");
  });

  it("installs a stable tmux-ui command into the user bin directory", () => {
    expect(packScript).toContain('APP_BIN_DIR="$APP_HOME/bin"');
    expect(packScript).toContain('USER_BIN_DIR="\\${TMUX_UI_USER_BIN:-$HOME/.local/bin}"');
    expect(packScript).toContain('CLI_NAME="\\${TMUX_UI_CLI_NAME:-tmux-ui}"');
    expect(packScript).toContain("install_cli_entrypoint()");
    expect(packScript).toContain('cp "$0" "$APP_BIN_DIR/$CLI_NAME"');
    expect(packScript).toContain('link_path="$USER_BIN_DIR/$CLI_NAME"');
    expect(packScript).toContain('ln -sfn "$APP_BIN_DIR/$CLI_NAME" "$link_path"');
    expect(packScript).toContain("choose_cli_bin_dir()");
    expect(packScript).toContain('/usr/local/bin');
    expect(packScript).toContain('echo "Installed CLI: $USER_BIN_DIR/$CLI_NAME"');
    expect(packScript).toContain('echo "Run commands with: $CLI_NAME restart"');
    expect(packScript).toContain("PATH does not currently include");
    expect(packScript).toContain('source \\\\"$TMUX_UI_PROFILE_UPDATED\\\\"');
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
    expect(packScript).toContain('HOST="\\${HOST:-}"');
    expect(packScript).toContain('HOST="$(detect_tailscale_host)"');
    expect(packScript).toContain("export HOST");
    expect(packScript).not.toContain('export HOST="\\${HOST:-$(detect_tailscale_host)}"');
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
    expect(publishScript).toContain("--service-install");
    expect(publishScript).toContain('"service-install"');
    expect(publishScript).not.toContain('host: "tw0"');
    expect(publishScript).not.toContain('host: "tw1"');
    expect(publishScript).not.toContain('host: "vn"');
  });

  it("builds GitHub Release artifacts from pack:run", () => {
    expect(workflow).toContain("npm run pack:run");
    expect(workflow).toContain(
      "npm run release:notes -- --out release/release-notes.md --zh-out release/release-notes.zh-CN.md"
    );
    expect(workflow).toContain(
      "{ cat release/release-notes.md; printf '\\n'; cat release/release-notes.zh-CN.md; } > release/release-notes.combined.md"
    );
    expect(workflow).toContain("release/release.run");
    expect(workflow).toContain("release/tmux-ui-${VERSION}.run");
    expect(workflow).toContain("release/release-notes.zh-CN.md");
    expect(workflow).toContain("release/release-notes.combined.md");
    expect(workflow).toContain('TAG="v${VERSION}"');
    expect(workflow).toContain("gh release create \"$TAG\"");
    expect(workflow).toContain("gh release edit \"$TAG\"");
    expect(workflow).toContain("gh release upload \"$TAG\"");
    expect(workflow).toContain("--clobber");
    expect(workflow).toContain("--target \"$GITHUB_SHA\"");
    expect(workflow).toContain("--notes-file release/release-notes.combined.md");
    expect(workflow).not.toContain("skip publishing");
  });

  it("opts GitHub-hosted JavaScript actions into the Node 24 runtime", () => {
    expect(workflow).toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: \"true\"");
    expect(workflow).toContain("uses: actions/checkout@v6");
    expect(workflow).toContain("uses: actions/setup-node@v6");
    expect(workflow).toContain("uses: actions/upload-artifact@v7");
    expect(workflow).not.toContain("uses: actions/checkout@v4");
    expect(workflow).not.toContain("uses: actions/setup-node@v4");
    expect(workflow).not.toContain("uses: actions/upload-artifact@v4");
  });

  it("generates release notes from the previous version tag to the current build", () => {
    expect(releaseNotesScript).toContain("findPreviousVersionTag");
    expect(releaseNotesScript).toContain("gitLog");
    expect(releaseNotesScript).toContain("formatReleaseNotes");
    expect(releaseNotesScript).toContain("formatChineseReleaseNotes");
    expect(releaseNotesScript).toContain("Changes since");
    expect(releaseNotesScript).toContain("## 中文");
    expect(releaseNotesScript).toContain("--zh-out");
    expect(releaseNotesScript).toContain("## Summary");
    expect(releaseNotesScript).toContain("### Verification");
    expect(releaseNotesScript).not.toContain("## Source");
    expect(releaseNotesScript).not.toContain("## 来源");
    expect(releaseNotesScript).not.toContain("## All Commits");
    expect(releaseNotesScript).not.toContain("## 全部提交");
    expect(releaseNotesScript).toContain("--out");
  });

  it("formats release notes as a human summary instead of duplicate commit lists", () => {
    const commits = [
      {
        hash: "3c635df",
        subject: "Update GitHub release notes publishing"
      }
    ];
    const english = formatReleaseNotes({
      commits,
      from: "v0.1.17",
      version: "0.1.18"
    });
    const chinese = formatChineseReleaseNotes({
      commits,
      from: "v0.1.17",
      version: "0.1.18"
    });

    expect(english).toContain("## Summary");
    expect(english).toContain("### Fixed");
    expect(english).toContain("GitHub Release notes now use the combined English and Chinese release notes");
    expect(english).toContain("Existing GitHub Releases are updated instead of being skipped");
    expect(english).toContain("### Verification");
    expect(english).not.toContain("## Source");
    expect(english).not.toContain("Source commit");
    expect(english).not.toContain("## All Commits");
    expect(english).not.toContain("## Release and Operations");
    expect(chinese).toContain("## 摘要");
    expect(chinese).toContain("### 已修复");
    expect(chinese).toContain("GitHub Release 正文现在使用英文和中文合并后的 release notes");
    expect(chinese).not.toContain("## 来源");
    expect(chinese).not.toContain("来源提交");
    expect(chinese).not.toContain("## 全部提交");
    expect(chinese).not.toContain("## 发布与运维");
  });

  it("keeps commit references inline for multi-commit release notes", () => {
    const commits = [
      {
        hash: "8d28173",
        subject: "Improve release notes quality"
      },
      {
        hash: "3c635df",
        subject: "Update GitHub release notes publishing"
      }
    ];
    const english = formatReleaseNotes({
      commits,
      from: "v0.1.18",
      version: "0.1.19"
    });
    const chinese = formatChineseReleaseNotes({
      commits,
      from: "v0.1.18",
      version: "0.1.19"
    });

    expect(english).toContain("## Summary");
    expect(english).toContain("### Fixed");
    expect(english).toContain("### Changed");
    expect(english).toContain("### Verification");
    expect(english).not.toContain("## Source");
    expect(english).not.toContain("Source commits");
    expect(english).toContain(
      "- Release notes now read like an operational changelog instead of a duplicated commit list. (`8d28173`)"
    );
    expect(english).toContain(
      "- Existing GitHub Releases are updated instead of being skipped. (`3c635df`)"
    );
    expect(english).toContain(
      "- Release note formatting is covered by a content-level test. (`8d28173`)"
    );
    expect(english).toContain(
      "- Published assets: `release.run` and `tmux-ui-0.1.19.run`."
    );

    expect(chinese).toContain("## 摘要");
    expect(chinese).toContain("### 已修复");
    expect(chinese).toContain("### 变更");
    expect(chinese).toContain("### 验证");
    expect(chinese).not.toContain("## 来源");
    expect(chinese).not.toContain("来源提交");
    expect(chinese).toContain(
      "- Release notes 现在是面向用户的运维变更说明，不再是重复的 commit 列表。 (`8d28173`)"
    );
    expect(chinese).toContain(
      "- 已存在的 GitHub Release 会被更新，而不是直接跳过。 (`3c635df`)"
    );
    expect(chinese).toContain(
      "- release notes 的实际输出结构已经加入测试覆盖。 (`8d28173`)"
    );
  });

  it("documents bilingual readmes and service management commands", () => {
    expect(readme).toContain("[简体中文](README.zh-CN.md)");
    expect(readmeZh).toContain("[English](README.md)");
    expect(readme).toContain(".tmux-ui.publish.json.example");
    expect(readmeZh).toContain(".tmux-ui.publish.json.example");
    expect(readme).toContain("local `~/.ssh/config`");
    expect(readmeZh).toContain("本机 `~/.ssh/config`");
    expect(readme).toContain("tmux-ui service-status");
    expect(readmeZh).toContain("tmux-ui service-status");
    expect(readme).toContain("After install, use the stable `tmux-ui` command");
    expect(readmeZh).toContain("安装完成后，使用稳定命令 `tmux-ui`");
    expect(readme).toContain("systemctl status tmux-ui");
    expect(readmeZh).toContain("systemctl status tmux-ui");
    expect(readme).toContain("launchctl print");
    expect(readmeZh).toContain("launchctl print");
    expect(readme).toContain("tmux-ui tmux-install");
    expect(readmeZh).toContain("tmux-ui tmux-install");
    expect(readme).toContain("tmux-resurrect cannot restore process memory");
    expect(readmeZh).toContain("tmux-resurrect 不能恢复进程内存状态");
  });

  it("ships a publish target example without committing private targets", () => {
    expect(publishExample).toContain('"targets"');
    expect(publishExample).toContain("server-a:/root/tmux");
    expect(publishExample).not.toContain("tw0");
    expect(publishExample).not.toContain("tw1");
    expect(publishExample).not.toContain("vn");
    expect(publishExample).not.toContain("cc2");
  });
});
