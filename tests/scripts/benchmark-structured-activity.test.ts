import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareBenchmarkArtifacts,
  parseBenchmarkArguments,
  terminateProcessTree,
  validateBenchmarkArtifact,
  validateFixture
} from "../../scripts/benchmark-structured-activity.mjs";

const fixture = JSON.parse(
  readFileSync(resolve("tests/fixtures/structured-activity.json"), "utf8")
);
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

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    targetCommit: "519ceee4e1e84480926f3b5b5de992ac88e51b9c",
    runnerFingerprint: "linux-x64-node22-chromium",
    evidence: "authoritative-ci",
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

  it.each([
    ["null", null, "artifact must be an object"],
    ["schema", artifact({ schemaVersion: 2 }), "schemaVersion"],
    ["evidence", artifact({ evidence: "maybe" }), "evidence"],
    ["commit", artifact({ targetCommit: "" }), "targetCommit"],
    ["fingerprint", artifact({ runnerFingerprint: "" }), "runnerFingerprint"],
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
    expect(benchmarkSource).toContain("await waitForServer(`${url}/tests/e2e/structured-event-panel-harness.html`, server)");
    expect(benchmarkSource).toMatch(
      /return await callback\(\s*`\$\{url\}\/tests\/e2e\/structured-event-panel-harness\.html\?benchmark`\s*\)/
    );
  });

  it("selects authoritative baseline only from a trusted repository variable", () => {
    expect(workflowSource).toContain("vars.STRUCTURED_ACTIVITY_BASELINE_SHA");
    expect(workflowSource).toContain("git cat-file -e");
    expect(workflowSource).not.toContain("jq -r .targetCommit performance/");
    expect(workflowSource).toContain("generated baseline targetCommit mismatch");
  });
});
