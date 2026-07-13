#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

import { runStructuredActivityHarness } from "../tests/e2e/structured-activity-harness.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = join(root, "performance", "structured-activity-baseline.json");

export function parseBenchmarkArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument: ${flag ?? ""}`);
    }
    values.set(flag.slice(2), value);
  }
  const mode = values.get("mode");
  if (mode !== "baseline" && mode !== "compare") {
    throw new Error("--mode must be baseline or compare");
  }
  const targetCommit = values.get("target-commit");
  if (!targetCommit) throw new Error("--target-commit is required");
  if (mode === "compare" && !values.get("baseline")) {
    throw new Error("--baseline is required in compare mode");
  }
  return {
    mode,
    targetCommit,
    targetUrl: values.get("target-url") ?? null,
    baseline: values.get("baseline") ?? null,
    output: values.get("output") ?? DEFAULT_OUTPUT,
    report: values.get("report") ?? null,
    evidenceScope: values.get("evidence-scope") ?? "local",
    expectedBaselineCommit: values.get("expected-baseline-commit") ?? null
  };
}

export function validateFixture(fixture) {
  if (!Array.isArray(fixture) || fixture.length !== 1000) {
    throw new Error("fixture must contain exactly 1000 records");
  }
  const summaryLengths = new Set(fixture.map((record) => record.summary.length));
  const details = fixture.filter((record) => record.details !== null);
  const result = {
    records: fixture.length,
    toolChildren: fixture.filter((record) => record.parentMessageId !== null).length,
    attention: fixture.filter((record) => record.attention === true).length,
    summaryCharacters: summaryLengths.size === 1 ? [...summaryLengths][0] : -1,
    detailBytes: details.length
      ? Buffer.byteLength(details[0].details, "utf8")
      : 0,
    recordsWithDetails: details.length
  };
  const expected = JSON.stringify({
    records: 1000,
    toolChildren: 100,
    attention: 20,
    summaryCharacters: 160,
    detailBytes: 8192,
    recordsWithDetails: 100
  });
  if (JSON.stringify(result) !== expected) throw new Error("fixture shape is invalid");
  if (details.some((record) => Buffer.byteLength(record.details, "utf8") !== 8192)) {
    throw new Error("fixture detail payload must be exactly 8 KiB");
  }
  return result;
}

function median(values) {
  return [...values].sort((left, right) => left - right)[2];
}

export function validateBenchmarkArtifact(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error("artifact must be an object");
  }
  if (artifact.schemaVersion !== 1) throw new Error("invalid schemaVersion");
  if (!new Set(["provisional-local", "authoritative-ci"]).has(artifact.evidence)) {
    throw new Error("invalid evidence");
  }
  if (typeof artifact.targetCommit !== "string" || !/^[0-9a-f]{40}$/.test(artifact.targetCommit)) {
    throw new Error("invalid targetCommit");
  }
  if (typeof artifact.runnerFingerprint !== "string" || artifact.runnerFingerprint.length === 0) {
    throw new Error("invalid runnerFingerprint");
  }
  if (
    !artifact.marks ||
    typeof artifact.marks !== "object" ||
    typeof artifact.marks.start !== "string" ||
    artifact.marks.start.length === 0 ||
    typeof artifact.marks.interactive !== "string" ||
    artifact.marks.interactive.length === 0
  ) {
    throw new Error("invalid marks");
  }
  if (
    !Array.isArray(artifact.warmRunsMs) ||
    artifact.warmRunsMs.length !== 5 ||
    artifact.warmRunsMs.some(
      (value) => typeof value !== "number" || !Number.isFinite(value) || value <= 0
    )
  ) {
    throw new Error("invalid warmRunsMs");
  }
  if (
    typeof artifact.medianMs !== "number" ||
    !Number.isFinite(artifact.medianMs) ||
    artifact.medianMs <= 0 ||
    artifact.medianMs !== median(artifact.warmRunsMs)
  ) {
    throw new Error("medianMs mismatch");
  }
  return artifact;
}

export function compareBenchmarkArtifacts(
  baseline,
  candidate,
  {
    evidenceScope = "local",
    expectedBaselineCommit = null,
    expectedCandidateCommit = null
  } = {}
) {
  validateBenchmarkArtifact(baseline);
  validateBenchmarkArtifact(candidate);
  if (evidenceScope === "ci" && baseline.evidence !== "authoritative-ci") {
    throw new Error("authoritative CI baseline required");
  }
  if (evidenceScope === "ci" && candidate.evidence !== "authoritative-ci") {
    throw new Error("authoritative CI candidate required");
  }
  if (expectedBaselineCommit && baseline.targetCommit !== expectedBaselineCommit) {
    throw new Error("baseline targetCommit mismatch");
  }
  if (expectedCandidateCommit && candidate.targetCommit !== expectedCandidateCommit) {
    throw new Error("candidate targetCommit mismatch");
  }
  if (baseline.runnerFingerprint !== candidate.runnerFingerprint) {
    throw new Error("runner fingerprint mismatch");
  }
  if (candidate.warmRunsMs?.length !== 5) throw new Error("five warm runs required");
  const relativeRatio = candidate.medianMs / baseline.medianMs;
  if (relativeRatio > 1.25) throw new Error("benchmark exceeds 1.25x baseline");
  if (candidate.medianMs > 300) {
    throw new Error("benchmark exceeds absolute 300ms ceiling");
  }
  return { passed: true, relativeRatio, candidateMedianMs: candidate.medianMs };
}

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitForServer(url, processHandle) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (processHandle.exitCode !== null) throw new Error("target server exited early");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`target server did not become ready: ${url}`);
}

async function defaultWaitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true;
  return await new Promise((resolveExit) => {
    const timer = setTimeout(() => resolveExit(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveExit(true);
    });
  });
}

export async function terminateProcessTree(child, overrides = {}) {
  if (!child || child.exitCode !== null || !child.pid) return;
  const platform = overrides.platform ?? process.platform;
  const timeoutMs = overrides.timeoutMs ?? 5000;
  const killGroup =
    overrides.killGroup ??
    ((pid, signal) => {
      if (platform === "win32") child.kill(signal);
      else process.kill(-pid, signal);
    });
  const waitForExit = overrides.waitForExit ?? defaultWaitForExit;
  try {
    killGroup(child.pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
    return;
  }
  if (await waitForExit(child, timeoutMs)) return;
  try {
    killGroup(child.pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
    return;
  }
  if (!(await waitForExit(child, timeoutMs))) {
    throw new Error("target server process group did not exit after SIGKILL");
  }
}

async function withTargetServer(targetCommit, callback) {
  const directory = mkdtempSync(join(tmpdir(), "tmux-ui-activity-baseline-"));
  const worktree = join(directory, "checkout");
  let server;
  try {
    const add = spawnSync("git", ["worktree", "add", "--detach", worktree, targetCommit], {
      cwd: root,
      encoding: "utf8"
    });
    if (add.status !== 0) throw new Error(add.stderr || "git worktree add failed");
    for (const command of [["npm", ["ci"]], ["npm", ["run", "build"]]]) {
      const result = spawnSync(command[0], command[1], { cwd: worktree, stdio: "inherit" });
      if (result.status !== 0) throw new Error(`${command[0]} ${command[1].join(" ")} failed`);
    }
    const port = await freePort();
    server = spawn("npm", ["run", "dev:client", "--", "--host", "127.0.0.1", "--port", String(port)], {
      cwd: worktree,
      env: process.env,
      stdio: "inherit",
      detached: process.platform !== "win32"
    });
    const url = `http://127.0.0.1:${port}`;
    await waitForServer(`${url}/tests/e2e/structured-event-panel-harness.html`, server);
    return await callback(
      `${url}/tests/e2e/structured-event-panel-harness.html?benchmark`
    );
  } finally {
    await terminateProcessTree(server);
    spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: root });
    rmSync(directory, { recursive: true, force: true });
  }
}

function runnerFingerprint(browserVersion) {
  return `${process.platform}-${process.arch}-node${process.versions.node}-${browserVersion}`;
}

async function benchmark(options) {
  if (!new Set(["local", "ci"]).has(options.evidenceScope)) {
    throw new Error("--evidence-scope must be local or ci");
  }
  if (options.evidenceScope === "ci" && process.env.GITHUB_ACTIONS !== "true") {
    throw new Error("authoritative CI evidence can only be generated in GitHub Actions");
  }
  const fixture = JSON.parse(readFileSync(join(root, "tests/fixtures/structured-activity.json"), "utf8"));
  validateFixture(fixture);
  const runAt = async (targetUrl) => {
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    });
    try {
      const warmRunsMs = await runStructuredActivityHarness(browser, targetUrl, fixture);
      const artifact = {
        schemaVersion: 1,
        targetCommit: options.targetCommit,
        evidence:
          options.evidenceScope === "ci" ? "authoritative-ci" : "provisional-local",
        runnerFingerprint: runnerFingerprint(browser.version()),
        marks: {
          start: "pre-activity-action-center-open-start",
          interactive: "pre-activity-action-center-responsive-settled"
        },
        note: "Activity comparator: inject the 1,000-record fixture into the deterministic structured-panel harness, open the unified Activity panel, close it, and wait until the dialog is absent.",
        capturedAt: new Date().toISOString(),
        warmRunsMs,
        medianMs: median(warmRunsMs)
      };
      return validateBenchmarkArtifact(artifact);
    } finally {
      await browser.close();
    }
  };
  const artifact = options.targetUrl
    ? await runAt(options.targetUrl)
    : await withTargetServer(options.targetCommit, runAt);
  mkdirSync(dirname(resolve(options.output)), { recursive: true });
  writeFileSync(resolve(options.output), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  if (options.mode === "compare") {
    const baseline = JSON.parse(readFileSync(resolve(options.baseline), "utf8"));
    const report = compareBenchmarkArtifacts(baseline, artifact, {
      evidenceScope: options.evidenceScope,
      expectedBaselineCommit: options.expectedBaselineCommit,
      expectedCandidateCommit: options.targetCommit
    });
    if (options.report) {
      mkdirSync(dirname(resolve(options.report)), { recursive: true });
      writeFileSync(resolve(options.report), `${JSON.stringify(report, null, 2)}\n`);
    }
  }
  console.log(JSON.stringify(artifact, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  benchmark(parseBenchmarkArguments(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
