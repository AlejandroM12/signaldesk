import { createRequire } from "node:module";
import type { AnalysisProviderErrorCounts } from "@signaldesk/contracts";
import type { AnalysisMetric } from "./app-metrics";

const loadModule = createRequire(__filename);

export const NEW_RELIC_ANALYSIS_METRICS = {
  success: "SignalDesk/Analysis/Success",
  failure: "SignalDesk/Analysis/Failure",
  discarded: "SignalDesk/Analysis/Discarded",
  durationMs: "SignalDesk/Analysis/DurationMs",
  rateLimitRejected: "SignalDesk/RateLimit/Rejected",
  failureTimeout: "SignalDesk/Analysis/Failure/Timeout",
  failureInvalidOutput: "SignalDesk/Analysis/Failure/InvalidOutput",
  failureProvider: "SignalDesk/Analysis/Failure/Provider",
  failureProviderRateLimit: "SignalDesk/Analysis/Failure/ProviderRateLimit",
  failureNotConfigured: "SignalDesk/Analysis/Failure/NotConfigured",
} as const;

const FAILURE_CATEGORIES: Record<keyof AnalysisProviderErrorCounts, string> = {
  timeout: NEW_RELIC_ANALYSIS_METRICS.failureTimeout,
  invalid_output: NEW_RELIC_ANALYSIS_METRICS.failureInvalidOutput,
  provider: NEW_RELIC_ANALYSIS_METRICS.failureProvider,
  rate_limit: NEW_RELIC_ANALYSIS_METRICS.failureProviderRateLimit,
  not_configured: NEW_RELIC_ANALYSIS_METRICS.failureNotConfigured,
};

export type NewRelicCustomMetrics = {
  incrementMetric(name: string, value?: number): void;
  recordMetric(name: string, value: number): void;
};

type AgentGlobals = typeof globalThis & {
  __signaldeskNewRelic?: boolean;
};

export function recordAnalysisCustomMetric(
  input: AnalysisMetric,
  resolveApi: () => NewRelicCustomMetrics | null = loadStartedAgent,
): void {
  try {
    const api = resolveApi();
    if (!api) {
      return;
    }
    api.recordMetric(NEW_RELIC_ANALYSIS_METRICS.durationMs, finiteDuration(input.durationMs));
    if (input.outcome === "success") {
      api.incrementMetric(NEW_RELIC_ANALYSIS_METRICS.success, 1);
      return;
    }
    if (input.outcome === "discarded") {
      api.incrementMetric(NEW_RELIC_ANALYSIS_METRICS.discarded, 1);
      return;
    }
    api.incrementMetric(NEW_RELIC_ANALYSIS_METRICS.failure, 1);
    const category = input.providerError ? FAILURE_CATEGORIES[input.providerError] : undefined;
    if (category) {
      api.incrementMetric(category, 1);
    }
  } catch {
    // Custom metrics must not affect analysis.
  }
}

export function recordRateLimitCustomMetric(
  resolveApi: () => NewRelicCustomMetrics | null = loadStartedAgent,
): void {
  try {
    resolveApi()?.incrementMetric(NEW_RELIC_ANALYSIS_METRICS.rateLimitRejected, 1);
  } catch {
    // Custom metrics must not affect analysis.
  }
}

function loadStartedAgent(): NewRelicCustomMetrics | null {
  if ((globalThis as AgentGlobals).__signaldeskNewRelic !== true) {
    return null;
  }
  const loaded = loadModule("newrelic") as Partial<NewRelicCustomMetrics>;
  if (typeof loaded.incrementMetric !== "function" || typeof loaded.recordMetric !== "function") {
    return null;
  }
  return {
    incrementMetric: (name, value) => loaded.incrementMetric?.(name, value),
    recordMetric: (name, value) => loaded.recordMetric?.(name, value),
  };
}

function finiteDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}
