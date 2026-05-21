#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));

const groupLabels = {
  "Terminal and UI": "终端与界面",
  Fixes: "修复",
  "Release and Operations": "发布与运维",
  "Docs and Release": "文档与发布",
  Other: "其他"
};

function parseArgs(argv) {
  const options = {
    from: "",
    out: "",
    zhOut: "",
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

    if (arg === "--zh-out") {
      options.zhOut = resolve(rootDir, argv[++index] ?? "");
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function releaseAssets(version) {
  return [`release.run`, `tmux-ui-${version}.run`];
}

function describeEnglishCommit(commit) {
  const subject = commit.subject.toLowerCase();
  const summary = [];
  const fixed = [];
  const changed = [];
  const verification = [];

  if (subject.includes("github release notes publishing")) {
    summary.push(
      "Release publishing now produces a readable GitHub Release body instead of leaving stale notes in place."
    );
    fixed.push(
      "GitHub Release notes now use the combined English and Chinese release notes."
    );
    fixed.push(
      "Existing GitHub Releases are updated instead of being skipped."
    );
    fixed.push(
      "Release assets are overwritten with `--clobber` when a release is re-published."
    );
    verification.push("GitHub Actions publishes the run files after tests and packaging pass.");
    return { summary, fixed, changed, verification };
  }

  if (subject.includes("release notes quality")) {
    summary.push(
      "Release notes now read like an operational changelog instead of a duplicated commit list."
    );
    fixed.push("Removed the repeated category plus `All Commits` output.");
    changed.push(
      "Added human-readable `Summary`, `Fixed`, `Changed`, and `Verification` sections."
    );
    changed.push("Importing the release notes module no longer executes the CLI path.");
    verification.push("Release note formatting is covered by a content-level test.");
    return { summary, fixed, changed, verification };
  }

  if (subject.includes("cli installation")) {
    summary.push(
      "The installer now exposes a stable `tmux-ui` command after installation."
    );
    changed.push(
      "`tmux-ui` is linked into a writable bin directory, preferring `~/.local/bin` and falling back to `/usr/local/bin`."
    );
    changed.push("The installer prints the installed CLI path and PATH guidance.");
    verification.push("The packaged run file was smoke-tested with a temporary HOME.");
    return { summary, fixed, changed, verification };
  }

  if (subject.includes("tmux restoration")) {
    summary.push("tmux session restoration can now be installed and managed from tmux-ui.");
    changed.push("Added short tmux restoration commands for install, status, save, restore, and update.");
    changed.push("Startup can safely restore saved tmux sessions when tmux is empty.");
    verification.push("tmux restoration helper commands are covered by release script tests.");
    return { summary, fixed, changed, verification };
  }

  if (subject.includes("node 24")) {
    summary.push("GitHub Actions now runs JavaScript actions on the Node 24 runtime.");
    changed.push("Updated checkout, setup-node, and artifact upload actions to Node 24-compatible versions.");
    verification.push("The Release workflow completed successfully on GitHub Actions.");
    return { summary, fixed, changed, verification };
  }

  const category = categorizeCommit(commit.subject);
  const readableSubject = commit.subject.replace(/^[a-z]+:\s*/i, "");

  if (category === "Fixes") {
    fixed.push(`${readableSubject}.`);
  } else if (category === "Docs and Release") {
    changed.push(`${readableSubject}.`);
  } else {
    summary.push(`${readableSubject}.`);
  }

  return { summary, fixed, changed, verification };
}

function describeChineseCommit(commit) {
  const subject = commit.subject.toLowerCase();
  const summary = [];
  const fixed = [];
  const changed = [];
  const verification = [];

  if (subject.includes("github release notes publishing")) {
    summary.push("Release 发布流程现在会生成可读的 GitHub Release 正文，不再保留旧说明。");
    fixed.push("GitHub Release 正文现在使用英文和中文合并后的 release notes。");
    fixed.push("已存在的 GitHub Release 会被更新，而不是直接跳过。");
    fixed.push("重新发布时会用 `--clobber` 覆盖旧的 `.run` 资产。");
    verification.push("GitHub Actions 会在测试和打包通过后发布 run 文件。");
    return { summary, fixed, changed, verification };
  }

  if (subject.includes("release notes quality")) {
    summary.push("Release notes 现在是面向用户的运维变更说明，不再是重复的 commit 列表。");
    fixed.push("移除了重复的分类列表和 `全部提交` 输出。");
    changed.push("新增可读的 `摘要`、`已修复`、`变更`、`验证` 结构。");
    changed.push("导入 release notes 模块时不再执行 CLI 主流程。");
    verification.push("release notes 的实际输出结构已经加入测试覆盖。");
    return { summary, fixed, changed, verification };
  }

  if (subject.includes("cli installation")) {
    summary.push("安装后现在会提供稳定的 `tmux-ui` 命令。");
    changed.push("`tmux-ui` 会软链到可写的 bin 目录，优先 `~/.local/bin`，再尝试 `/usr/local/bin`。");
    changed.push("安装器会输出 CLI 安装路径和 PATH 提示。");
    verification.push("已用临时 HOME 对打包后的 run 文件做过安装冒烟测试。");
    return { summary, fixed, changed, verification };
  }

  if (subject.includes("tmux restoration")) {
    summary.push("tmux-ui 现在可以安装和管理 tmux session 恢复能力。");
    changed.push("新增 tmux 恢复相关的安装、状态、保存、恢复、更新短命令。");
    changed.push("启动时可以在 tmux 为空时安全恢复已保存 session。");
    verification.push("tmux 恢复 helper 命令已经纳入 release 脚本测试。");
    return { summary, fixed, changed, verification };
  }

  if (subject.includes("node 24")) {
    summary.push("GitHub Actions 的 JavaScript action 运行时已切到 Node 24。");
    changed.push("更新 checkout、setup-node、artifact upload action 到兼容 Node 24 的版本。");
    verification.push("Release workflow 已在 GitHub Actions 上成功完成。");
    return { summary, fixed, changed, verification };
  }

  const category = categorizeCommit(commit.subject);
  const readableSubject = commit.subject.replace(/^[a-z]+:\s*/i, "");

  if (category === "Fixes") {
    fixed.push(`${readableSubject}。`);
  } else if (category === "Docs and Release") {
    changed.push(`${readableSubject}。`);
  } else {
    summary.push(`${readableSubject}。`);
  }

  return { summary, fixed, changed, verification };
}

function buildReleaseSections(commits, describeCommit) {
  const sections = {
    summary: [],
    fixed: [],
    changed: [],
    verification: []
  };

  for (const commit of commits) {
    const description = describeCommit(commit);

    sections.summary.push(...description.summary);
    sections.fixed.push(...description.fixed);
    sections.changed.push(...description.changed);
    sections.verification.push(...description.verification);
  }

  return {
    summary: unique(sections.summary),
    fixed: unique(sections.fixed),
    changed: unique(sections.changed),
    verification: unique(sections.verification)
  };
}

function pushSection(lines, heading, entries) {
  if (!entries.length) {
    return;
  }

  lines.push(heading, "");
  lines.push(...entries.map((entry) => `- ${entry}`), "");
}

function sourceLine(commits, singular, plural) {
  if (!commits.length) {
    return "";
  }

  const hashes = commits.map((commit) => `\`${commit.hash}\``).join(", ");
  const label = commits.length === 1 ? singular : plural;

  return `${label}: ${hashes}`;
}

export function formatReleaseNotes({ commits, from, version }) {
  const title = `# tmux-ui v${version}`;
  const rangeLabel = from ? `Changes since ${from}.` : "Initial release notes.";
  const lines = [title, "", rangeLabel, ""];

  if (commits.length === 0) {
    lines.push("No user-facing changes were detected for this release.", "");
    return `${lines.join("\n").trimEnd()}\n`;
  }

  const sections = buildReleaseSections(commits, describeEnglishCommit);
  sections.verification.push(
    `Published assets: ${releaseAssets(version).map((asset) => `\`${asset}\``).join(" and ")}.`
  );

  pushSection(lines, "## Summary", sections.summary);
  pushSection(lines, "## Fixed", sections.fixed);
  pushSection(lines, "## Changed", sections.changed);
  pushSection(lines, "## Verification", unique(sections.verification));

  const source = sourceLine(commits, "Source commit", "Source commits");
  if (source) {
    lines.push("## Source", "", source, "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function formatChineseReleaseNotes({ commits, from, version }) {
  const title = `# tmux-ui v${version} 更新说明`;
  const rangeLabel = from ? `自 ${from} 以来的更新。` : "初始版本说明。";
  const lines = ["## 中文", "", title, "", rangeLabel, ""];

  if (commits.length === 0) {
    lines.push("本次发布没有检测到面向用户的变更。", "");
    return `${lines.join("\n").trimEnd()}\n`;
  }

  const sections = buildReleaseSections(commits, describeChineseCommit);
  sections.verification.push(
    `发布资产：${releaseAssets(version).map((asset) => `\`${asset}\``).join(" 和 ")}。`
  );

  pushSection(lines, "## 摘要", sections.summary);
  pushSection(lines, "## 已修复", sections.fixed);
  pushSection(lines, "## 变更", sections.changed);
  pushSection(lines, "## 验证", unique(sections.verification));

  const source = sourceLine(commits, "来源提交", "来源提交");
  if (source) {
    lines.push("## 来源", "", source, "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function showHelp() {
  console.log(`tmux-ui release notes

Usage:
  npm run release:notes -- [--from v0.1.8] [--to HEAD] [--out release/release-notes.md] [--zh-out release/release-notes.zh-CN.md]

Options:
  --from tag       Previous release tag. Defaults to latest lower v<version> tag.
  --to ref         Git ref to include. Default: HEAD.
  --version value  Release version. Default: package.json version.
  --out path       Write markdown to a file instead of stdout.
  --zh-out path    Write Chinese markdown release notes to a file.
`);
}

function writeMarkdownFile(path, markdown) {
  const outputDir = dirname(path);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(path, markdown, "utf8");
}

function main() {
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
  const chineseNotes = formatChineseReleaseNotes({
    commits,
    from,
    version: options.version
  });

  if (options.out) {
    writeMarkdownFile(options.out, notes);
  } else {
    process.stdout.write(`${notes}\n${chineseNotes}`);
  }

  if (options.zhOut) {
    writeMarkdownFile(options.zhOut, chineseNotes);
  }
}

const isCli = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isCli) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
