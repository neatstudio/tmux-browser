import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("install-agent-hooks", () => {
  it("merges Codex and Claude hooks without dropping existing hooks", () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-hooks-"));
    const codexHooksFile = join(dir, "codex-hooks.json");
    const claudeSettingsFile = join(dir, "claude-settings.json");

    writeFileSync(codexHooksFile, JSON.stringify({ hooks: {} }), "utf8");
    writeFileSync(
      claudeSettingsFile,
      JSON.stringify({
        hooks: {
          Notification: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: "osascript -e 'display notification \"Claude\"'"
                }
              ]
            }
          ],
          PostToolUse: [
            {
              matcher: "Edit|Write",
              hooks: [{ type: "command", command: "prettier --write" }]
            }
          ]
        }
      }),
      "utf8"
    );

    try {
      const result = spawnSync(
        process.execPath,
        ["scripts/install-agent-hooks.mjs"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            CODEX_HOOKS_FILE: codexHooksFile,
            CLAUDE_SETTINGS_FILE: claudeSettingsFile,
            TMUX_UI_AGENT_HOOK: "/tmp/tmux-ui-agent-hook",
            TMUX_UI_HOOK_URL: "http://100.89.0.116:3000/api/hooks/events"
          }
        }
      );

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);

      const codex = JSON.parse(readFileSync(codexHooksFile, "utf8"));
      const claude = JSON.parse(readFileSync(claudeSettingsFile, "utf8"));

      expect(codex.hooks.PermissionRequest[0]).toMatchObject({
        matcher: "*",
        hooks: [
          {
            type: "command",
            async: true
          }
        ]
      });
      expect(codex.hooks.PermissionRequest[0].hooks[0].command).toContain(
        "codex-permission"
      );
      expect(codex.hooks.PermissionRequest[0].hooks[0].command).toContain(
        "TMUX_UI_HOOK_URL="
      );
      expect(claude.hooks.PostToolUse).toHaveLength(1);
      expect(claude.hooks.Notification).toHaveLength(2);
      expect(claude.hooks.Notification[1]).toMatchObject({
        matcher: "permission_prompt|idle_prompt",
        hooks: [
          {
            type: "command",
            async: true
          }
        ]
      });
      expect(claude.hooks.Notification[1].hooks[0].command).toContain(
        "claude-notification"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uninstalls only tmux-ui agent hooks", () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-hooks-"));
    const codexHooksFile = join(dir, "codex-hooks.json");
    const claudeSettingsFile = join(dir, "claude-settings.json");
    const env = {
      ...process.env,
      CODEX_HOOKS_FILE: codexHooksFile,
      CLAUDE_SETTINGS_FILE: claudeSettingsFile,
      TMUX_UI_AGENT_HOOK: "/tmp/tmux-ui-agent-hook"
    };

    try {
      spawnSync(process.execPath, ["scripts/install-agent-hooks.mjs"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env
      });
      const installAgain = spawnSync(
        process.execPath,
        ["scripts/install-agent-hooks.mjs", "--uninstall"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env
        }
      );

      expect(installAgain.stderr).toBe("");
      expect(installAgain.status).toBe(0);

      const codex = JSON.parse(readFileSync(codexHooksFile, "utf8"));
      const claude = JSON.parse(readFileSync(claudeSettingsFile, "utf8"));

      expect(codex.hooks.PermissionRequest ?? []).toEqual([]);
      expect(claude.hooks.Notification ?? []).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
