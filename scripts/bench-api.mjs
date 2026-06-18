import { performance } from "node:perf_hooks";

const baseUrl = process.argv[2] || process.env.BASE_URL || "http://127.0.0.1:3000";
const runs = Number(process.argv[3] || process.env.RUNS || 5);

const targets = [
  { name: "health", path: "/api/health" },
  { name: "sessions", path: "/api/sessions" },
  { name: "sessions-all", path: "/api/sessions-all" },
  { name: "sessions-panes", path: "/api/sessions-panes" },
  { name: "kanban-projects", path: "/api/kanban/projects" }
];

async function timedFetch(path) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`);
    const body = await response.text();
    const durationMs = performance.now() - startedAt;

    return {
      ok: response.ok,
      status: response.status,
      durationMs,
      bytes: Buffer.byteLength(body),
      body
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch ${baseUrl}${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

  return {
    avg: total / samples.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1]
  };
}

try {
  const sessions = await timedFetch("/api/sessions");

  if (sessions.ok) {
    const [firstSession] = JSON.parse(sessions.body);

    if (firstSession?.name) {
      targets.push({
        name: "session-status",
        path: `/api/sessions/${encodeURIComponent(firstSession.name)}/status`
      });
    }
  }
} catch {
  // Keep the main benchmark error focused on the first measured target below.
}

for (const target of targets) {
  const durations = [];
  const sizes = [];
  let lastStatus = 0;
  let allOk = true;
  let failed = false;

  for (let index = 0; index < runs; index += 1) {
    let result;

    try {
      result = await timedFetch(target.path);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      failed = true;
      break;
    }

    durations.push(result.durationMs);
    sizes.push(result.bytes);
    lastStatus = result.status;
    allOk &&= result.ok;
  }

  if (failed) {
    break;
  }

  const durationStats = summarize(durations);
  const sizeStats = summarize(sizes);

  console.log(
    [
      target.name.padEnd(16),
      `status=${lastStatus}`,
      `ok=${allOk}`,
      `avg=${durationStats.avg.toFixed(1)}ms`,
      `p50=${durationStats.p50.toFixed(1)}ms`,
      `p95=${durationStats.p95.toFixed(1)}ms`,
      `min=${durationStats.min.toFixed(1)}ms`,
      `max=${durationStats.max.toFixed(1)}ms`,
      `bytes~${Math.round(sizeStats.avg)}`
    ].join(" ")
  );
}
