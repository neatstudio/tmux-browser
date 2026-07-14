import { describe, expect, it } from "vitest";

import {
  createStructuredPresentationMetrics,
  recordStructuredPresentationObservation,
  STRUCTURED_PRESENTATION_METRICS
} from "../../src/client/structuredPresentationMetrics";

describe("structured presentation metrics", () => {
  it("stores only fixed categorical counters", () => {
    const metrics = createStructuredPresentationMetrics();
    metrics.increment("conversation_total");
    metrics.increment("fallback_text", 2);
    metrics.increment("attention_total");

    expect(metrics.snapshot()).toEqual({
      conversation_total: 1,
      fallback_text: 2,
      attention_total: 1
    });
    expect(STRUCTURED_PRESENTATION_METRICS).toContain("missing_producer_summary");
  });

  it("rejects unknown string keys and invalid counts at runtime", () => {
    const metrics = createStructuredPresentationMetrics();
    expect(() => metrics.increment("private summary" as never)).toThrow(/metric/i);
    expect(() => metrics.increment("hook_total", -1)).toThrow(/count/i);
    expect(metrics.snapshot()).toEqual({});
  });

  it("records only categorical adaptation observations", () => {
    const metrics = createStructuredPresentationMetrics();
    recordStructuredPresentationObservation(metrics, {
      kind: "conversation",
      producerSummary: "missing",
      fallback: "command",
      attention: true,
      count: 2
    });

    expect(metrics.snapshot()).toEqual({
      conversation_total: 2,
      missing_producer_summary: 2,
      fallback_command: 2,
      attention_total: 2
    });
  });
});
