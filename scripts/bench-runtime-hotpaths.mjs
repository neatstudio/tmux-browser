#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULTS = {
  runs: 7,
  apiRuns: 30,
  apiConcurrency: 30,
  idleSeconds: 30
};

const API_TARGETS = [
  { name: "health", path: "/api/health" },
  { name: "sessions", path: "/api/sessions" },
  { name: "sessions-all", path: "/api/sessions-all" },
  { name: "sessions-panes", path: "/api/sessions-panes" },
  { name: "kanban-projects", path: "/api/kanban/projects" }
];

export function summarizeSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("samples must contain at least one value");
  }
  if (samples.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("samples must contain only finite numbers");
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const percentile = (value) => sorted[Math.ceil(sorted.length * value) - 1];
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted.at(-1),
    avg: samples.reduce((total, value) => total + value, 0) / samples.length,
    p50: percentile(0.5),
    p95: percentile(0.95)
  };
}

export function compareRelativeBudget(baseline, candidate, maxRatio) {
  if (typeof baseline !== "number" || !Number.isFinite(baseline) || baseline <= 0) {
    throw new Error("baseline must be a positive finite number");
  }
  if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < 0) {
    throw new Error("candidate must be a non-negative finite number");
  }
  if (typeof maxRatio !== "number" || !Number.isFinite(maxRatio) || maxRatio <= 0) {
    throw new Error("maxRatio must be a positive finite number");
  }
  const ratio = candidate / baseline;
  const reportedRatio = Number(ratio.toFixed(12));
  return {
    baseline,
    candidate,
    maxRatio,
    ratio: reportedRatio,
    percentChange: Number(((reportedRatio - 1) * 100).toFixed(10)),
    withinBudget: ratio <= maxRatio
  };
}

export function summarizeMutations(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("mutation samples must contain at least one value");
  }
  const fields = ["total", "childList", "attributes", "characterData"];
  if (
    samples.some((sample) =>
      fields.some(
        (field) =>
          typeof sample?.[field] !== "number" ||
          !Number.isFinite(sample[field]) ||
          sample[field] < 0
      )
    )
  ) {
    throw new Error("mutation samples must contain non-negative finite counts");
  }
  return {
    runs: samples.length,
    noOpRuns: samples.filter((sample) => sample.total === 0).length,
    noOpRate: samples.filter((sample) => sample.total === 0).length / samples.length,
    totals: Object.fromEntries(
      fields.map((field) => [
        field,
        samples.reduce((total, sample) => total + sample[field], 0)
      ])
    ),
    perRun: summarizeSamples(samples.map((sample) => sample.total))
  };
}

function integerOption(flag, value, { allowZero = false } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new Error(`${flag} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }
  return parsed;
}

export function parseCliOptions(args) {
  const [urlValue, ...rest] = args;
  if (!urlValue || urlValue.startsWith("--")) throw new Error("URL is required");
  let parsedUrl;
  try {
    parsedUrl = new URL(urlValue);
  } catch {
    throw new Error("URL must be a valid http or https URL");
  }
  if (!new Set(["http:", "https:"]).has(parsedUrl.protocol)) {
    throw new Error("URL must be a valid http or https URL");
  }
  const values = new Map();
  const allowed = new Set([
    "expect-commit",
    "runs",
    "api-runs",
    "api-concurrency",
    "idle-seconds",
    "output"
  ]);
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid option: ${flag ?? ""}`);
    }
    const key = flag.slice(2);
    if (!allowed.has(key)) throw new Error(`Unknown option: ${flag}`);
    if (values.has(key)) throw new Error(`Duplicate option: ${flag}`);
    values.set(key, value);
  }
  const expectCommit = values.get("expect-commit");
  if (!expectCommit) throw new Error("--expect-commit is required");
  if (!/^[0-9a-f]{7,40}$/i.test(expectCommit)) {
    throw new Error("--expect-commit must be a 7 to 40 character hexadecimal SHA");
  }
  const normalizedUrl = parsedUrl.href.replace(/\/$/, "");
  return {
    url: normalizedUrl,
    expectCommit,
    runs: integerOption("--runs", values.get("runs") ?? DEFAULTS.runs),
    apiRuns: integerOption("--api-runs", values.get("api-runs") ?? DEFAULTS.apiRuns),
    apiConcurrency: integerOption(
      "--api-concurrency",
      values.get("api-concurrency") ?? DEFAULTS.apiConcurrency
    ),
    idleSeconds: integerOption(
      "--idle-seconds",
      values.get("idle-seconds") ?? DEFAULTS.idleSeconds,
      { allowZero: true }
    ),
    output: values.get("output") ?? null
  };
}

function targetUrl(baseUrl, path) {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  url.search = "";
  url.hash = "";
  return url.href;
}

export async function timedFetch(baseUrl, target, { requireOk = true } = {}) {
  const startedAt = performance.now();
  const response = await fetch(targetUrl(baseUrl, target));
  const body = await response.text();
  const result = {
    durationMs: performance.now() - startedAt,
    status: response.status,
    ok: response.ok,
    bytes: Buffer.byteLength(body)
  };
  if (requireOk && !response.ok) {
    throw new Error(`GET ${target} returned ${response.status}: ${body.slice(0, 200)}`);
  }
  return { ...result, body };
}

export function summarizeFetches(samples) {
  const successful = samples.filter((sample) => sample.ok);
  return {
    durationsMs: successful.length
      ? summarizeSamples(successful.map((sample) => sample.durationMs))
      : null,
    bytes: successful.length
      ? summarizeSamples(successful.map((sample) => sample.bytes))
      : null,
    allOk: successful.length === samples.length,
    successCount: successful.length,
    failureCount: samples.length - successful.length,
    statuses: [...new Set(samples.map((sample) => sample.status))]
  };
}

async function collectApiMetrics(baseUrl, firstSessionName, apiRuns, apiConcurrency) {
  const targets = [...API_TARGETS];
  if (firstSessionName) {
    targets.push({
      name: "first-session-status",
      path: `/api/sessions/${encodeURIComponent(firstSessionName)}/status`
    });
  }
  const metrics = {};
  for (const target of targets) {
    const sequential = [];
    for (let index = 0; index < apiRuns; index += 1) {
      const { body: _body, ...sample } = await timedFetch(baseUrl, target.path, {
        requireOk: false
      });
      sequential.push(sample);
    }
    const concurrent = await Promise.all(
      Array.from({ length: apiConcurrency }, async () => {
        const { body: _body, ...sample } = await timedFetch(baseUrl, target.path, {
          requireOk: false
        });
        return sample;
      })
    );
    metrics[target.name] = {
      path: target.path,
      sequential: { raw: sequential, summary: summarizeFetches(sequential) },
      concurrent: {
        concurrency: apiConcurrency,
        raw: concurrent,
        summary: summarizeFetches(concurrent)
      }
    };
  }
  if (!firstSessionName) {
    metrics["first-session-status"] = {
      supported: false,
      error: "No tmux session was returned by /api/sessions"
    };
  }
  return metrics;
}

async function collectNoOpResizeMutations(page) {
  await page.evaluate(() => {
    const counts = { total: 0, childList: 0, attributes: 0, characterData: 0 };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        counts.total += 1;
        counts[record.type] += 1;
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    });
    window.__runtimeHotpathMutationProbe = { counts, observer };
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.evaluate(() => new Promise((resolveWait) =>
    requestAnimationFrame(() => requestAnimationFrame(resolveWait))
  ));
  await page.waitForTimeout(100);
  return await page.evaluate(() => {
    const probe = window.__runtimeHotpathMutationProbe;
    probe.observer.disconnect();
    delete window.__runtimeHotpathMutationProbe;
    return probe.counts;
  });
}

function summarizeResources(runs) {
  const flattened = runs.flatMap((run) => run.resources);
  return {
    runCounts: summarizeSamples(runs.map((run) => run.resources.length)),
    transferBytes: summarizeSamples(
      runs.map((run) => run.resources.reduce((total, resource) => total + resource.transferSize, 0))
    ),
    decodedBodyBytes: summarizeSamples(
      runs.map((run) =>
        run.resources.reduce((total, resource) => total + resource.decodedBodySize, 0)
      )
    ),
    initiatorTypes: Object.fromEntries(
      [...new Set(flattened.map((resource) => resource.initiatorType))]
        .sort()
        .map((type) => [type, flattened.filter((resource) => resource.initiatorType === type).length])
    )
  };
}

async function collectBrowserMetrics(baseUrl, runs) {
  const browser = await chromium.launch({ headless: true });
  const raw = [];
  try {
    for (let index = 0; index < runs; index += 1) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const startedAt = performance.now();
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => (document.querySelector(".dashboard-root")?.childElementCount ?? 0) > 0
      );
      const dashboardReadyMs = performance.now() - startedAt;
      await page.waitForLoadState("networkidle");
      const networkIdleMs = performance.now() - startedAt;
      const navigation = await page.evaluate(() => {
        const entry = performance.getEntriesByType("navigation")[0];
        return entry ? entry.toJSON() : null;
      });
      const resources = await page.evaluate(() =>
        performance.getEntriesByType("resource").map((entry) => {
          const resource = entry;
          return {
            name: resource.name,
            initiatorType: resource.initiatorType,
            duration: resource.duration,
            transferSize: resource.transferSize,
            decodedBodySize: resource.decodedBodySize
          };
        })
      );
      const mutations = await collectNoOpResizeMutations(page);
      const openButton = page.getByRole("button", { name: "Open", exact: true }).first();
      let terminalOpen;
      if ((await openButton.count()) > 0) {
        const terminalStartedAt = performance.now();
        try {
          await openButton.click();
          await page.locator(".terminal-panel.is-active .xterm").waitFor({
            state: "visible",
            timeout: 10_000
          });
          terminalOpen = { supported: true, durationMs: performance.now() - terminalStartedAt };
        } catch (error) {
          terminalOpen = {
            supported: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      } else {
        terminalOpen = { supported: false, error: "No tmux session was available to open" };
      }
      raw.push({ dashboardReadyMs, networkIdleMs, navigation, resources, mutations, terminalOpen });
      await context.close();
    }
    return {
      chromiumVersion: browser.version(),
      raw,
      summary: {
        dashboardReadyMs: summarizeSamples(raw.map((run) => run.dashboardReadyMs)),
        networkIdleMs: summarizeSamples(raw.map((run) => run.networkIdleMs)),
        terminalOpenMs: raw.some((run) => run.terminalOpen.supported)
          ? summarizeSamples(
              raw.filter((run) => run.terminalOpen.supported).map((run) => run.terminalOpen.durationMs)
            )
          : { supported: false, error: "No tmux session was available in any browser run" },
        mutations: summarizeMutations(raw.map((run) => run.mutations)),
        resources: summarizeResources(raw)
      }
    };
  } finally {
    await browser.close();
  }
}

function listeningPid(port) {
  const output = execFileSync(
    "lsof",
    ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
    { encoding: "utf8" }
  ).trim();
  const pids = [...new Set(output.split(/\s+/).filter(Boolean).map(Number))];
  if (pids.length !== 1 || !Number.isInteger(pids[0])) {
    throw new Error(`Expected one listening PID on port ${port}, found ${pids.length}`);
  }
  return pids[0];
}

function processSample(pid) {
  const output = execFileSync("ps", ["-p", String(pid), "-o", "%cpu=,rss="], {
    encoding: "utf8"
  }).trim();
  const [cpuPercent, rssKiB] = output.split(/\s+/).map(Number);
  if (![cpuPercent, rssKiB].every(Number.isFinite)) {
    throw new Error(`Unable to parse ps sample for PID ${pid}: ${output}`);
  }
  return { at: new Date().toISOString(), cpuPercent, rssBytes: rssKiB * 1024 };
}

async function collectIdleProcessMetrics(baseUrl, idleSeconds) {
  if (process.platform !== "darwin") {
    return {
      supported: false,
      platform: process.platform,
      error: "Listening-port CPU/RSS sampling is currently supported only on macOS"
    };
  }
  try {
    const port = Number(new URL(baseUrl).port || (new URL(baseUrl).protocol === "https:" ? 443 : 80));
    const pid = listeningPid(port);
    const samples = [];
    for (let index = 0; index < idleSeconds; index += 1) {
      samples.push(processSample(pid));
      await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
    }
    if (samples.length === 0) samples.push(processSample(pid));
    return {
      supported: true,
      platform: process.platform,
      port,
      pid,
      raw: samples,
      summary: {
        cpuPercent: summarizeSamples(samples.map((sample) => sample.cpuPercent)),
        rssBytes: summarizeSamples(samples.map((sample) => sample.rssBytes))
      }
    };
  } catch (error) {
    return {
      supported: false,
      platform: process.platform,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function gitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8"
  }).trim();
}

function commitsMatch(actual, expected) {
  return typeof actual === "string" && actual.startsWith(expected);
}

function defaultOutputPath(commit) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(
    root,
    ".gstack/benchmark-reports/runtime-hotpaths",
    `${timestamp}-${commit.slice(0, 7)}.json`
  );
}

export async function runBenchmark(options) {
  const healthResponse = await timedFetch(options.url, "/api/health");
  const health = JSON.parse(healthResponse.body);
  if (!commitsMatch(health.commit, options.expectCommit)) {
    throw new Error(
      `Health commit mismatch: expected ${options.expectCommit}, received ${health.commit ?? "null"}`
    );
  }
  const sessionsResponse = await timedFetch(options.url, "/api/sessions");
  const sessions = JSON.parse(sessionsResponse.body);
  const firstSessionName = Array.isArray(sessions) && typeof sessions[0]?.name === "string"
    ? sessions[0].name
    : null;
  const commit = gitSha();
  const api = await collectApiMetrics(
    options.url,
    firstSessionName,
    options.apiRuns,
    options.apiConcurrency
  );
  const browser = await collectBrowserMetrics(options.url, options.runs);
  const idleProcess = await collectIdleProcessMetrics(options.url, options.idleSeconds);
  const issues = Object.entries(api).flatMap(([target, result]) => {
    if (result.supported === false) return [`${target}: ${result.error}`];
    return ["sequential", "concurrent"].flatMap((mode) =>
      result[mode].summary.allOk
        ? []
        : [`${target} ${mode}: ${result[mode].summary.failureCount} HTTP failures`]
    );
  });
  return {
    schemaVersion: 1,
    valid: issues.length === 0,
    issues,
    capturedAt: new Date().toISOString(),
    environment: {
      gitSha: commit,
      healthCommit: health.commit,
      nodeVersion: process.version,
      chromiumVersion: browser.chromiumVersion,
      platform: `${process.platform}-${process.arch}`,
      url: options.url
    },
    options: {
      expectCommit: options.expectCommit,
      runs: options.runs,
      apiRuns: options.apiRuns,
      apiConcurrency: options.apiConcurrency,
      idleSeconds: options.idleSeconds
    },
    preflight: {
      health,
      healthFetch: { ...healthResponse, body: undefined },
      firstSessionName
    },
    api,
    browser,
    idleProcess
  };
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const report = await runBenchmark(options);
  const output = resolve(options.output ?? defaultOutputPath(report.environment.gitSha));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(output);
  if (!report.valid) {
    throw new Error(`Benchmark report is invalid: ${report.issues.join("; ")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
