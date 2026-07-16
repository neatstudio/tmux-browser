import { describe, expect, it } from "vitest";
import { createServer } from "node:http";

import {
  compareRelativeBudget,
  parseCliOptions,
  summarizeMutations,
  summarizeSamples,
  summarizeFetches,
  timedFetch
} from "../../scripts/bench-runtime-hotpaths.mjs";

describe("runtime hotpath benchmark helpers", () => {
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
});
