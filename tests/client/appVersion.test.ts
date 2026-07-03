import { describe, expect, it } from "vitest";

import {
  isServerVersionNewer
} from "../../src/client/appVersion";

describe("appVersion", () => {
  it("detects when the server version is newer than the current client bundle", () => {
    expect(isServerVersionNewer("0.2.7", "0.2.6")).toBe(true);
    expect(isServerVersionNewer("0.3.0", "0.2.99")).toBe(true);
    expect(isServerVersionNewer("1.0.0", "0.9.9")).toBe(true);
  });

  it("does not reload for equal or older server versions", () => {
    expect(isServerVersionNewer("0.2.6", "0.2.6")).toBe(false);
    expect(isServerVersionNewer("0.2.5", "0.2.6")).toBe(false);
    expect(isServerVersionNewer("v0.2.6", "0.2.6")).toBe(false);
  });
});
