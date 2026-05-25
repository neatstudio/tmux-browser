import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createPreferenceStore } from "../../../../src/server/services/preferences/createPreferenceStore";

describe("createPreferenceStore", () => {
  it("persists favorite sessions to disk and normalizes names", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-preferences-"));
    const filePath = join(dir, "preferences.json");

    try {
      const store = createPreferenceStore({ filePath });

      await store.setPinnedSession("build", true);
      await store.setPinnedSession(" logs ", true);
      await store.setPinnedSession("build", true);

      expect(store.getPreferences()).toEqual({
        pinnedSessionNames: ["build", "logs"]
      });
      expect(JSON.parse(readFileSync(filePath, "utf8"))).toEqual({
        pinnedSessionNames: ["build", "logs"]
      });
      expect(createPreferenceStore({ filePath }).getPreferences()).toEqual({
        pinnedSessionNames: ["build", "logs"]
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renames and removes favorite sessions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-preferences-"));
    const filePath = join(dir, "preferences.json");

    try {
      const store = createPreferenceStore({ filePath });

      await store.setPinnedSession("build", true);
      await store.renameSession("build", "api");
      await store.setPinnedSession("api", false);

      expect(store.getPreferences()).toEqual({ pinnedSessionNames: [] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
