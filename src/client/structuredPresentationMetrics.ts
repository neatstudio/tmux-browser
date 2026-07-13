export const STRUCTURED_PRESENTATION_METRICS = [
  "conversation_total",
  "hook_total",
  "missing_producer_summary",
  "fallback_text",
  "fallback_code",
  "fallback_command",
  "fallback_image",
  "fallback_status",
  "attention_total"
] as const;

export type StructuredPresentationMetric =
  (typeof STRUCTURED_PRESENTATION_METRICS)[number];

export type StructuredPresentationMetricSnapshot = Partial<
  Record<StructuredPresentationMetric, number>
>;

export type StructuredPresentationMetrics = ReturnType<
  typeof createStructuredPresentationMetrics
>;

export type StructuredPresentationObservation = {
  kind: "conversation" | "hook";
  producerSummary: "present" | "missing" | "not-applicable";
  fallback: "none" | "text" | "code" | "command" | "image" | "status";
  attention: boolean;
  count?: number;
};

const VALID_METRICS = new Set<string>(STRUCTURED_PRESENTATION_METRICS);

export function createStructuredPresentationMetrics() {
  const counters: StructuredPresentationMetricSnapshot = {};

  return {
    increment(metric: StructuredPresentationMetric, count = 1) {
      if (!VALID_METRICS.has(metric)) {
        throw new TypeError("Unknown structured presentation metric");
      }
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new TypeError("Metric count must be a non-negative integer");
      }
      counters[metric] = (counters[metric] ?? 0) + count;
    },
    snapshot(): StructuredPresentationMetricSnapshot {
      return { ...counters };
    }
  };
}

export function recordStructuredPresentationObservation(
  metrics: StructuredPresentationMetrics,
  observation: StructuredPresentationObservation
) {
  const count = observation.count ?? 1;
  metrics.increment(observation.kind === "conversation" ? "conversation_total" : "hook_total", count);
  if (observation.producerSummary === "missing") {
    metrics.increment("missing_producer_summary", count);
  }
  if (observation.fallback !== "none") {
    metrics.increment(`fallback_${observation.fallback}`, count);
  }
  if (observation.attention) metrics.increment("attention_total", count);
}
