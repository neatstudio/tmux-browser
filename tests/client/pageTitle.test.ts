import { describe, expect, it } from "vitest";

import {
  getCompactPageTitle,
  getShortHostLabel
} from "../../src/client/pageTitle";

describe("pageTitle", () => {
  it("uses the last IPv4 segment in the compact browser tab title", () => {
    expect(getCompactPageTitle("100.89.0.116")).toBe("BTD(116)");
  });

  it("uses local for localhost", () => {
    expect(getShortHostLabel("localhost")).toBe("local");
  });

  it("uses the first hostname segment for domains", () => {
    expect(getCompactPageTitle("tw0.example.test")).toBe("BTD(tw0)");
  });
});
