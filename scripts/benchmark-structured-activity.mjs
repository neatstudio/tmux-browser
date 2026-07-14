#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

import { runStructuredActivityHarness } from "../tests/e2e/structured-activity-harness.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = join(root, "performance", "structured-activity-baseline.json");
const FIXTURE_SCHEMA_VERSION = "structured-activity/v1";
const FIXTURE_SHA256 = "856e507a53e296d2971b246388ef0702ad013ecd6cf13b7a9d988c418eaf5335";
const EXPECTED_FIXTURE_METADATA = {
  schemaVersion: FIXTURE_SCHEMA_VERSION,
  sha256: FIXTURE_SHA256,
  records: 1000,
  toolChildren: 100,
  attention: 20,
  summaryCharacters: 160,
  detailBytes: 8192,
  recordsWithDetails: 100
};

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

export function validateFixture(fixture, fixtureSource) {
  if (!Array.isArray(fixture) || fixture.length !== 1000) {
    throw new Error("fixture must contain exactly 1000 records");
  }
  if (typeof fixtureSource !== "string") throw new Error("fixture source is required");
  const sha256 = createHash("sha256").update(fixtureSource).digest("hex");
  if (sha256 !== FIXTURE_SHA256) throw new Error("fixture sha256 mismatch");
  const summaryLengths = new Set(fixture.map((record) => record.summary.length));
  const details = fixture.filter((record) => record.details !== null);
  const result = {
    schemaVersion: FIXTURE_SCHEMA_VERSION,
    sha256,
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
    ...EXPECTED_FIXTURE_METADATA
  });
  if (JSON.stringify(result) !== expected) throw new Error("fixture shape is invalid");
  if (fixture.some((record, index) => (record.details !== null) !== (index % 10 === 0))) {
    throw new Error("fixture details cadence is invalid");
  }
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
  if (JSON.stringify(artifact.fixture) !== JSON.stringify(EXPECTED_FIXTURE_METADATA)) {
    throw new Error("fixture metadata mismatch");
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

function injectBenchmarkHarness(worktree, fixture) {
  const htmlPath = join(worktree, "structured-activity-benchmark.html");
  const scriptPath = join(worktree, "structured-activity-benchmark.js");
  writeFileSync(
    htmlPath,
    '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><button id="open-panel" type="button">Actions</button><main id="panel-root"></main><script type="module" src="/structured-activity-benchmark.js"></script></body></html>\n',
    "utf8"
  );
  writeFileSync(
    scriptPath,
    `import "/src/client/styles.css";
import { renderActionCenterPanel } from "/src/client/render/actionCenter.ts";

const fixture = ${JSON.stringify(fixture)};
const legacyItems = fixture.map((record, index) => ({
  type: "hook-event",
  id: \`legacy-\${record.id}\`,
  sessionName: "benchmark",
  source: "benchmark-fixture",
  eventType: record.type,
  status: record.status ?? "complete",
  title: record.title ?? \`Activity \${index}\`,
  body: record.summary,
  content: [
    { type: "summary", text: record.summary },
    ...(record.details === null ? [] : [{ type: "details", title: "Details", text: record.details }])
  ],
  taskId: null,
  target: { sessionName: "benchmark", projectName: null, view: "terminal" },
  actions: []
}));
const structuredItems = fixture.map((record, index) => ({
  id: record.id,
  kind: record.type === "hook-event" ? "hook" : "conversation",
  sessionName: "benchmark",
  title: record.title ?? \`Activity \${index}\`,
  summary: record.summary,
  summarySource: "producer",
  status: record.status ?? "complete",
  severity: record.severity ?? "info",
  attentionRequired: record.attention === true,
  role: record.role ?? null,
  toolName: record.toolName ?? null,
  parentId: record.parentMessageId,
  messageKey: record.id,
  parentMessageKey: record.parentMessageId,
  details: record.details === null ? [] : [{
    type: "details",
    title: "Details",
    collapsed: true,
    materialize: () => record.details
  }],
  actions: [],
  stats: {},
  createdAt: record.createdAt ?? "2026-07-14T00:00:00.000Z"
}));
const root = document.querySelector("#panel-root");
let open = false;
function render() {
  renderActionCenterPanel(root, {
    open,
    items: legacyItems,
    structuredItems,
    activeTab: "activity",
    expandedIds: new Set(),
    selectedEventId: null,
    loading: false,
    error: null,
    onTabChange: () => {},
    onToggleExpanded: () => {},
    onClose: () => { open = false; render(); },
    onOpenSession: () => {},
    onDismissPrompt: () => {},
    onSendPrompt: () => {},
    onRunHookAction: () => {}
  });
}
document.querySelector("#open-panel").addEventListener("click", () => {
  open = true;
  render();
});
render();
`,
    "utf8"
  );
  return "/structured-activity-benchmark.html";
}

async function withTargetServer(targetCommit, fixture, callback) {
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
    const harnessPath = injectBenchmarkHarness(worktree, fixture);
    const port = await freePort();
    server = spawn("npm", ["run", "dev:client", "--", "--host", "127.0.0.1", "--port", String(port)], {
      cwd: worktree,
      env: process.env,
      stdio: "inherit",
      detached: process.platform !== "win32"
    });
    const url = `http://127.0.0.1:${port}`;
    await waitForServer(`${url}${harnessPath}`, server);
    return await callback(`${url}${harnessPath}`);
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
  const fixtureSource = readFileSync(
    join(root, "tests/fixtures/structured-activity.json"),
    "utf8"
  );
  const fixture = JSON.parse(fixtureSource);
  const fixtureMetadata = validateFixture(fixture, fixtureSource);
  const runAt = async (targetUrl) => {
    const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    const browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        (existsSync(localChrome) ? localChrome : undefined)
    });
    try {
      const warmRunsMs = await runStructuredActivityHarness(browser, targetUrl, fixture);
      const artifact = {
        schemaVersion: 1,
        targetCommit: options.targetCommit,
        evidence:
          options.evidenceScope === "ci" ? "authoritative-ci" : "provisional-local",
        runnerFingerprint: runnerFingerprint(browser.version()),
        fixture: fixtureMetadata,
        marks: {
          start: "pre-activity-action-center-open-start",
          interactive: "pre-activity-action-center-responsive-settled"
        },
        note: "Trusted runner injects a version-neutral harness into the target checkout, passes 1,000 legacy and 1,000 structured fixture equivalents to that checkout's renderer, verifies exactly one render mode, then measures open through responsive close.",
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
    : await withTargetServer(options.targetCommit, fixture, runAt);
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
