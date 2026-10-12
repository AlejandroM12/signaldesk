import { createRequire } from "node:module";
import {
  NEW_RELIC_ANALYSIS_METRICS,
  recordAnalysisCustomMetric,
  recordRateLimitCustomMetric,
  type NewRelicCustomMetrics,
} from "./newrelic-metrics";

const loadModule = createRequire(__filename);

describe("New Relic analysis metrics", () => {
  afterEach(() => {
    delete (globalThis as { __signaldeskNewRelic?: boolean }).__signaldeskNewRelic;
  });

  it("counts a successful analysis and its monotonic duration once", () => {
    const api = fakeApi();
    recordAnalysisCustomMetric({ outcome: "success", durationMs: 18.5 }, () => api.metrics);

    expect(api.incrementMetric).toHaveBeenCalledTimes(1);
    expect(api.incrementMetric).toHaveBeenCalledWith(NEW_RELIC_ANALYSIS_METRICS.success, 1);
    expect(api.recordMetric).toHaveBeenCalledTimes(1);
    expect(api.recordMetric).toHaveBeenCalledWith(NEW_RELIC_ANALYSIS_METRICS.durationMs, 18.5);
  });

  it("counts timeout and invalid output as failures with a fixed category", () => {
    const timeout = fakeApi();
    recordAnalysisCustomMetric(
      { outcome: "failure", durationMs: 20_000, providerError: "timeout" },
      () => timeout.metrics,
    );
    expect(timeout.incrementMetric).toHaveBeenNthCalledWith(1, NEW_RELIC_ANALYSIS_METRICS.failure, 1);
    expect(timeout.incrementMetric).toHaveBeenNthCalledWith(2, NEW_RELIC_ANALYSIS_METRICS.failureTimeout, 1);
    expect(timeout.recordMetric).toHaveBeenCalledWith(NEW_RELIC_ANALYSIS_METRICS.durationMs, 20_000);
    expect(timeout.incrementMetric).not.toHaveBeenCalledWith(NEW_RELIC_ANALYSIS_METRICS.success, 1);

    const invalid = fakeApi();
    recordAnalysisCustomMetric(
      { outcome: "failure", durationMs: 40, providerError: "invalid_output" },
      () => invalid.metrics,
    );
    expect(invalid.incrementMetric).toHaveBeenNthCalledWith(1, NEW_RELIC_ANALYSIS_METRICS.failure, 1);
    expect(invalid.incrementMetric).toHaveBeenNthCalledWith(2, NEW_RELIC_ANALYSIS_METRICS.failureInvalidOutput, 1);
    expect(invalid.recordMetric).toHaveBeenCalledWith(NEW_RELIC_ANALYSIS_METRICS.durationMs, 40);
  });

  it("counts a local rate-limit rejection without a duration", () => {
    const api = fakeApi();
    recordRateLimitCustomMetric(() => api.metrics);

    expect(api.incrementMetric).toHaveBeenCalledTimes(1);
    expect(api.incrementMetric).toHaveBeenCalledWith(NEW_RELIC_ANALYSIS_METRICS.rateLimitRejected, 1);
    expect(api.recordMetric).not.toHaveBeenCalled();
  });

  it("does nothing and does not load the agent when New Relic is not started", () => {
    expect(() => recordAnalysisCustomMetric({ outcome: "failure", durationMs: 5, providerError: "timeout" })).not.toThrow();
    expect(() => recordRateLimitCustomMetric()).not.toThrow();
    expect(loadModule.cache[loadModule.resolve("newrelic")]).toBeUndefined();
  });

  it("ignores a failing agent and keeps metric names free of request data", () => {
    const names = Object.values(NEW_RELIC_ANALYSIS_METRICS).join(" ");
    expect(names).not.toMatch(/incident|prompt|sk-|http:|@/i);

    expect(() =>
      recordAnalysisCustomMetric({ outcome: "success", durationMs: 1 }, () => {
        throw new Error("agent unavailable");
      }),
    ).not.toThrow();

    const api = fakeApi();
    api.incrementMetric.mockImplementation(() => {
      throw new Error("collector down");
    });
    expect(() => recordAnalysisCustomMetric({ outcome: "success", durationMs: Number.NaN }, () => api.metrics)).not.toThrow();
    expect(api.recordMetric).toHaveBeenCalledWith(NEW_RELIC_ANALYSIS_METRICS.durationMs, 0);
  });
});

function fakeApi(): { incrementMetric: jest.Mock; recordMetric: jest.Mock; metrics: NewRelicCustomMetrics } {
  const incrementMetric = jest.fn();
  const recordMetric = jest.fn();
  return {
    incrementMetric,
    recordMetric,
    metrics: { incrementMetric, recordMetric },
  };
}
