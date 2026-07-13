import {
  chmodSync,
  linkSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

const SECRET_ERROR =
  "TMUX_UI_TIMELINE_CURSOR_SECRET must encode exactly 32 bytes as canonical base64url";

function decodeSecret(value: string) {
  const normalized = value.trim();
  const secret = Buffer.from(normalized, "base64url");
  if (
    value !== normalized ||
    secret.length !== 32 ||
    secret.toString("base64url") !== normalized
  ) {
    throw new Error(SECRET_ERROR);
  }
  return secret;
}

function readPersistedSecret(secretPath: string) {
  const value = readFileSync(secretPath, "utf8").replace(/\n$/, "");
  const secret = decodeSecret(value);
  chmodSync(secretPath, 0o600);
  return secret;
}

export function loadTimelineCursorSecret(options: {
  envSecret?: string;
  secretPath?: string;
} = {}) {
  const envSecret = options.envSecret ?? process.env.TMUX_UI_TIMELINE_CURSOR_SECRET;
  if (envSecret !== undefined) {
    return decodeSecret(envSecret);
  }

  const secretPath = options.secretPath ??
    join(homedir(), ".tmux-ui", "timeline-cursor-secret");
  try {
    return readPersistedSecret(secretPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  mkdirSync(dirname(secretPath), { recursive: true, mode: 0o700 });
  const generated = randomBytes(32);
  const temporaryPath = `${secretPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(temporaryPath, `${generated.toString("base64url")}\n`, {
    flag: "wx",
    mode: 0o600
  });
  try {
    try {
      linkSync(temporaryPath, secretPath);
      chmodSync(secretPath, 0o600);
      return generated;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return readPersistedSecret(secretPath);
    }
  } finally {
    unlinkSync(temporaryPath);
  }
}
