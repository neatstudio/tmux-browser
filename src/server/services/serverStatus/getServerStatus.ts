import {
  cpus,
  freemem,
  homedir,
  loadavg,
  platform,
  totalmem,
  uptime
} from "node:os";

export type ServerStatus = {
  platform: NodeJS.Platform;
  cpuCount: number;
  loadAverage: [number, number, number];
  loadPercent: number | null;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedPercent: number | null;
  uptimeSeconds: number;
  homeDirectory: string;
};

type ServerStatusDeps = {
  platform?: NodeJS.Platform;
  cpus?: typeof cpus;
  loadavg?: typeof loadavg;
  totalmem?: typeof totalmem;
  freemem?: typeof freemem;
  uptime?: typeof uptime;
  homedir?: typeof homedir;
};

function round(value: number) {
  return Math.round(value);
}

export function getServerStatus(deps: ServerStatusDeps = {}): ServerStatus {
  const cpuCount = (deps.cpus ?? cpus)().length;
  const loadAverage = (deps.loadavg ?? loadavg)() as [number, number, number];
  const memoryTotalBytes = (deps.totalmem ?? totalmem)();
  const memoryFreeBytes = (deps.freemem ?? freemem)();
  const memoryUsedBytes = Math.max(0, memoryTotalBytes - memoryFreeBytes);

  return {
    platform: deps.platform ?? platform(),
    cpuCount,
    loadAverage,
    loadPercent: cpuCount > 0 ? round((loadAverage[0] / cpuCount) * 100) : null,
    memoryTotalBytes,
    memoryFreeBytes,
    memoryUsedPercent:
      memoryTotalBytes > 0 ? round((memoryUsedBytes / memoryTotalBytes) * 100) : null,
    uptimeSeconds: Math.floor((deps.uptime ?? uptime)()),
    homeDirectory: (deps.homedir ?? homedir)()
  };
}
