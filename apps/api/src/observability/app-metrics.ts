import type {
  AnalysisProviderErrorCounts,
  AnalysisQuotaSnapshot,
  HttpMetricSample,
  MetricsResponse,
} from "@signaldesk/contracts";
import { recordAnalysisCustomMetric, recordRateLimitCustomMetric } from "./newrelic-metrics";

export const APP_METRICS = Symbol("APP_METRICS");

export type AnalysisMetricOutcome = "success" | "failure" | "discarded";

export type AnalysisMetric = {
  outcome: AnalysisMetricOutcome;
  durationMs: number;
  providerError?: keyof AnalysisProviderErrorCounts;
};

export interface AppMetrics {
  recordHttp(input: { method: string; route: string; status: number; durationMs: number }): void;
  recordEventAccepted(incidentCreated: boolean): void;
  recordEventDuplicate(): void;
  recordEventRejected(): void;
  recordAnalysis(input: AnalysisMetric): void;
  recordAnalysisQuotaRejected(): void;
  snapshot(): MetricsResponse;
}

const emptyProviderErrors = (): AnalysisProviderErrorCounts => ({
  timeout: 0,
  rate_limit: 0,
  provider: 0,
  invalid_output: 0,
  not_configured: 0,
});

export function emptyMetricsSnapshot(): MetricsResponse {
  return {
    sinceProcessStart: true,
    http: { requests: 0, errors: 0, durationMsTotal: 0, samples: [] },
    events: { accepted: 0, rejected: 0, duplicates: 0 },
    incidents: { created: 0 },
    analysis: {
      succeeded: 0,
      failed: 0,
      discarded: 0,
      quotaRejected: 0,
      providerCalls: 0,
      durationMsTotal: 0,
      providerErrors: emptyProviderErrors(),
    },
    analysisQuota: null,
  };
}

export const noopAppMetrics: AppMetrics = {
  recordHttp() {},
  recordEventAccepted() {},
  recordEventDuplicate() {},
  recordEventRejected() {},
  recordAnalysis() {},
  recordAnalysisQuotaRejected() {},
  snapshot: emptyMetricsSnapshot,
};

const ROUTE_PATTERN = /^\/[A-Za-z0-9/:._-]*$/;
const METHOD_PATTERN = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|OTHER)$/;
const PROVIDER_ERRORS = new Set<keyof AnalysisProviderErrorCounts>([
  "timeout",
  "rate_limit",
  "provider",
  "invalid_output",
  "not_configured",
]);
const MAX_HTTP_SAMPLES = 50;

type HttpBucket = HttpMetricSample;

export class InMemoryAppMetrics implements AppMetrics {
  private readonly http = new Map<string, HttpBucket>();
  private requests = 0;
  private errors = 0;
  private httpDurationMsTotal = 0;
  private eventsAccepted = 0;
  private eventsRejected = 0;
  private eventsDuplicate = 0;
  private incidentsCreated = 0;
  private analysisSucceeded = 0;
  private analysisFailed = 0;
  private analysisDiscarded = 0;
  private analysisQuotaRejected = 0;
  private providerCalls = 0;
  private analysisDurationMsTotal = 0;
  private readonly providerErrors = emptyProviderErrors();

  recordHttp(input: { method: string; route: string; status: number; durationMs: number }): void {
    try {
      const method = METHOD_PATTERN.test(input.method) ? input.method : "OTHER";
      const route = input.route.length <= 120 && ROUTE_PATTERN.test(input.route) ? input.route : "unmatched";
      const status =
        Number.isInteger(input.status) && input.status >= 100 && input.status <= 599 ? input.status : 0;
      const durationMs = finiteDuration(input.durationMs);
      const key = `${method} ${route} ${status}`;
      const current = this.http.get(key);
      if (current) {
        current.count += 1;
        current.durationMsTotal += durationMs;
        current.durationMsMax = Math.max(current.durationMsMax, durationMs);
      } else if (this.http.size < MAX_HTTP_SAMPLES) {
        this.http.set(key, { method, route, status, count: 1, durationMsTotal: durationMs, durationMsMax: durationMs });
      }
      this.requests += 1;
      this.httpDurationMsTotal += durationMs;
      if (status >= 400) {
        this.errors += 1;
      }
    } catch {
      // Metrics must not affect the request.
    }
  }

  recordEventAccepted(incidentCreated: boolean): void {
    try {
      this.eventsAccepted += 1;
      if (incidentCreated) {
        this.incidentsCreated += 1;
      }
    } catch {
      // Metrics must not affect the request.
    }
  }

  recordEventDuplicate(): void {
    try {
      this.eventsDuplicate += 1;
    } catch {
      // Metrics must not affect the request.
    }
  }

  recordEventRejected(): void {
    try {
      this.eventsRejected += 1;
    } catch {
      // Metrics must not affect the request.
    }
  }

  recordAnalysis(input: AnalysisMetric): void {
    try {
      const durationMs = finiteDuration(input.durationMs);
      this.providerCalls += 1;
      this.analysisDurationMsTotal += durationMs;
      if (input.outcome === "success") {
        this.analysisSucceeded += 1;
      } else if (input.outcome === "failure") {
        this.analysisFailed += 1;
      } else {
        this.analysisDiscarded += 1;
      }
      if (input.providerError && PROVIDER_ERRORS.has(input.providerError)) {
        this.providerErrors[input.providerError] += 1;
      }
      recordAnalysisCustomMetric({ ...input, durationMs });
    } catch {
      // Metrics must not affect the request.
    }
  }

  recordAnalysisQuotaRejected(): void {
    try {
      this.analysisQuotaRejected += 1;
      recordRateLimitCustomMetric();
    } catch {
      // Metrics must not affect the request.
    }
  }

  snapshot(analysisQuota: AnalysisQuotaSnapshot | null = null): MetricsResponse {
    return {
      sinceProcessStart: true,
      http: {
        requests: this.requests,
        errors: this.errors,
        durationMsTotal: this.httpDurationMsTotal,
        samples: [...this.http.values()].map((sample) => ({ ...sample })),
      },
      events: {
        accepted: this.eventsAccepted,
        rejected: this.eventsRejected,
        duplicates: this.eventsDuplicate,
      },
      incidents: { created: this.incidentsCreated },
      analysis: {
        succeeded: this.analysisSucceeded,
        failed: this.analysisFailed,
        discarded: this.analysisDiscarded,
        quotaRejected: this.analysisQuotaRejected,
        providerCalls: this.providerCalls,
        durationMsTotal: this.analysisDurationMsTotal,
        providerErrors: { ...this.providerErrors },
      },
      analysisQuota,
    };
  }
}

function finiteDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}
