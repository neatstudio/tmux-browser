import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("install-agent-hooks", () => {
  it("posts factual summary content and canonical metadata from bundled adapters", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-hook-capture-"));
    const captureFile = join(dir, "capture.json");
    const portFile = join(dir, "port.txt");
    const server = spawn(
      process.execPath,
      [
        "-e",
        `const http=require("node:http"),fs=require("node:fs");const events=[];const s=http.createServer((q,r)=>{let b="";q.on("data",c=>b+=c);q.on("end",()=>{events.push(JSON.parse(b));fs.writeFileSync(process.argv[1],JSON.stringify(events));r.end("ok");if(events.length===4)s.close();});});s.listen(0,"127.0.0.1",()=>fs.writeFileSync(process.argv[2],String(s.address().port)));`,
        captureFile,
        portFile
      ],
      { stdio: "ignore" }
    );

    try {
      for (let attempt = 0; attempt < 100 && !readFileIfPresent(portFile); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const port = readFileIfPresent(portFile);
      expect(port).not.toBe("");

      const result = spawnSync(
        process.execPath,
        ["scripts/tmux-ui-agent-hook.mjs", "codex-permission"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          input: JSON.stringify({
            tool_name: "apply_patch",
            tool_input: { description: "Update README examples" },
            turn_id: "turn-12",
            cwd: "/workspace/project"
          }),
          env: {
            ...process.env,
            TMUX_UI_HOOK_URL: `http://127.0.0.1:${port}`,
            TMUX_UI_SESSION_NAME: "phase4-docs"
          }
        }
      );

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const withoutToolFact = spawnSync(
        process.execPath,
        ["scripts/tmux-ui-agent-hook.mjs", "codex-permission"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          input: JSON.stringify({ turn_id: "turn-13" }),
          env: {
            ...process.env,
            TMUX_UI_HOOK_URL: `http://127.0.0.1:${port}`,
            TMUX_UI_SESSION_NAME: "phase4-docs"
          }
        }
      );
      expect(withoutToolFact.stderr).toBe("");
      expect(withoutToolFact.status).toBe(0);
      const claude = spawnSync(
        process.execPath,
        ["scripts/tmux-ui-agent-hook.mjs", "claude-notification"],
        {
          cwd: process.cwd(), encoding: "utf8",
          input: JSON.stringify({
            notification_type: "idle_prompt",
            message: "Claude is ready for the next task"
          }),
          env: { ...process.env, TMUX_UI_HOOK_URL: `http://127.0.0.1:${port}`, TMUX_UI_SESSION_NAME: "phase4-docs" }
        }
      );
      expect(claude.status).toBe(0);
      const standard = spawnSync(
        process.execPath,
        ["scripts/tmux-ui-agent-hook.mjs", "generic"],
        {
          cwd: process.cwd(), encoding: "utf8",
          input: JSON.stringify({
            schemaVersion: "tmux-ui.hook/v1",
            body: "Long fallback body",
            content: [{ type: "summary", text: "Producer summary" }]
          }),
          env: { ...process.env, TMUX_UI_HOOK_URL: `http://127.0.0.1:${port}`, TMUX_UI_SESSION_NAME: "phase4-docs" }
        }
      );
      expect(standard.status).toBe(0);
      for (let attempt = 0; attempt < 100 && !readFileIfPresent(captureFile); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const [event, genericEvent, claudeEvent, standardEvent] = JSON.parse(
        readFileSync(captureFile, "utf8")
      );
      expect(event.content).toEqual([
        { type: "summary", text: "Update README examples" }
      ]);
      expect(event.metadata).toEqual({ toolName: "apply_patch" });
      expect(genericEvent.metadata).toBeUndefined();
      expect(claudeEvent.content).toEqual([
        { type: "summary", text: "Claude is ready for the next task" }
      ]);
      expect(claudeEvent.metadata).toEqual({ notificationType: "idle_prompt" });
      expect(standardEvent.content).toEqual([
        { type: "summary", text: "Producer summary" }
      ]);
    } finally {
      server.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prints hook and revisioned conversation integration examples", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/install-agent-hooks.mjs", "--examples"],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"type": "summary"');
    expect(result.stdout).toContain('"revision": 1');
    expect(result.stdout).toContain('"revision": 2');
    expect(result.stdout).toContain('"revision": 3');
    expect(result.stdout).toContain('"status": "complete"');
    expect(result.stdout).toContain("hooks emit hook events, not conversation messages");
    expect(result.stdout).toContain("config/structured-events-compat.json");
    expect(result.stdout).toContain("minimumCompatibleVersion");
    expect(result.stdout).toContain('"minimumCompatibleVersion": "1.2.3"');
    expect(result.stdout).toContain('"minimumCompatibleVersion": "2.3.4"');
    expect(result.stdout).toContain("Phase 1 server release gate");
    expect(result.stdout).toContain("npm run check:structured-events-compat");
  });

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

function readFileIfPresent(path: string) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
