#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { createDashboardStore } from "../src/client/state/dashboardStore";

type StoreBenchmarkOptions = {
  eventCounts: number[];
  rate: number;
  output?: string;
};

type StoreBenchmarkSample = {
  eventCount: number;
  elapsedMs: number;
  retainedEventIds: string[];
  expectedRetainedEventIds: string[];
  rate: number;
};

function positiveNumber(flag: string, value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number`);
  }
  return parsed;
}

export function parseStoreBenchmarkOptions(args: string[]): StoreBenchmarkOptions {
  const values = new Map<string, string>();
  const allowed = new Set(["store-events", "rate", "output"]);

  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid option: ${flag ?? ""}`);
    }
    const key = flag.slice(2);
    if (!allowed.has(key)) throw new Error(`Unknown option: ${flag}`);
    if (values.has(key)) throw new Error(`Duplicate option: ${flag}`);
    values.set(key, value);
  }

  const eventCountsValue = values.get("store-events");
  if (!eventCountsValue) throw new Error("--store-events is required");
  const eventCounts = eventCountsValue.split(",").map(Number);
  if (
    eventCounts.length === 0 ||
    eventCounts.some((value) => !Number.isInteger(value) || value <= 0)
  ) {
    throw new Error("--store-events must contain comma-separated positive integers");
  }

  return {
    eventCounts,
    rate: positiveNumber("--rate", values.get("rate")),
    ...(values.has("output") ? { output: values.get("output") } : {})
  };
}

export function summarizeStoreBenchmark(sample: StoreBenchmarkSample) {
  if (!Number.isFinite(sample.elapsedMs) || sample.elapsedMs <= 0) {
    throw new Error("elapsedMs must be a positive finite number");
  }
  const orderingPassed =
    sample.retainedEventIds.length === sample.expectedRetainedEventIds.length &&
    sample.retainedEventIds.every(
      (eventId, index) => eventId === sample.expectedRetainedEventIds[index]
    );
  if (!orderingPassed) throw new Error("dashboard store ordering regression detected");

  const eventsPerSecond = sample.eventCount / (sample.elapsedMs / 1000);
  return {
    eventCount: sample.eventCount,
    elapsedMs: sample.elapsedMs,
    eventsPerSecond,
    targetEventsPerSecond: sample.rate,
    rateHeadroom: eventsPerSecond / sample.rate,
    retainedEvents: sample.retainedEventIds.length,
    orderingPassed
  };
}

function assertNoFullSliceSerialization() {
  const files = [
    "src/client/state/dashboardStore.ts",
    "src/client/state/dashboardStateReconciler.ts"
  ];
  for (const file of files) {
    if (readFileSync(resolve(file), "utf8").includes("JSON.stringify")) {
      throw new Error(`full-slice serialization remains in ${file}`);
    }
  }
}

function runSample(eventCount: number, rate: number) {
  const store = createDashboardStore({ api: {} as never, pollMs: 3000 });
  const baseTime = Date.parse("2026-07-16T00:00:00.000Z");
  const startedAt = performance.now();
  for (let index = 0; index < eventCount; index += 1) {
    store.mergeTimelineEvent({
      id: String(index + 1),
      type: "session-created",
      sessionName: "benchmark",
      message: `event ${index + 1}`,
      createdAt: new Date(baseTime + index).toISOString()
    });
  }
  const elapsedMs = Math.max(performance.now() - startedAt, Number.EPSILON);
  const retainedEventIds = (store.getState().timelineEvents ?? []).map(({ id }) => id);
  const expectedRetainedEventIds = Array.from(
    { length: Math.min(8, eventCount) },
    (_, index) => String(eventCount - index)
  );
  return summarizeStoreBenchmark({
    eventCount,
    elapsedMs,
    retainedEventIds,
    expectedRetainedEventIds,
    rate
  });
}

export function runStoreBenchmark(options: StoreBenchmarkOptions) {
  assertNoFullSliceSerialization();
  return {
    schemaVersion: 1,
    noFullSliceSerialization: true,
    rate: options.rate,
    samples: options.eventCounts.map((eventCount) => runSample(eventCount, options.rate))
  };
}

function main() {
  const options = parseStoreBenchmarkOptions(process.argv.slice(2));
  const report = runStoreBenchmark(options);
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    writeFileSync(resolve(options.output), output, "utf8");
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
