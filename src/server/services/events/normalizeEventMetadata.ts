export type EventMetadata = Record<string, string | number | boolean | null>;

const MAX_STRING_BYTES = 2 * 1024;
const MAX_METADATA_BYTES = 16 * 1024;
const MAX_METADATA_ENTRIES = 24;
const TRUNCATED_SUFFIX = "[truncated]";
const TRUNCATED_SUFFIX_BYTES = Buffer.byteLength(TRUNCATED_SUFFIX, "utf8");
const RESERVED_METADATA_KEYS = new Set([
  "status",
  "source",
  "eventtype",
  "body",
  "taskid",
  "target",
  "actions",
  "content"
]);

const DISPLAY_STATS: Record<string, { max: number; integer: boolean }> = {
  fileschanged: { max: 100_000, integer: true },
  testspassed: { max: 1_000_000, integer: true },
  testsfailed: { max: 1_000_000, integer: true },
  durationms: { max: 86_400_000, integer: false }
};

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string) {
  return ["token", "secret", "password", "authorization", "cookie"].some(
    (fragment) => key.includes(fragment)
  ) || key.endsWith("key");
}

function truncateUtf8(value: string) {
  if (Buffer.byteLength(value, "utf8") <= MAX_STRING_BYTES) {
    return value;
  }

  let result = "";
  let bytes = 0;
  const contentLimit = MAX_STRING_BYTES - TRUNCATED_SUFFIX_BYTES;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > contentLimit) {
      break;
    }
    result += character;
    bytes += characterBytes;
  }
  return `${result}${TRUNCATED_SUFFIX}`;
}

function normalizeValue(key: string, value: unknown) {
  if (isSensitiveKey(key)) {
    return "[redacted]";
  }

  const stat = DISPLAY_STATS[key];
  if (stat) {
    return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= stat.max &&
      (!stat.integer || Number.isInteger(value))
      ? value
      : undefined;
  }

  if (typeof value === "string") return truncateUtf8(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean" || value === null) return value;
  return undefined;
}

export function normalizeEventMetadata(value: unknown): EventMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const accepted: Array<[string, string | number | boolean | null]> = [];
  const seen = new Set<string>();
  let truncated = entries.length > MAX_METADATA_ENTRIES;

  for (const [originalKey, rawValue] of entries.slice(0, MAX_METADATA_ENTRIES)) {
    const trimmedKey = originalKey.trim();
    const fullNormalizedKey = normalizedKey(trimmedKey);
    const key = fullNormalizedKey.slice(0, 80);
    const collisionKey = key;
    if (collisionKey === "truncated") {
      truncated = true;
      continue;
    }
    if (RESERVED_METADATA_KEYS.has(collisionKey)) continue;
    if (!key || !collisionKey) continue;
    if (seen.has(collisionKey)) {
      console.warn(`Dropped colliding event metadata key "${collisionKey}"`);
      continue;
    }
    seen.add(collisionKey);

    const normalizedValue = normalizeValue(fullNormalizedKey, rawValue);
    if (normalizedValue === undefined) continue;

    const candidate = [...accepted, [key, normalizedValue] as const];
    const withMarker = Object.fromEntries([
      ["_truncated", true] as const,
      ...candidate
    ]);
    if (Buffer.byteLength(JSON.stringify(withMarker), "utf8") > MAX_METADATA_BYTES) {
      truncated = true;
      break;
    }
    accepted.push([key, normalizedValue]);
  }

  if (accepted.length === 0 && !truncated) return undefined;
  return Object.fromEntries([
    ...(truncated ? [["_truncated", true] as const] : []),
    ...accepted
  ]);
}
