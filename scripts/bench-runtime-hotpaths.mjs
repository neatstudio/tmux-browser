#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULTS = {
  runs: 7,
  apiRuns: 30,
  apiConcurrency: 30,
  idleSeconds: 30,
  timeoutMs: 10_000
};
const BROWSER_VIEWPORT = { width: 1440, height: 900 };
const TERMINAL_CHROME_ANIMATION_FRAMES_PER_CYCLE = 2;

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

export function summarizeTerminalChromeProbe(probe) {
  const countFields = [
    "records",
    "added",
    "removed",
    "replacements",
    "attributes",
    "characterData"
  ];
  if (
    !Number.isInteger(probe?.cycles) ||
    probe.cycles < 1 ||
    typeof probe?.elapsedMs !== "number" ||
    !Number.isFinite(probe.elapsedMs) ||
    probe.elapsedMs < 0 ||
    countFields.some(
      (field) =>
        !Number.isInteger(probe?.counts?.[field]) || probe.counts[field] < 0
    ) ||
    !Array.isArray(probe?.rootIdentityStable) ||
    probe.rootIdentityStable.some((value) => typeof value !== "boolean") ||
    !Array.isArray(probe?.childIdentityStable) ||
    probe.childIdentityStable.some((value) => typeof value !== "boolean")
  ) {
    throw new Error("terminal chrome probe must contain complete non-negative evidence");
  }
  const allRootIdentitiesStable = probe.rootIdentityStable.every(Boolean);
  const allChildIdentitiesStable = probe.childIdentityStable.every(Boolean);
  const counts = Object.fromEntries(
    countFields.map((field) => [field, probe.counts[field]])
  );
  counts.replacements = Math.min(counts.added, counts.removed);
  const zeroReplacementPassed =
    counts.added === 0 && counts.removed === 0 && counts.replacements === 0;
  const identityPassed = allRootIdentitiesStable && allChildIdentitiesStable;
  return {
    cycles: probe.cycles,
    animationFramesPerCycle:
      probe.animationFramesPerCycle ?? TERMINAL_CHROME_ANIMATION_FRAMES_PER_CYCLE,
    elapsedMs: probe.elapsedMs,
    counts,
    allRootIdentitiesStable,
    allChildIdentitiesStable,
    zeroReplacementPassed,
    identityPassed,
    passed: zeroReplacementPassed && identityPassed
  };
}

function getTerminalChromeProbes(report) {
  return (report?.browser?.raw ?? [])
    .filter((run) => run?.terminalOpen?.supported === true)
    .map((run) => run.terminalOpen.terminalChrome)
    .filter(Boolean);
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function comparePairedTerminalChromeReports(baseline, candidate) {
  const baselineProbes = getTerminalChromeProbes(baseline);
  const candidateProbes = getTerminalChromeProbes(candidate);
  const comparabilityMismatches = [];
  const compareField = (name, baselineValue, candidateValue) => {
    if (
      baselineValue === undefined ||
      baselineValue === null ||
      baselineValue === "" ||
      candidateValue === undefined ||
      candidateValue === null ||
      candidateValue === "" ||
      JSON.stringify(baselineValue) !== JSON.stringify(candidateValue)
    ) {
      comparabilityMismatches.push(name);
    }
  };
  compareField(
    "machineId",
    baseline?.environment?.machineId,
    candidate?.environment?.machineId
  );
  compareField(
    "runnerGitSha",
    baseline?.environment?.runnerGitSha,
    candidate?.environment?.runnerGitSha
  );
  compareField(
    "chromiumVersion",
    baseline?.environment?.chromiumVersion,
    candidate?.environment?.chromiumVersion
  );
  compareField("viewport", baseline?.browser?.viewport, candidate?.browser?.viewport);
  compareField(
    "session",
    baseline?.preflight?.firstSessionName,
    candidate?.preflight?.firstSessionName
  );
  compareField(
    "cadence",
    baselineProbes.map((probe) => [probe.cycles, probe.animationFramesPerCycle]),
    candidateProbes.map((probe) => [probe.cycles, probe.animationFramesPerCycle])
  );
  if (
    baselineProbes.length === 0 ||
    candidateProbes.length === 0 ||
    baselineProbes.length !== candidateProbes.length
  ) {
    comparabilityMismatches.push("runCount");
  }
  const zeroReplacementPassed =
    candidateProbes.length > 0 &&
    candidateProbes.every(
      (probe) =>
        probe.counts.added === 0 &&
        probe.counts.removed === 0 &&
        probe.counts.replacements === 0 &&
        probe.zeroReplacementPassed === true
    );
  const identityPassed =
    candidateProbes.length > 0 &&
    candidateProbes.every(
      (probe) =>
        probe.allRootIdentitiesStable === true &&
        probe.allChildIdentitiesStable === true &&
        probe.identityPassed === true
    );
  const timing =
    baselineProbes.length > 0 && candidateProbes.length > 0
      ? compareRelativeBudget(
          average(baselineProbes.map((probe) => probe.elapsedMs)),
          average(candidateProbes.map((probe) => probe.elapsedMs)),
          1.2
        )
      : null;
  const comparable = comparabilityMismatches.length === 0;
  return {
    comparable,
    comparabilityMismatches,
    baselineRuns: baselineProbes.length,
    candidateRuns: candidateProbes.length,
    zeroReplacementPassed,
    identityPassed,
    timing,
    passed:
      comparable &&
      zeroReplacementPassed &&
      identityPassed &&
      timing?.withinBudget === true
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
    "timeout-ms",
    "paired-baseline",
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
    timeoutMs: integerOption("--timeout-ms", values.get("timeout-ms") ?? DEFAULTS.timeoutMs),
    pairedBaseline: values.get("paired-baseline") ?? null,
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

export async function timedFetch(
  baseUrl,
  target,
  { requireOk = true, timeoutMs = DEFAULTS.timeoutMs } = {}
) {
  const startedAt = performance.now();
  try {
    const response = await fetch(targetUrl(baseUrl, target), {
      signal: AbortSignal.timeout(timeoutMs)
    });
    const body = await response.text();
    const result = {
      durationMs: performance.now() - startedAt,
      status: response.status,
      ok: response.ok,
      timedOut: false,
      bytes: Buffer.byteLength(body)
    };
    if (requireOk && !response.ok) {
      throw new Error(`GET ${target} returned ${response.status}: ${body.slice(0, 200)}`);
    }
    return { ...result, body };
  } catch (error) {
    if (requireOk) {
      throw new Error(
        `GET ${target} failed within ${timeoutMs}ms: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      );
    }
    return {
      durationMs: performance.now() - startedAt,
      status: null,
      ok: false,
      timedOut: error?.name === "TimeoutError",
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
      body: ""
    };
  }
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

async function collectApiMetrics(
  baseUrl,
  firstSessionName,
  apiRuns,
  apiConcurrency,
  timeoutMs
) {
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
        requireOk: false,
        timeoutMs
      });
      sequential.push(sample);
    }
    const concurrent = await Promise.all(
      Array.from({ length: apiConcurrency }, async () => {
        const { body: _body, ...sample } = await timedFetch(baseUrl, target.path, {
          requireOk: false,
          timeoutMs
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

export function isDashboardDataReady(rendered, expected) {
  const renderedProjects = new Set(rendered.projectNames);
  const renderedSessions = new Set(rendered.sessionNames);
  return (
    expected.projectNames.every((name) => renderedProjects.has(name)) &&
    expected.sessionNames.every((name) => renderedSessions.has(name))
  );
}

export function normalizeKanbanProjects(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.projects)) {
    return payload.projects;
  }
  throw new Error("kanban projects response must contain a projects array");
}

async function waitForDashboardData(page, expected, timeoutMs) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const rendered = await page.evaluate(() => {
      const root = document.querySelector(".kanban-root");
      if (!root) return null;
      return {
        projectNames: [...root.querySelectorAll(".kanban-project-card")]
          .map((node) => node.dataset.projectName)
          .filter((name) => typeof name === "string"),
        sessionNames: [
          ...root.querySelectorAll(".kanban-ungrouped-card[data-session-name]")
        ]
          .map((node) => node.dataset.sessionName)
          .filter((name) => typeof name === "string")
          .concat(
            [...root.querySelectorAll(".kanban-agent-card code")]
              .map((node) => node.textContent?.trim())
              .filter((name) => typeof name === "string" && name.length > 0)
          )
      };
    });
    if (rendered && isDashboardDataReady(rendered, expected)) return;
    await page.waitForTimeout(25);
  }
  throw new Error(`Dashboard data did not render within ${timeoutMs}ms`);
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

async function collectTerminalChromeNoOpResizeMutations(page, cycles = 10) {
  const probe = await page.evaluate(async (resizeCycles) => {
    const selectors = [
      ".terminal-status-bar",
      ".terminal-session-rail",
      ".session-floating-menu"
    ];
    const panel = document.querySelector(".terminal-panel.is-active");
    if (!panel) throw new Error("No active terminal panel");
    const rootsBefore = selectors.map((selector) => panel.querySelector(selector));
    const childrenBefore = rootsBefore.map((root) => root ? [...root.childNodes] : []);
    const counts = {
      records: 0,
      added: 0,
      removed: 0,
      replacements: 0,
      attributes: 0,
      characterData: 0
    };
    const chromeSelector = selectors.join(",");
    const findChromeRoot = (node) => {
      if (node instanceof Element) {
        return node.matches(chromeSelector) ? node : node.closest(chromeSelector);
      }
      return node.parentElement?.closest(chromeSelector) ?? null;
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const targetRoot = findChromeRoot(record.target);
        const added = [...record.addedNodes].filter((node) => findChromeRoot(node));
        const removed = [...record.removedNodes].filter((node) =>
          targetRoot ||
          (node instanceof Element && node.matches(chromeSelector))
        );
        if (!targetRoot && added.length === 0 && removed.length === 0) continue;
        counts.records += 1;
        counts.added += added.length;
        counts.removed += removed.length;
        counts.replacements += Math.min(added.length, removed.length);
        if (record.type === "attributes") counts.attributes += 1;
        if (record.type === "characterData") counts.characterData += 1;
      }
    });
    observer.observe(panel, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    });
    const startedAt = performance.now();
    for (let cycle = 0; cycle < resizeCycles; cycle += 1) {
      window.dispatchEvent(new Event("resize"));
      await new Promise((resolveWait) =>
        requestAnimationFrame(() => requestAnimationFrame(resolveWait))
      );
    }
    const elapsedMs = performance.now() - startedAt;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    observer.disconnect();
    const rootsAfter = selectors.map((selector) => panel.querySelector(selector));
    const childrenAfter = rootsAfter.map((root) => root ? [...root.childNodes] : []);
    return {
      cycles: resizeCycles,
      elapsedMs,
      counts,
      rootIdentityStable: rootsBefore.map((root, index) => root === rootsAfter[index]),
      childIdentityStable: childrenBefore.map((children, index) =>
        children.length === childrenAfter[index].length &&
        children.every((child, childIndex) => child === childrenAfter[index][childIndex])
      )
    };
  }, cycles);
  return summarizeTerminalChromeProbe(probe);
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

async function collectBrowserMetrics(baseUrl, runs, timeoutMs) {
  const browser = await chromium.launch({ headless: true });
  const raw = [];
  try {
    for (let index = 0; index < runs; index += 1) {
      const context = await browser.newContext({ viewport: BROWSER_VIEWPORT });
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      page.setDefaultNavigationTimeout(timeoutMs);
      const sessionsResponsePromise = page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/sessions-panes"
      );
      const projectsResponsePromise = page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/kanban/projects"
      );
      const startedAt = performance.now();
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const [sessionsResponse, projectsResponse] = await Promise.all([
        sessionsResponsePromise,
        projectsResponsePromise
      ]);
      if (!sessionsResponse.ok() || !projectsResponse.ok()) {
        throw new Error(
          `Dashboard data request failed: sessions=${sessionsResponse.status()} projects=${projectsResponse.status()}`
        );
      }
      const sessions = await sessionsResponse.json();
      const projects = normalizeKanbanProjects(await projectsResponse.json());
      await waitForDashboardData(
        page,
        {
          projectNames: Array.isArray(projects)
            ? projects.map((project) => project.name).filter((name) => typeof name === "string")
            : [],
          sessionNames: Array.isArray(sessions)
            ? sessions.map((session) => session.name).filter((name) => typeof name === "string")
            : []
        },
        timeoutMs
      );
      const dashboardReadyMs = performance.now() - startedAt;
      await page.waitForLoadState("networkidle");
      const networkIdleMs = performance.now() - startedAt;
      const navigation = await page.evaluate(() => {
        const entry = performance.getEntriesByType("navigation")[0];
        return entry ? entry.toJSON() : null;
      });
      const firstContentfulPaintMs = await page.evaluate(
        () => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null
      );
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
          const durationMs = performance.now() - terminalStartedAt;
          await page.waitForTimeout(500);
          terminalOpen = {
            supported: true,
            durationMs,
            terminalChrome: await collectTerminalChromeNoOpResizeMutations(page)
          };
        } catch (error) {
          terminalOpen = {
            supported: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      } else {
        terminalOpen = { supported: false, error: "No tmux session was available to open" };
      }
      raw.push({
        dashboardReadyMs,
        networkIdleMs,
        firstContentfulPaintMs,
        navigation,
        resources,
        mutations,
        terminalOpen
      });
      await context.close();
    }
    return {
      chromiumVersion: browser.version(),
      viewport: BROWSER_VIEWPORT,
      requestedRuns: runs,
      raw,
      summary: {
        dashboardReadyMs: summarizeSamples(raw.map((run) => run.dashboardReadyMs)),
        networkIdleMs: summarizeSamples(raw.map((run) => run.networkIdleMs)),
        firstContentfulPaintMs: raw.some((run) => run.firstContentfulPaintMs !== null)
          ? summarizeSamples(
              raw
                .map((run) => run.firstContentfulPaintMs)
                .filter((value) => value !== null)
            )
          : { supported: false, error: "Chromium did not expose first-contentful-paint" },
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

export function collectReportIssues(api, browser, idleProcess) {
  const issues = Object.entries(api).flatMap(([target, result]) => {
    if (result.supported === false) return [`${target}: ${result.error}`];
    return ["sequential", "concurrent"].flatMap((mode) =>
      result[mode].summary.allOk
        ? []
        : [`${target} ${mode}: ${result[mode].summary.failureCount} HTTP failures`]
    );
  });
  if (idleProcess?.supported !== true) {
    issues.push(`idle-process: ${idleProcess?.error ?? "evidence is missing"}`);
  }
  const browserRuns = browser?.raw;
  if (!Array.isArray(browserRuns) || browserRuns.length === 0) {
    issues.push("browser-fcp: evidence is missing");
  } else {
    const requestedRuns = browser.requestedRuns ?? browserRuns.length;
    const missingRuns =
      Math.max(0, requestedRuns - browserRuns.length) +
      browserRuns.filter(
        (run) =>
          typeof run.firstContentfulPaintMs !== "number" ||
          !Number.isFinite(run.firstContentfulPaintMs)
      ).length;
    if (missingRuns > 0) {
      issues.push(`browser-fcp: missing for ${missingRuns} of ${requestedRuns} runs`);
    }
  }
  return issues;
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

function gitSha(revision = "HEAD") {
  return execFileSync("git", ["rev-parse", revision], {
    cwd: root,
    encoding: "utf8"
  }).trim();
}

function worktreeStatus() {
  return execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: root,
    encoding: "utf8"
  });
}

export function assertCleanWorktree(status) {
  if (status.trim().length > 0) {
    throw new Error("benchmark worktree must be clean before sampling");
  }
}

export function resolveBenchmarkCommits(expectCommit, resolveSha = gitSha) {
  return {
    gitSha: resolveSha(expectCommit),
    runnerGitSha: resolveSha("HEAD")
  };
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
  assertCleanWorktree(worktreeStatus());
  const healthResponse = await timedFetch(options.url, "/api/health", {
    timeoutMs: options.timeoutMs
  });
  const health = JSON.parse(healthResponse.body);
  if (!commitsMatch(health.commit, options.expectCommit)) {
    throw new Error(
      `Health commit mismatch: expected ${options.expectCommit}, received ${health.commit ?? "null"}`
    );
  }
  const sessionsResponse = await timedFetch(options.url, "/api/sessions", {
    timeoutMs: options.timeoutMs
  });
  const sessions = JSON.parse(sessionsResponse.body);
  const firstSessionName = Array.isArray(sessions) && typeof sessions[0]?.name === "string"
    ? sessions[0].name
    : null;
  const commits = resolveBenchmarkCommits(options.expectCommit);
  const api = await collectApiMetrics(
    options.url,
    firstSessionName,
    options.apiRuns,
    options.apiConcurrency,
    options.timeoutMs
  );
  const browser = await collectBrowserMetrics(options.url, options.runs, options.timeoutMs);
  const idleProcess = await collectIdleProcessMetrics(options.url, options.idleSeconds);
  const issues = collectReportIssues(api, browser, idleProcess);
  const report = {
    schemaVersion: 1,
    valid: false,
    issues,
    capturedAt: new Date().toISOString(),
    environment: {
      ...commits,
      healthCommit: health.commit,
      nodeVersion: process.version,
      chromiumVersion: browser.chromiumVersion,
      machineId: hostname(),
      platform: `${process.platform}-${process.arch}`,
      url: options.url
    },
    options: {
      expectCommit: options.expectCommit,
      runs: options.runs,
      apiRuns: options.apiRuns,
      apiConcurrency: options.apiConcurrency,
      idleSeconds: options.idleSeconds,
      timeoutMs: options.timeoutMs,
      pairedBaseline: options.pairedBaseline
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
  if (options.pairedBaseline) {
    const baselinePath = resolve(options.pairedBaseline);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    const comparison = comparePairedTerminalChromeReports(baseline, report);
    report.pairedTerminalChrome = { baselinePath, ...comparison };
    if (!comparison.passed) {
      issues.push(
        `paired-terminal-chrome: ${
          comparison.comparable
            ? "candidate failed churn, identity, or relative timing gate"
            : `incomparable (${comparison.comparabilityMismatches.join(", ")})`
        }`
      );
    }
  }
  report.valid = issues.length === 0;
  return report;
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
