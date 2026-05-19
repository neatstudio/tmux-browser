import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type ImageUploadResult = {
  ok: true;
  absolutePath: string;
  contentType: string;
  size: number;
};

export type ImageUploadOptions = {
  uploadDir?: string;
  retentionMs?: number;
  maxTotalBytes?: number;
};

const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

type ImageSignature = {
  contentType: string;
  extension: string;
};

export class ImageUploadError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
  }
}

function sanitizeSessionName(sessionName: string | undefined) {
  const sanitized = (sessionName || "session")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "session";
}

function getUploadRoot(uploadDir: string | undefined) {
  return resolve(uploadDir ?? join(homedir(), ".tmux-ui", "uploads"));
}

function detectImageSignature(buffer: Buffer): ImageSignature | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { contentType: "image/png", extension: ".png" };
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: "image/jpeg", extension: ".jpg" };
  }

  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return { contentType: "image/gif", extension: ".gif" };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", extension: ".webp" };
  }

  return null;
}

function collectFiles(root: string) {
  const files: Array<{ path: string; mtimeMs: number; size: number }> = [];

  if (!existsSync(root)) {
    return files;
  }

  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stats = statSync(entryPath);
      files.push({
        path: entryPath,
        mtimeMs: stats.mtimeMs,
        size: stats.size
      });
    }
  };

  visit(root);

  return files;
}

export function cleanupUploadedImages(options: ImageUploadOptions = {}) {
  const root = getUploadRoot(options.uploadDir);
  const retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const now = Date.now();
  let files = collectFiles(root);

  for (const file of files) {
    if (now - file.mtimeMs > retentionMs) {
      rmSync(file.path, { force: true });
    }
  }

  files = collectFiles(root).sort((left, right) => left.mtimeMs - right.mtimeMs);

  let totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  for (const file of files) {
    if (totalBytes <= maxTotalBytes) {
      break;
    }

    rmSync(file.path, { force: true });
    totalBytes -= file.size;
  }
}

export async function saveUploadedImage(
  body: Buffer,
  sessionName: string | undefined,
  options: ImageUploadOptions = {}
): Promise<ImageUploadResult> {
  if (body.length === 0) {
    throw new ImageUploadError("Image upload is empty", 400);
  }

  if (body.length > MAX_IMAGE_UPLOAD_BYTES) {
    throw new ImageUploadError("Image upload is too large", 413);
  }

  const signature = detectImageSignature(body);

  if (!signature) {
    throw new ImageUploadError("Unsupported image upload", 415);
  }

  const root = getUploadRoot(options.uploadDir);
  cleanupUploadedImages(options);

  const sessionDir = join(root, sanitizeSessionName(sessionName));
  mkdirSync(sessionDir, { recursive: true });

  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const filePath = join(sessionDir, `${stamp}-${randomUUID()}${signature.extension}`);

  await new Promise<void>((resolveWrite, rejectWrite) => {
    const stream = createWriteStream(filePath, { flags: "wx" });
    stream.on("error", rejectWrite);
    stream.on("finish", resolveWrite);
    stream.end(body);
  });

  return {
    ok: true,
    absolutePath: resolve(filePath),
    contentType: signature.contentType,
    size: body.length
  };
}
