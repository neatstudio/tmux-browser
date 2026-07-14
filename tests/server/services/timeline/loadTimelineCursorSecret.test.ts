import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadTimelineCursorSecret } from "../../../../src/server/services/timeline/loadTimelineCursorSecret";

describe("loadTimelineCursorSecret", () => {
  it("creates and atomically reuses a 0600 app-state secret", () => {
    const directory = mkdtempSync(join(tmpdir(), "tmux-ui-cursor-secret-"));
    const secretPath = join(directory, "timeline-cursor-secret");

    const first = loadTimelineCursorSecret({ secretPath });
    const second = loadTimelineCursorSecret({ secretPath });

    expect(first).toHaveLength(32);
    expect(second).toEqual(first);
    expect(statSync(secretPath).mode & 0o777).toBe(0o600);
    expect(Buffer.from(readFileSync(secretPath, "utf8").trim(), "base64url")).toEqual(first);
    expect(readdirSync(directory)).toEqual(["timeline-cursor-secret"]);
  });

  it.each(["short", "", "not base64!", Buffer.alloc(31).toString("base64url")])(
    "rejects an invalid environment secret %j",
    (envSecret) => {
      expect(() => loadTimelineCursorSecret({ envSecret })).toThrow(
        "TMUX_UI_TIMELINE_CURSOR_SECRET must encode exactly 32 bytes as canonical base64url"
      );
    }
  );

  it("uses a valid environment secret without persisting it", () => {
    const envSecret = Buffer.alloc(32, 7).toString("base64url");
    expect(loadTimelineCursorSecret({ envSecret })).toEqual(Buffer.alloc(32, 7));
  });

  it("rejects symlinks without reading or changing the target", () => {
    const directory = mkdtempSync(join(tmpdir(), "tmux-ui-cursor-symlink-"));
    const target = join(directory, "target");
    const secretPath = join(directory, "timeline-cursor-secret");
    const content = `${Buffer.alloc(32, 9).toString("base64url")}\n`;
    writeFileSync(target, content, { mode: 0o644 });
    symlinkSync(target, secretPath);

    expect(() => loadTimelineCursorSecret({ secretPath })).toThrow();
    expect(readFileSync(target, "utf8")).toBe(content);
    expect(statSync(target).mode & 0o777).toBe(0o644);
  });

  it("rejects directories and multiply-linked secret files", () => {
    const directory = mkdtempSync(join(tmpdir(), "tmux-ui-cursor-path-"));
    const nested = join(directory, "nested");
    mkdirSync(nested);
    expect(() => loadTimelineCursorSecret({ secretPath: nested })).toThrow();

    const secretPath = join(directory, "timeline-cursor-secret");
    writeFileSync(secretPath, `${Buffer.alloc(32, 4).toString("base64url")}\n`, { mode: 0o600 });
    linkSync(secretPath, join(directory, "other-link"));
    expect(() => loadTimelineCursorSecret({ secretPath })).toThrow();
  });
});
