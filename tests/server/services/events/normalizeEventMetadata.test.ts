import { describe, expect, it, vi } from "vitest";

import { normalizeEventMetadata } from "../../../../src/server/services/events/normalizeEventMetadata";

describe("normalizeEventMetadata", () => {
  it("redacts sensitive values and resolves normalized-key collisions deterministically", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const longSensitiveKey = `${"a".repeat(81)}token`;
    const metadata = normalizeEventMetadata({
      z: "last",
      "Api Token": "do-not-persist",
      "Build-ID": "first",
      build_id: "second",
      [longSensitiveKey]: "long-secret",
      a: true
    });

    expect(metadata).toEqual({
      apitoken: "[redacted]",
      buildid: "first",
      ["a".repeat(80)]: "[redacted]",
      a: true,
      z: "last"
    });
    expect(JSON.stringify(metadata)).not.toContain("do-not-persist");
    expect(JSON.stringify(metadata)).not.toContain("long-secret");
    expect(metadata).not.toHaveProperty("build_id");
    expect(warning).toHaveBeenCalledWith(
      'Dropped colliding event metadata key "build_id"; kept "Build-ID"'
    );
    warning.mockRestore();
  });

  it("truncates strings by UTF-8 bytes and never retains the original tail", () => {
    const secretTail = "NEVER-PERSIST";
    const metadata = normalizeEventMetadata({ value: `${"界".repeat(900)}${secretTail}` });
    const value = String(metadata?.value);

    expect(Buffer.byteLength(value.replace("[truncated]", ""), "utf8")).toBeLessThanOrEqual(2048);
    expect(value.endsWith("[truncated]")).toBe(true);
    expect(value).not.toContain(secretTail);
  });

  it("validates display-stat fields while retaining ordinary scalar metadata", () => {
    expect(normalizeEventMetadata({
      filesChanged: 100_000,
      testsPassed: 1_000_000,
      testsFailed: -1,
      durationMs: Number.POSITIVE_INFINITY,
      note: "kept",
      nested: { ignored: true }
    })).toEqual({
      fileschanged: 100_000,
      note: "kept",
      testspassed: 1_000_000
    });
  });

  it("caps serialized user metadata at 16 KiB and marks truncation", () => {
    const input = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `field-${String(index).padStart(2, "0")}`,
        "x".repeat(2000)
      ])
    );
    input._truncated = false;
    const metadata = normalizeEventMetadata(input);

    expect(metadata?._truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(metadata), "utf8")).toBeLessThanOrEqual(16 * 1024);
    expect(Object.keys(metadata ?? {})).toEqual([...Object.keys(metadata ?? {})].sort());
  });
});
