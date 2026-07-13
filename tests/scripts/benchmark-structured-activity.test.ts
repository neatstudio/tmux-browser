import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareBenchmarkArtifacts,
  parseBenchmarkArguments,
  validateFixture
} from "../../scripts/benchmark-structured-activity.mjs";

const fixture = JSON.parse(
  readFileSync(resolve("tests/fixtures/structured-activity.json"), "utf8")
);

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    targetCommit: "519ceee4e1e84480926f3b5b5de992ac88e51b9c",
    runnerFingerprint: "linux-x64-node22-chromium",
    marks: {
      start: "pre-activity-action-center-open-start",
      interactive: "pre-activity-action-center-interactive"
    },
    warmRunsMs: [100, 101, 102, 103, 104],
    medianMs: 102,
    ...overrides
  };
}

describe("structured activity benchmark", () => {
  it("uses the fixed 1,000-record fixture", () => {
    expect(validateFixture(fixture)).toEqual({
      records: 1000,
      toolChildren: 100,
      attention: 20,
      summaryCharacters: 160,
      detailBytes: 8192,
      recordsWithDetails: 100
    });
  });

  it("requires an explicit target commit in baseline mode", () => {
    expect(() => parseBenchmarkArguments(["--mode", "baseline"])).toThrow(
      "--target-commit is required"
    );
  });

  it("requires a baseline artifact in compare mode", () => {
    expect(() =>
      parseBenchmarkArguments([
        "--mode",
        "compare",
        "--target-commit",
        "abc123"
      ])
    ).toThrow("--baseline is required");
  });

  it("rejects runner fingerprint mismatches", () => {
    expect(() =>
      compareBenchmarkArtifacts(
        artifact(),
        artifact({ runnerFingerprint: "darwin-arm64-node22-chromium" })
      )
    ).toThrow("runner fingerprint mismatch");
  });

  it("rejects relative regressions above 1.25x", () => {
    expect(() =>
      compareBenchmarkArtifacts(artifact(), artifact({ medianMs: 128 }))
    ).toThrow("1.25x");
  });

  it("rejects absolute regressions above 300ms", () => {
    expect(() =>
      compareBenchmarkArtifacts(
        artifact({ medianMs: 1500 }),
        artifact({ medianMs: 1801 })
      )
    ).toThrow("300ms");
  });

  it("accepts five warm runs within both budgets", () => {
    expect(
      compareBenchmarkArtifacts(artifact(), artifact({ medianMs: 125 }))
    ).toMatchObject({ relativeRatio: 125 / 102, absoluteDeltaMs: 23 });
  });
});
