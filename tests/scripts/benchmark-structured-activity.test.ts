import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  compareBenchmarkArtifacts,
  parseBenchmarkArguments,
  terminateProcessTree,
  validateBenchmarkArtifact,
  validateFixture
} from "../../scripts/benchmark-structured-activity.mjs";

const fixtureText = readFileSync(
  resolve("tests/fixtures/structured-activity.json"),
  "utf8"
);
const fixture = JSON.parse(fixtureText);
const fixtureMetadata = {
  schemaVersion: "structured-activity/v1",
  sha256: "856e507a53e296d2971b246388ef0702ad013ecd6cf13b7a9d988c418eaf5335",
  records: 1000,
  toolChildren: 100,
  attention: 20,
  summaryCharacters: 160,
  detailBytes: 8192,
  recordsWithDetails: 100
};
const harnessSource = readFileSync(
  resolve("tests/e2e/structured-activity-harness.ts"),
  "utf8"
);
const benchmarkSource = readFileSync(
  resolve("scripts/benchmark-structured-activity.mjs"),
  "utf8"
);
const workflowSource = readFileSync(
  resolve(".github/workflows/structured-activity-benchmark.yml"),
  "utf8"
);
const checkedBaseline = JSON.parse(
  readFileSync(resolve("performance/structured-activity-baseline.json"), "utf8")
);
const checkedCandidate = JSON.parse(
  readFileSync(resolve("performance/structured-activity-candidate.json"), "utf8")
);

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    targetCommit: "519ceee4e1e84480926f3b5b5de992ac88e51b9c",
    runnerFingerprint: "linux-x64-node22-chromium",
    evidence: "authoritative-ci",
    fixture: fixtureMetadata,
    marks: {
      start: "pre-activity-action-center-open-start",
      interactive: "pre-activity-action-center-responsive-settled"
    },
    warmRunsMs: [100, 101, 102, 103, 104],
    medianMs: 102,
    ...overrides
  };
}

describe("structured activity benchmark", () => {
  it("replays the historical baseline with the trusted current runner", () => {
    const directory = mkdtempSync(join(tmpdir(), "structured-activity-history-test-"));
    const output = join(directory, "baseline.json");
    try {
      const env = { ...process.env };
      delete env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
      const result = spawnSync(
        process.execPath,
        [
          "--import", "tsx",
          "scripts/benchmark-structured-activity.mjs",
          "--mode", "baseline",
          "--target-commit", "519ceee4e1e84480926f3b5b5de992ac88e51b9c",
          "--output", output,
          "--evidence-scope", "local"
        ],
        { cwd: resolve("."), env, encoding: "utf8", timeout: 120_000 }
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const measured = validateBenchmarkArtifact(
        JSON.parse(readFileSync(output, "utf8"))
      );
      expect(measured.targetCommit).toBe(
        "519ceee4e1e84480926f3b5b5de992ac88e51b9c"
      );
      expect(measured.fixture).toEqual(fixtureMetadata);
      expect(measured.warmRunsMs).toHaveLength(5);
      expect(measured.warmRunsMs.every((value: number) => value > 0)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it("keeps checked provisional artifacts bound to the exact fixture", () => {
    expect(validateBenchmarkArtifact(checkedBaseline).fixture).toEqual(fixtureMetadata);
    expect(validateBenchmarkArtifact(checkedCandidate).fixture).toEqual(fixtureMetadata);
  });

  it("uses the fixed 1,000-record fixture", () => {
    expect(validateFixture(fixture, fixtureText)).toEqual({
      schemaVersion: "structured-activity/v1",
      sha256: "856e507a53e296d2971b246388ef0702ad013ecd6cf13b7a9d988c418eaf5335",
      records: 1000,
      toolChildren: 100,
      attention: 20,
      summaryCharacters: 160,
      detailBytes: 8192,
      recordsWithDetails: 100
    });
  });

  it("rejects fixture bytes that do not match the fixed schema hash", () => {
    expect(() => validateFixture(fixture, `${fixtureText} `)).toThrow("fixture sha256");
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
    expect(() =>
      compareBenchmarkArtifacts(
        artifact(),
        artifact({ evidence: "provisional-local" }),
        { evidenceScope: "ci" }
      )
    ).toThrow("authoritative CI candidate required");
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

  it("rejects baseline and candidate fixture metadata mismatches", () => {
    expect(() =>
      compareBenchmarkArtifacts(
        artifact(),
        artifact({
          fixture: { ...fixtureMetadata, schemaVersion: "structured-activity/v2" }
        })
      )
    ).toThrow("fixture");
  });

  it.each([
    ["null", null, "artifact must be an object"],
    ["schema", artifact({ schemaVersion: 2 }), "schemaVersion"],
    ["evidence", artifact({ evidence: "maybe" }), "evidence"],
    ["commit", artifact({ targetCommit: "" }), "targetCommit"],
    ["fingerprint", artifact({ runnerFingerprint: "" }), "runnerFingerprint"],
    ["fixture missing", artifact({ fixture: undefined }), "fixture"],
    [
      "fixture hash",
      artifact({ fixture: { ...fixtureMetadata, sha256: "0".repeat(64) } }),
      "fixture"
    ],
    ["marks", artifact({ marks: { start: "", interactive: "end" } }), "marks"],
    ["run count", artifact({ warmRunsMs: [1, 2, 3, 4] }), "warmRunsMs"],
    ["negative run", artifact({ warmRunsMs: [1, 2, -1, 4, 5] }), "warmRunsMs"],
    ["zero run", artifact({ warmRunsMs: [0, 1, 2, 3, 4], medianMs: 2 }), "warmRunsMs"],
    ["non-finite run", artifact({ warmRunsMs: [1, 2, Infinity, 4, 5] }), "warmRunsMs"],
    ["median mismatch", artifact({ medianMs: 999 }), "medianMs mismatch"]
  ])("rejects malformed artifact: %s", (_name, value, message) => {
    expect(typeof validateBenchmarkArtifact).toBe("function");
    expect(() => validateBenchmarkArtifact(value)).toThrow(message as string);
  });

  it("rejects zero baselines and candidates before ratio comparison", () => {
    const zero = artifact({ warmRunsMs: [0, 0, 0, 0, 0], medianMs: 0 });
    expect(() => compareBenchmarkArtifacts(zero, artifact())).toThrow("warmRunsMs");
    expect(() => compareBenchmarkArtifacts(artifact(), zero)).toThrow("warmRunsMs");
  });

  it("requires expected baseline and candidate commits", () => {
    expect(() =>
      compareBenchmarkArtifacts(artifact(), artifact(), {
        expectedBaselineCommit: "trusted-baseline",
        expectedCandidateCommit: artifact().targetCommit
      })
    ).toThrow("baseline targetCommit mismatch");
    expect(() =>
      compareBenchmarkArtifacts(artifact(), artifact(), {
        expectedBaselineCommit: artifact().targetCommit,
        expectedCandidateCommit: "trusted-candidate"
      })
    ).toThrow("candidate targetCommit mismatch");
  });

  it("rejects relative regressions above 1.25x", () => {
    expect(() =>
      compareBenchmarkArtifacts(
        artifact(),
        artifact({ warmRunsMs: [126, 127, 128, 129, 130], medianMs: 128 })
      )
    ).toThrow("1.25x");
  });

  it("rejects candidate medians above the absolute 300ms ceiling", () => {
    expect(() =>
      compareBenchmarkArtifacts(
        artifact({ warmRunsMs: [298, 299, 300, 301, 302], medianMs: 300 }),
        artifact({ warmRunsMs: [299, 300, 301, 302, 303], medianMs: 301 })
      )
    ).toThrow("absolute 300ms ceiling");
  });

  it("accepts five warm runs within both budgets", () => {
    expect(
      compareBenchmarkArtifacts(
        artifact(),
        artifact({ warmRunsMs: [123, 124, 125, 126, 127], medianMs: 125 })
      )
    ).toMatchObject({ passed: true, relativeRatio: 125 / 102 });
  });

  it("measures open, render, and a deterministic responsive control click", () => {
    expect(harnessSource).toContain('name: "Close action center"');
    expect(harnessSource).toContain("await dialog.waitFor({ state: \"hidden\" })");
    const startMark = harnessSource.indexOf("performance.mark(mark)");
    const openClick = harnessSource.indexOf("await actions.click()");
    const dialogRender = harnessSource.indexOf("await dialog.waitFor()");
    const responseClick = harnessSource.indexOf("await close.click()");
    const hidden = harnessSource.indexOf('await dialog.waitFor({ state: "hidden" })');
    const endMark = harnessSource.indexOf("performance.mark(interactive)");

    expect(startMark).toBeLessThan(openClick);
    expect(openClick).toBeLessThan(dialogRender);
    expect(dialogRender).toBeLessThan(responseClick);
    expect(responseClick).toBeLessThan(hidden);
    expect(hidden).toBeLessThan(endMark);
  });

  it("terminates the server process group before cleanup with escalation", async () => {
    const calls: string[] = [];
    const child = { pid: 123, exitCode: null };
    let waits = 0;
    await terminateProcessTree(child, {
      platform: "linux",
      killGroup: (_pid: number, signal: string) => calls.push(signal),
      waitForExit: async () => {
        calls.push("wait");
        waits += 1;
        return waits === 2;
      },
      timeoutMs: 1
    });
    expect(calls).toEqual(["SIGTERM", "wait", "SIGKILL", "wait"]);
    expect(benchmarkSource.indexOf("await terminateProcessTree(server)"))
      .toBeLessThan(benchmarkSource.indexOf('spawnSync("git", ["worktree", "remove"'));
  });

  it("launches the deterministic Vite harness for isolated commit measurements", () => {
    expect(benchmarkSource).toMatch(
      /server = spawn\("npm", \["run", "dev:client", "--", "--host", "127\.0\.0\.1", "--port", String\(port\)\], \{/
    );
    expect(benchmarkSource).toContain("injectBenchmarkHarness(worktree, fixture)");
    expect(benchmarkSource).toContain('import { renderActionCenterPanel } from "/src/client/render/actionCenter.ts"');
    expect(benchmarkSource).toContain("items: legacyItems");
    expect(benchmarkSource).toContain("structuredItems,");
    expect(benchmarkSource).not.toContain("/tests/e2e/structured-event-panel-harness.html");
  });

  it("selects authoritative baseline only from a trusted repository variable", () => {
    expect(workflowSource).toContain("vars.STRUCTURED_ACTIVITY_BASELINE_SHA");
    expect(workflowSource).toContain("git cat-file -e");
    expect(workflowSource).not.toContain("jq -r .targetCommit performance/");
    expect(workflowSource).toContain("generated baseline targetCommit mismatch");
  });
});
