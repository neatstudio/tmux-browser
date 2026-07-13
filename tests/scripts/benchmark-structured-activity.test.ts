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
const harnessSource = readFileSync(
  resolve("tests/e2e/structured-activity-harness.ts"),
  "utf8"
);

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    targetCommit: "519ceee4e1e84480926f3b5b5de992ac88e51b9c",
    runnerFingerprint: "linux-x64-node22-chromium",
    evidence: "authoritative-ci",
    marks: {
      start: "pre-activity-action-center-control-start",
      interactive: "pre-activity-action-center-control-settled"
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

  it("requires authoritative evidence for CI comparison", () => {
    expect(() =>
      compareBenchmarkArtifacts(
        artifact({ evidence: "provisional-local" }),
        artifact(),
        { evidenceScope: "ci" }
      )
    ).toThrow("authoritative CI baseline required");
  });

  it("allows explicitly local comparison of matching provisional evidence", () => {
    expect(
      compareBenchmarkArtifacts(
        artifact({ evidence: "provisional-local" }),
        artifact({ evidence: "provisional-local" }),
        { evidenceScope: "local" }
      )
    ).toMatchObject({ passed: true });
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

  it("rejects candidate medians above the absolute 300ms ceiling", () => {
    expect(() =>
      compareBenchmarkArtifacts(
        artifact({ medianMs: 300 }),
        artifact({ medianMs: 301 })
      )
    ).toThrow("absolute 300ms ceiling");
  });

  it("accepts five warm runs within both budgets", () => {
    expect(
      compareBenchmarkArtifacts(artifact(), artifact({ medianMs: 125 }))
    ).toMatchObject({ passed: true, relativeRatio: 125 / 102 });
  });

  it("verifies a deterministic control response after the first dialog render", () => {
    expect(harnessSource).toContain('name: "Close action center"');
    expect(harnessSource).toContain("await dialog.waitFor({ state: \"hidden\" })");
    expect(harnessSource.indexOf("await dialog.waitFor()"))
      .toBeLessThan(harnessSource.indexOf("performance.mark(mark)"));
  });
});
