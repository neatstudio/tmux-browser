import { describe, expect, it } from "vitest";
import { createServer } from "node:http";

import {
  assertCleanWorktree,
  comparePairedTerminalChromeReports,
  compareRelativeBudget,
  collectReportIssues,
  isDashboardDataReady,
  normalizeKanbanProjects,
  parseCliOptions,
  resolveBenchmarkCommits,
  summarizeTerminalChromeProbe,
  summarizeMutations,
  summarizeSamples,
  summarizeFetches,
  timedFetch
} from "../../scripts/bench-runtime-hotpaths.mjs";

describe("runtime hotpath benchmark helpers", () => {
  function createTerminalChromeReport(overrides: Record<string, unknown> = {}) {
    const report = {
      environment: {
        machineId: "build-mac",
        runnerGitSha: "runner-sha",
        chromiumVersion: "149.0.7827.55",
        platform: "darwin-arm64"
      },
      options: { runs: 1 },
      preflight: { firstSessionName: "cc1-remote" },
      browser: {
        viewport: { width: 1440, height: 900 },
        requestedRuns: 1,
        raw: [
          {
            terminalOpen: {
              supported: true,
              terminalChrome: {
                cycles: 10,
                animationFramesPerCycle: 2,
                elapsedMs: 500,
                counts: {
                  records: 0,
                  added: 0,
                  removed: 0,
                  replacements: 0,
                  attributes: 0,
                  characterData: 0
                },
                allExpectedRootsPresent: true,
                allChildCollectionsPresent: true,
                allRootIdentitiesStable: true,
                allChildIdentitiesStable: true,
                zeroReplacementPassed: true,
                identityPassed: true,
                passed: true
              }
            }
          }
        ]
      }
    };
    return Object.assign(report, overrides);
  }

  describe("summarizeSamples", () => {
    it("reports nearest-rank percentiles and arithmetic summary values", () => {
      expect(summarizeSamples([100, 1, 4, 2, 3])).toEqual({
        count: 5,
        min: 1,
        max: 100,
        avg: 22,
        p50: 3,
        p95: 100
      });
    });

    it("rejects empty and non-finite samples", () => {
      expect(() => summarizeSamples([])).toThrow("at least one");
      expect(() => summarizeSamples([1, Number.NaN])).toThrow("finite");
    });
  });

  describe("compareRelativeBudget", () => {
    it("compares a candidate against an explicit relative ceiling", () => {
      expect(compareRelativeBudget(100, 119, 1.2)).toEqual({
        baseline: 100,
        candidate: 119,
        maxRatio: 1.2,
        ratio: 1.19,
        percentChange: 19,
        withinBudget: true
      });
      expect(compareRelativeBudget(100, 121, 1.2).withinBudget).toBe(false);
    });

    it("rejects invalid comparison inputs", () => {
      expect(() => compareRelativeBudget(0, 10, 1.2)).toThrow("baseline");
      expect(() => compareRelativeBudget(10, 10, 0)).toThrow("maxRatio");
    });
  });

  describe("summarizeMutations", () => {
    it("keeps totals, no-op rate, and per-run mutation percentiles", () => {
      expect(
        summarizeMutations([
          { total: 0, childList: 0, attributes: 0, characterData: 0 },
          { total: 4, childList: 2, attributes: 1, characterData: 1 },
          { total: 2, childList: 1, attributes: 1, characterData: 0 }
        ])
      ).toEqual({
        runs: 3,
        noOpRuns: 1,
        noOpRate: 1 / 3,
        totals: {
          total: 6,
          childList: 3,
          attributes: 2,
          characterData: 1
        },
        perRun: {
          count: 3,
          min: 0,
          max: 4,
          avg: 2,
          p50: 2,
          p95: 4
        }
      });
    });

    it("rejects missing mutation samples", () => {
      expect(() => summarizeMutations([])).toThrow("at least one");
    });
  });

  describe("summarizeTerminalChromeProbe", () => {
    it("reports selector-scoped replacement and identity evidence", () => {
      expect(
        summarizeTerminalChromeProbe({
          cycles: 10,
          animationFramesPerCycle: 2,
          elapsedMs: 376.6,
          counts: {
            records: 0,
            added: 0,
            removed: 0,
            replacements: 0,
            attributes: 0,
            characterData: 0
          },
          rootPresence: [true, true, true],
          childCollectionsPresent: [true, true, true],
          rootIdentityStable: [true, true, true],
          childIdentityStable: [true, true, true]
        })
      ).toEqual({
        cycles: 10,
        animationFramesPerCycle: 2,
        elapsedMs: 376.6,
        counts: {
          records: 0,
          added: 0,
          removed: 0,
          replacements: 0,
          attributes: 0,
          characterData: 0
        },
        allExpectedRootsPresent: true,
        allChildCollectionsPresent: true,
        allRootIdentitiesStable: true,
        allChildIdentitiesStable: true,
        zeroReplacementPassed: true,
        identityPassed: true,
        passed: true
      });
    });

    it("rejects incomplete terminal chrome mutation evidence", () => {
      expect(() =>
        summarizeTerminalChromeProbe({
          cycles: 10,
          elapsedMs: 100,
          counts: { records: 0 },
          rootIdentityStable: [true],
          childIdentityStable: [true]
        })
      ).toThrow("terminal chrome probe");
    });

    it("rejects otherwise complete probes with missing cadence", () => {
      expect(() =>
        summarizeTerminalChromeProbe({
          cycles: 10,
          elapsedMs: 100,
          counts: {
            records: 0,
            added: 0,
            removed: 0,
            replacements: 0,
            attributes: 0,
            characterData: 0
          },
          rootPresence: [true, true, true],
          childCollectionsPresent: [true, true, true],
          rootIdentityStable: [true, true, true],
          childIdentityStable: [true, true, true]
        })
      ).toThrow("terminal chrome probe");
    });

    it("fails identity when any expected chrome root or child collection is absent", () => {
      expect(
        summarizeTerminalChromeProbe({
          cycles: 10,
          animationFramesPerCycle: 2,
          elapsedMs: 100,
          counts: {
            records: 0,
            added: 0,
            removed: 0,
            replacements: 0,
            attributes: 0,
            characterData: 0
          },
          rootPresence: [true, false, true],
          childCollectionsPresent: [true, false, true],
          rootIdentityStable: [true, true, true],
          childIdentityStable: [true, true, true]
        })
      ).toMatchObject({
        allExpectedRootsPresent: false,
        allChildCollectionsPresent: false,
        identityPassed: false,
        passed: false
      });
    });

    it("pairs replacements across separate add and remove mutation records", () => {
      expect(
        summarizeTerminalChromeProbe({
          cycles: 10,
          animationFramesPerCycle: 2,
          elapsedMs: 300,
          counts: {
            records: 8,
            added: 6,
            removed: 6,
            replacements: 0,
            attributes: 0,
            characterData: 0
          },
          rootPresence: [true, true, true],
          childCollectionsPresent: [true, true, true],
          rootIdentityStable: [true, false, false],
          childIdentityStable: [false, false, false]
        })
      ).toMatchObject({
        counts: { replacements: 6 },
        zeroReplacementPassed: false,
        passed: false
      });
    });
  });

  describe("comparePairedTerminalChromeReports", () => {
    it("passes zero-churn candidates within 20 percent of a comparable baseline", () => {
      const baseline = createTerminalChromeReport();
      baseline.browser.raw[0].terminalOpen.terminalChrome.elapsedMs = 885.6;
      const candidate = createTerminalChromeReport();
      candidate.browser.raw[0].terminalOpen.terminalChrome.elapsedMs = 563.4;

      expect(comparePairedTerminalChromeReports(baseline, candidate)).toEqual({
        comparable: true,
        comparabilityMismatches: [],
        baselineRequestedRuns: 1,
        candidateRequestedRuns: 1,
        baselineRuns: 1,
        candidateRuns: 1,
        zeroReplacementPassed: true,
        identityPassed: true,
        timing: compareRelativeBudget(885.6, 563.4, 1.2),
        passed: true
      });
    });

    it("rejects mismatched machine, viewport, session, runner, Chromium, or cadence", () => {
      const baseline = createTerminalChromeReport();
      const candidate = createTerminalChromeReport();
      candidate.environment.machineId = "other-mac";
      candidate.environment.runnerGitSha = "other-runner";
      candidate.environment.chromiumVersion = "150.0.0.0";
      candidate.preflight.firstSessionName = "other-session";
      candidate.browser.viewport.width = 1280;
      candidate.browser.raw[0].terminalOpen.terminalChrome.animationFramesPerCycle = 1;

      expect(comparePairedTerminalChromeReports(baseline, candidate)).toMatchObject({
        comparable: false,
        comparabilityMismatches: expect.arrayContaining([
          "machineId",
          "runnerGitSha",
          "chromiumVersion",
          "viewport",
          "session",
          "cadence"
        ]),
        passed: false
      });
    });

    it("rejects paired reports when required comparability metadata is missing", () => {
      const baseline = createTerminalChromeReport();
      const candidate = createTerminalChromeReport();
      delete baseline.environment.machineId;
      delete candidate.environment.machineId;

      expect(comparePairedTerminalChromeReports(baseline, candidate)).toMatchObject({
        comparable: false,
        comparabilityMismatches: ["machineId"],
        passed: false
      });
    });

    it("rejects paired reports when both omit animation-frame cadence", () => {
      const baseline = createTerminalChromeReport();
      const candidate = createTerminalChromeReport();
      delete baseline.browser.raw[0].terminalOpen.terminalChrome.animationFramesPerCycle;
      delete candidate.browser.raw[0].terminalOpen.terminalChrome.animationFramesPerCycle;

      expect(comparePairedTerminalChromeReports(baseline, candidate)).toMatchObject({
        comparable: false,
        comparabilityMismatches: expect.arrayContaining(["cadence"]),
        passed: false
      });
    });

    it("rejects paired reports when both use the same wrong cadence", () => {
      const baseline = createTerminalChromeReport();
      const candidate = createTerminalChromeReport();
      baseline.browser.raw[0].terminalOpen.terminalChrome.cycles = 8;
      candidate.browser.raw[0].terminalOpen.terminalChrome.cycles = 8;
      baseline.browser.raw[0].terminalOpen.terminalChrome.animationFramesPerCycle = 1;
      candidate.browser.raw[0].terminalOpen.terminalChrome.animationFramesPerCycle = 1;

      expect(comparePairedTerminalChromeReports(baseline, candidate)).toMatchObject({
        comparable: false,
        comparabilityMismatches: expect.arrayContaining(["cadence"]),
        passed: false
      });
    });

    it("rejects partial or unsupported paired terminal evidence", () => {
      const baseline = createTerminalChromeReport();
      const candidate = createTerminalChromeReport();
      baseline.options.runs = 2;
      candidate.options.runs = 2;
      baseline.browser.requestedRuns = 2;
      candidate.browser.requestedRuns = 2;
      baseline.browser.raw.push(structuredClone(baseline.browser.raw[0]));
      candidate.browser.raw.push({
        terminalOpen: { supported: false, error: "No terminal" }
      } as (typeof candidate.browser.raw)[number]);

      expect(comparePairedTerminalChromeReports(baseline, candidate)).toMatchObject({
        comparable: false,
        comparabilityMismatches: ["candidateEvidence"],
        baselineRequestedRuns: 2,
        candidateRequestedRuns: 2,
        baselineRuns: 2,
        candidateRuns: 1,
        passed: false
      });
    });

    it("rejects mismatched requested browser run counts", () => {
      const baseline = createTerminalChromeReport();
      const candidate = createTerminalChromeReport();
      candidate.browser.requestedRuns = 2;
      candidate.options.runs = 2;
      candidate.browser.raw.push(structuredClone(candidate.browser.raw[0]));

      expect(comparePairedTerminalChromeReports(baseline, candidate)).toMatchObject({
        comparable: false,
        comparabilityMismatches: ["requestedRunCount"],
        baselineRequestedRuns: 1,
        candidateRequestedRuns: 2,
        passed: false
      });
    });

    it("rejects reports whose declared run count differs from browser evidence", () => {
      const baseline = createTerminalChromeReport();
      const candidate = createTerminalChromeReport();
      candidate.options.runs = 7;

      expect(comparePairedTerminalChromeReports(baseline, candidate)).toMatchObject({
        comparable: false,
        comparabilityMismatches: ["candidateEvidence"],
        candidateRequestedRuns: 1,
        candidateRuns: 1,
        passed: false
      });
    });
  });

  describe("parseCliOptions", () => {
    it("parses the positional URL and benchmark defaults", () => {
      expect(
        parseCliOptions([
          "http://127.0.0.1:3100/",
          "--expect-commit",
          "6a5f503"
        ])
      ).toEqual({
        url: "http://127.0.0.1:3100",
        expectCommit: "6a5f503",
        runs: 7,
        apiRuns: 30,
        apiConcurrency: 30,
        idleSeconds: 30,
        timeoutMs: 10_000,
        pairedBaseline: null,
        output: null
      });
    });

    it("parses explicit run controls and output", () => {
      expect(
        parseCliOptions([
          "https://tmux.example.test/base",
          "--expect-commit",
          "abcdef0",
          "--runs",
          "3",
          "--api-runs",
          "5",
          "--api-concurrency",
          "8",
          "--idle-seconds",
          "0",
          "--timeout-ms",
          "2500",
          "--paired-baseline",
          ".gstack/baseline.json",
          "--output",
          "tmp/report.json"
        ])
      ).toMatchObject({
        url: "https://tmux.example.test/base",
        expectCommit: "abcdef0",
        runs: 3,
        apiRuns: 5,
        apiConcurrency: 8,
        idleSeconds: 0,
        timeoutMs: 2500,
        pairedBaseline: ".gstack/baseline.json",
        output: "tmp/report.json"
      });
    });

    it("rejects missing, malformed, and unknown options", () => {
      expect(() => parseCliOptions([])).toThrow("URL is required");
      expect(() => parseCliOptions(["not-a-url", "--expect-commit", "abc"])).toThrow(
        "valid http"
      );
      expect(() => parseCliOptions(["http://localhost:3000"])).toThrow(
        "--expect-commit is required"
      );
      expect(() =>
        parseCliOptions([
          "http://localhost:3000",
          "--expect-commit",
          "abcdef0",
          "--runs",
          "0"
        ])
      ).toThrow("--runs");
      expect(() =>
        parseCliOptions([
          "http://localhost:3000",
          "--expect-commit",
          "abcdef0",
          "--wat",
          "1"
        ])
      ).toThrow("Unknown option");
      expect(() =>
        parseCliOptions(["http://localhost:3000", "--expect-commit", "abc123"])
      ).toThrow("7 to 40");
      expect(() =>
        parseCliOptions(["http://localhost:3000", "--expect-commit", "notasha"])
      ).toThrow("hex");
    });
  });

  it("invalidates reports when requested idle process evidence is unavailable", () => {
    const browser = createTerminalChromeReport().browser;
    Object.assign(browser.raw[0], { firstContentfulPaintMs: 10 });
    expect(
      collectReportIssues(
        {},
        browser,
        { supported: false, error: "Expected one listening PID, found 0" }
      )
    ).toEqual(["idle-process: Expected one listening PID, found 0"]);
  });

  it("invalidates reports with missing or unsupported terminal chrome evidence", () => {
    const browser = createTerminalChromeReport().browser;
    browser.requestedRuns = 2;
    Object.assign(browser.raw[0], { firstContentfulPaintMs: 10 });
    browser.raw.push({
      firstContentfulPaintMs: 11,
      terminalOpen: { supported: false, error: "No terminal" }
    } as (typeof browser.raw)[number]);

    expect(collectReportIssues({}, browser, { supported: true })).toEqual([
      "terminal-chrome: missing or incomplete for 1 of 2 runs"
    ]);
  });

  it("normalizes the real kanban response wrapper and documented array form", () => {
    const projects = [{ name: "alpha", agents: [] }];
    expect(normalizeKanbanProjects({ projects })).toEqual(projects);
    expect(normalizeKanbanProjects(projects)).toEqual(projects);
    expect(() => normalizeKanbanProjects({ projects: null })).toThrow(
      "kanban projects response"
    );
  });

  it("fails preflight for any tracked or untracked worktree change", () => {
    expect(() => assertCleanWorktree("")).not.toThrow();
    expect(() => assertCleanWorktree(" M scripts/bench.mjs\n?? notes.txt\n")).toThrow(
      "worktree must be clean"
    );
  });

  it("invalidates missing or partial first-contentful-paint evidence", () => {
    const browser = createTerminalChromeReport().browser;
    browser.requestedRuns = 2;
    Object.assign(browser.raw[0], { firstContentfulPaintMs: 12 });
    const secondRun = structuredClone(browser.raw[0]);
    Object.assign(secondRun, { firstContentfulPaintMs: null });
    browser.raw.push(secondRun);
    expect(
      collectReportIssues(
        {},
        browser,
        { supported: true }
      )
    ).toEqual(["browser-fcp: missing for 1 of 2 runs"]);
    expect(
      collectReportIssues({}, { raw: [] }, { supported: true })
    ).toEqual([
      "browser-fcp: evidence is missing",
      "terminal-chrome: evidence is missing"
    ]);
  });

  it("requires API-returned project and session identities in the rendered dashboard", () => {
    const expected = { projectNames: ["alpha"], sessionNames: ["worker"] };
    expect(
      isDashboardDataReady({ projectNames: [], sessionNames: [] }, expected)
    ).toBe(false);
    expect(
      isDashboardDataReady(
        { projectNames: ["alpha"], sessionNames: ["worker", "extra"] },
        expected
      )
    ).toBe(true);
  });

  it("records target and runner revisions without conflating them", () => {
    expect(
      resolveBenchmarkCommits("6a5f503", (revision: string) =>
        revision === "HEAD" ? "runner-full-sha" : "target-full-sha"
      )
    ).toEqual({
      gitSha: "target-full-sha",
      runnerGitSha: "runner-full-sha"
    });
  });

  it("keeps failed HTTP durations out of successful latency summaries", () => {
    expect(
      summarizeFetches([
        { durationMs: 10, bytes: 100, status: 200, ok: true },
        { durationMs: 1, bytes: 20, status: 500, ok: false }
      ])
    ).toMatchObject({
      allOk: false,
      successCount: 1,
      failureCount: 1,
      statuses: [200, 500],
      durationsMs: { count: 1, p50: 10, p95: 10 }
    });
  });

  it("records non-success API samples unless the caller requires success", async () => {
    const server = createServer((_request, response) => {
      response.statusCode = 500;
      response.end("failed");
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const url = `http://127.0.0.1:${address.port}`;
    try {
      await expect(timedFetch(url, "/api/test", { requireOk: true })).rejects.toThrow(
        "returned 500"
      );
      await expect(timedFetch(url, "/api/test", { requireOk: false })).resolves.toMatchObject({
        ok: false,
        status: 500,
        body: "failed"
      });
    } finally {
      await new Promise<void>((resolveClose, rejectClose) =>
        server.close((error) => (error ? rejectClose(error) : resolveClose()))
      );
    }
  });

  it("bounds a hanging request and releases the test server", async () => {
    const sockets = new Set<import("node:net").Socket>();
    const server = createServer(() => {});
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    try {
      await expect(
        Promise.race([
          timedFetch(`http://127.0.0.1:${address.port}`, "/hang", {
            requireOk: false,
            timeoutMs: 25
          }),
          new Promise((_, rejectGuard) =>
            setTimeout(() => rejectGuard(new Error("timeout guard expired")), 250)
          )
        ])
      ).resolves.toMatchObject({
        ok: false,
        status: null,
        timedOut: true
      });
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolveClose, rejectClose) =>
        server.close((error) => (error ? rejectClose(error) : resolveClose()))
      );
    }
  });
});
