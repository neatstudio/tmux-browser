import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const tempDirectories: string[] = [];

function checkManifest(manifest: unknown) {
  const directory = mkdtempSync(join(tmpdir(), "structured-events-compat-"));
  const manifestPath = join(directory, "compat.json");
  tempDirectories.push(directory);
  writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

  return spawnSync(
    process.execPath,
    ["scripts/check-structured-events-compat.mjs", manifestPath],
    { encoding: "utf8" }
  );
}

function readyEntry(id: string) {
  return {
    id,
    owner: "release-engineering",
    minimumCompatibleVersion: "1.2.3",
    compatible: true
  };
}

afterEach(() => {
  tempDirectories.splice(0).forEach((directory) =>
    rmSync(directory, { recursive: true, force: true })
  );
});

describe("structured events compatibility gate", () => {
  it("accepts registered compatible decoders and streaming producers", () => {
    const result = checkManifest({
      strictDecoders: { entries: [readyEntry("android-client")] },
      repeatedMessageStreamingProducers: {
        entries: [readyEntry("agent-stream")]
      }
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Structured events compatibility gate passed");
  });

  it.each([
    ["missing id", { ...readyEntry("decoder"), id: "" }],
    ["missing owner", { ...readyEntry("decoder"), owner: "" }],
    [
      "missing minimum version",
      { ...readyEntry("decoder"), minimumCompatibleVersion: "" }
    ],
    ["not compatible", { ...readyEntry("decoder"), compatible: false }]
  ])("rejects a registered entry with %s", (_name, entry) => {
    const result = checkManifest({
      strictDecoders: { entries: [entry] },
      repeatedMessageStreamingProducers: { entries: [readyEntry("producer")] }
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("strictDecoders.entries[0]");
  });

  it.each(["0.0.0", "1.2.3", "12.34.56"])(
    "accepts minimum compatible version %s",
    (minimumCompatibleVersion) => {
      const result = checkManifest({
        strictDecoders: {
          entries: [{ ...readyEntry("decoder"), minimumCompatibleVersion }]
        },
        repeatedMessageStreamingProducers: {
          entries: [readyEntry("producer")]
        }
      });

      expect(result.status).toBe(0);
    }
  );

  it.each(["TBD", "latest", "1.2", " 1.2.3 ", "01.2.3", "1.02.3", "1.2.03"])(
    "rejects invalid minimum compatible version %s",
    (minimumCompatibleVersion) => {
      const result = checkManifest({
        strictDecoders: {
          entries: [{ ...readyEntry("decoder"), minimumCompatibleVersion }]
        },
        repeatedMessageStreamingProducers: {
          entries: [readyEntry("producer")]
        }
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "strictDecoders.entries[0].minimumCompatibleVersion"
      );
    }
  );

  it("rejects duplicate ids within one category", () => {
    const result = checkManifest({
      strictDecoders: {
        entries: [readyEntry("duplicate"), readyEntry("duplicate")]
      },
      repeatedMessageStreamingProducers: {
        entries: [readyEntry("producer")]
      }
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('duplicate entry id "duplicate"');
  });

  it("rejects duplicate ids across categories", () => {
    const result = checkManifest({
      strictDecoders: { entries: [readyEntry("shared-id")] },
      repeatedMessageStreamingProducers: {
        entries: [readyEntry("shared-id")]
      }
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('duplicate entry id "shared-id"');
  });

  it("rejects malformed JSON deterministically", () => {
    const directory = mkdtempSync(join(tmpdir(), "structured-events-compat-"));
    const manifestPath = join(directory, "compat.json");
    tempDirectories.push(directory);
    writeFileSync(manifestPath, "{", "utf8");

    const result = spawnSync(
      process.execPath,
      ["scripts/check-structured-events-compat.mjs", manifestPath],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid compatibility manifest JSON");
  });

  it("allows an empty category only with an ISO audit date and owner", () => {
    const valid = checkManifest({
      strictDecoders: {
        entries: [],
        auditedAt: "2026-07-14",
        owner: "release-engineering"
      },
      repeatedMessageStreamingProducers: {
        entries: [],
        auditedAt: "2026-07-14",
        owner: "release-engineering"
      }
    });
    const invalid = checkManifest({
      strictDecoders: { entries: [], auditedAt: "yesterday", owner: "" },
      repeatedMessageStreamingProducers: {
        entries: [],
        auditedAt: "2026-07-14",
        owner: "release-engineering"
      }
    });

    expect(valid.status).toBe(0);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain("strictDecoders");
  });

  it("publish ignores a manifest environment override and checks canonical config", () => {
    const directory = mkdtempSync(join(tmpdir(), "structured-events-compat-"));
    const scriptsDirectory = join(directory, "scripts");
    const configDirectory = join(directory, "config");
    const readyManifestPath = join(directory, "ready.json");
    tempDirectories.push(directory);
    mkdirSync(scriptsDirectory);
    mkdirSync(configDirectory);
    copyFileSync("scripts/publish-run.mjs", join(scriptsDirectory, "publish-run.mjs"));
    copyFileSync(
      "scripts/check-structured-events-compat.mjs",
      join(scriptsDirectory, "check-structured-events-compat.mjs")
    );
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({
        type: "module",
        scripts: {
          "check:structured-events-compat":
            "node scripts/check-structured-events-compat.mjs"
        }
      }),
      "utf8"
    );
    writeFileSync(
      join(configDirectory, "structured-events-compat.json"),
      JSON.stringify({}),
      "utf8"
    );
    writeFileSync(
      readyManifestPath,
      JSON.stringify({
        strictDecoders: { entries: [readyEntry("decoder")] },
        repeatedMessageStreamingProducers: {
          entries: [readyEntry("producer")]
        }
      }),
      "utf8"
    );

    const result = spawnSync(
      process.execPath,
      [
        join(scriptsDirectory, "publish-run.mjs"),
        "--target",
        "unused-host:/tmp/tmux-ui",
        "--run-file",
        join(directory, "missing.run")
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          STRUCTURED_EVENTS_COMPAT_MANIFEST: readyManifestPath
        }
      }
    );

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "Structured events compatibility gate failed"
    );
    expect(result.stdout + result.stderr).not.toContain("Run file not found");
    expect(result.stdout + result.stderr).not.toContain("Could not resolve hostname");
  });
});
