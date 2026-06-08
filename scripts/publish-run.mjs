#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const defaultRunFile = join(rootDir, "release", "release.run");
const defaultConfigFile = join(rootDir, ".tmux-ui.publish.json");

function parseArgs(argv) {
  const options = {
    runFile: defaultRunFile,
    remoteName: "tmux.run",
    targets: [],
    install: false,
    restart: false,
    serviceInstall: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--run-file") {
      options.runFile = resolve(rootDir, argv[++index] ?? "");
      continue;
    }

    if (arg === "--remote-name") {
      options.remoteName = argv[++index] ?? options.remoteName;
      continue;
    }

    if (arg === "--target") {
      options.targets.push(parseTarget(argv[++index] ?? ""));
      continue;
    }

    if (arg === "--install") {
      options.install = true;
      continue;
    }

    if (arg === "--restart") {
      options.restart = true;
      continue;
    }

    if (arg === "--service-install") {
      options.serviceInstall = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseTarget(value) {
  const separatorIndex = value.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error(`Invalid target "${value}". Expected host:/absolute/path`);
  }

  const host = value.slice(0, separatorIndex);
  const directory = value.slice(separatorIndex + 1);

  if (!directory.startsWith("/")) {
    throw new Error(`Invalid target "${value}". Directory must be absolute`);
  }

  return { host, directory };
}

function readConfigTargets() {
  if (!existsSync(defaultConfigFile)) {
    return [];
  }

  const config = JSON.parse(readFileSync(defaultConfigFile, "utf8"));

  if (!Array.isArray(config.targets)) {
    return [];
  }

  return config.targets.map((target) => {
    if (typeof target === "string") {
      return parseTarget(target);
    }

    if (
      target &&
      typeof target.host === "string" &&
      typeof target.directory === "string"
    ) {
      return parseTarget(`${target.host}:${target.directory}`);
    }

    throw new Error("Invalid .tmux-ui.publish.json target entry");
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function showHelp() {
  console.log(`tmux-ui publish

Usage:
  npm run publish -- --target host:/absolute/dir [--install] [--restart]

Options:
  --target host:/dir       Upload target. Can be repeated.
  --run-file path          Run file to upload. Default: release/release.run
  --remote-name name       Remote filename. Default: tmux.run
  --install                Run <remote>/tmux.run install after upload
  --restart                Run <remote>/tmux.run restart after upload
  --service-install        Run <remote>/tmux.run service-install after upload

Local config:
  If no --target is provided, publish reads .tmux-ui.publish.json when present.
  This file is intentionally git-ignored.

Example .tmux-ui.publish.json:
  {"targets":["server-a:/root/tmux","server-b:/root/tmux"]}
`);
}

function publishTarget(runFile, remoteName, target, options) {
  const remotePath = `${target.directory.replace(/\/$/, "")}/${remoteName}`;
  const remoteFile = `${target.host}:${remotePath}`;

  run("ssh", [target.host, "mkdir", "-p", target.directory]);
  run("scp", [runFile, remoteFile]);
  run("ssh", [target.host, "chmod", "+x", remotePath]);

  if (options.serviceInstall) {
    run("ssh", [target.host, remotePath, "service-install"]);
  } else if (options.install) {
    run("ssh", [target.host, remotePath, "install"]);

    if (options.restart) {
      run("ssh", [target.host, remotePath, "restart"]);
    }
  } else if (options.restart) {
    run("ssh", [target.host, remotePath, "restart"]);
  }

  console.log(`Published ${runFile} to ${remoteFile}`);
}

try {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const targets = options.targets.length > 0 ? options.targets : readConfigTargets();

  if (targets.length === 0) {
    showHelp();
    process.exit(0);
  }

  if (!existsSync(options.runFile)) {
    throw new Error(`Run file not found: ${options.runFile}`);
  }

  targets.forEach((target) =>
    publishTarget(options.runFile, options.remoteName, target, options)
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
