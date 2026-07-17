import { describe, expect, it } from "vitest";

import {
  parseStoreBenchmarkOptions,
  summarizeStoreBenchmark
} from "../../scripts/bench-dashboard-store";

describe("dashboard store microbenchmark", () => {
  it("parses event counts and rate", () => {
    expect(
      parseStoreBenchmarkOptions(["--store-events", "100,500", "--rate", "20"])
    ).toEqual({ eventCounts: [100, 500], rate: 20 });
  });

  it("rejects missing, duplicate, and invalid options", () => {
    expect(() => parseStoreBenchmarkOptions([])).toThrow("--store-events");
    expect(() =>
      parseStoreBenchmarkOptions(["--store-events", "100,0", "--rate", "20"])
    ).toThrow("positive integers");
    expect(() =>
      parseStoreBenchmarkOptions([
        "--store-events", "100", "--store-events", "500", "--rate", "20"
      ])
    ).toThrow("Duplicate");
  });

  it("summarizes throughput and rejects ordering regressions", () => {
    expect(
      summarizeStoreBenchmark({
        eventCount: 100,
        elapsedMs: 10,
        retainedEventIds: ["100", "99", "98"],
        expectedRetainedEventIds: ["100", "99", "98"],
        rate: 20
      })
    ).toMatchObject({
      eventCount: 100,
      eventsPerSecond: 10_000,
      orderingPassed: true,
      rateHeadroom: 500
    });

    expect(() =>
      summarizeStoreBenchmark({
        eventCount: 2,
        elapsedMs: 1,
        retainedEventIds: ["1", "2"],
        expectedRetainedEventIds: ["2", "1"],
        rate: 20
      })
    ).toThrow("ordering regression");
  });
});
