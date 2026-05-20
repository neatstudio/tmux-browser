#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));

function parseArgs(argv) {
  const options = {
    from: "",
    out: "",
    to: "HEAD",
    version: packageJson.version ?? "0.0.0",
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--from") {
      options.from = argv[++index] ?? "";
      continue;
    }

    if (arg === "--out") {
      options.out = resolve(rootDir, argv[++index] ?? "");
      continue;
    }

    if (arg === "--to") {
      options.to = argv[++index] ?? "HEAD";
      continue;
    }

    if (arg === "--version") {
      options.version = argv[++index] ?? options.version;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
}

function parseVersion(value) {
  const match = value.match(/^v?(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareVersions(left, right) {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

export function findPreviousVersionTag(version) {
  const currentVersion = parseVersion(version);

  if (!currentVersion) {
    return "";
  }

  const tags = runGit(["tag", "--list", "v[0-9]*", "--sort=-v:refname"])
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean);

  for (const tag of tags) {
    const tagVersion = parseVersion(tag);

    if (tagVersion && compareVersions(tagVersion, currentVersion) < 0) {
      return tag;
    }
  }

  return "";
}

export function gitLog(from, to) {
  const range = from ? `${from}..${to}` : to;
  const output = runGit(["log", "--format=%h%x09%s", range]);

  if (!output) {
    return [];
  }

  return output.split("\n").map((line) => {
    const [hash = "", ...subjectParts] = line.split("\t");

    return {
      hash,
      subject: subjectParts.join("\t").trim()
    };
  });
}

function categorizeCommit(subject) {
  const normalized = subject.toLowerCase();

  if (/^(fix|harden|preserve|verify|repair)\b/.test(normalized)) {
    return "Fixes";
  }

  if (/^(docs?|document|clarify|readme|chore: release)\b/.test(normalized)) {
    return "Docs and Release";
  }

  if (
    normalized.includes("service") ||
    normalized.includes("release") ||
    normalized.includes("pack") ||
    normalized.includes("publish") ||
    normalized.includes("launchd") ||
    normalized.includes("systemd") ||
    normalized.includes("health")
  ) {
    return "Release and Operations";
  }

  if (
    normalized.includes("terminal") ||
    normalized.includes("session") ||
    normalized.includes("dashboard") ||
    normalized.includes("image") ||
    normalized.includes("renderer") ||
    normalized.includes("prompt") ||
    normalized.includes("title") ||
    normalized.includes("mobile") ||
    normalized.includes("scroll") ||
    normalized.includes("history") ||
    normalized.includes("client version")
  ) {
    return "Terminal and UI";
  }

  return "Other";
}

function formatCommit(commit) {
  return `- ${commit.subject} (\`${commit.hash}\`)`;
}

export function formatReleaseNotes({ commits, from, version }) {
  const title = `# tmux-ui v${version}`;
  const rangeLabel = from ? `Changes since ${from}.` : "Initial release notes.";
  const lines = [
    title,
    "",
    rangeLabel,
    "",
    `Total commits: ${commits.length}`,
    ""
  ];

  if (commits.length === 0) {
    lines.push("No commits found for this release.", "");
    return `${lines.join("\n").trimEnd()}\n`;
  }

  const groups = new Map();

  for (const commit of commits) {
    const group = categorizeCommit(commit.subject);
    const entries = groups.get(group) ?? [];
    entries.push(commit);
    groups.set(group, entries);
  }

  for (const group of [
    "Terminal and UI",
    "Fixes",
    "Release and Operations",
    "Docs and Release",
    "Other"
  ]) {
    const entries = groups.get(group);

    if (!entries?.length) {
      continue;
    }

    lines.push(`## ${group}`, "");
    lines.push(...entries.map(formatCommit), "");
  }

  lines.push("## All Commits", "");
  lines.push(...commits.map(formatCommit), "");

  return `${lines.join("\n").trimEnd()}\n`;
}

function showHelp() {
  console.log(`tmux-ui release notes

Usage:
  npm run release:notes -- [--from v0.1.8] [--to HEAD] [--out release/release-notes.md]

Options:
  --from tag       Previous release tag. Defaults to latest lower v<version> tag.
  --to ref         Git ref to include. Default: HEAD.
  --version value  Release version. Default: package.json version.
  --out path       Write markdown to a file instead of stdout.
`);
}

try {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const from = options.from || findPreviousVersionTag(options.version);
  const commits = gitLog(from, options.to);
  const notes = formatReleaseNotes({
    commits,
    from,
    version: options.version
  });

  if (options.out) {
    const outputDir = dirname(options.out);

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(options.out, notes, "utf8");
  } else {
    process.stdout.write(notes);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
