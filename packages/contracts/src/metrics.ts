export const METRICS_PATH = "/api/metrics" as const;
export const HEALTH_READY_PATH = "/api/health/ready" as const;

export type HealthReadyResponse = {
  status: "ok";
  service: "signaldesk-api";
  database: "ok";
};

export type HttpMetricSample = {
  method: string;
  route: string;
  status: number;
  count: number;
  durationMsTotal: number;
  durationMsMax: number;
};

export type AnalysisProviderErrorCounts = {
  timeout: number;
  rate_limit: number;
  provider: number;
  invalid_output: number;
  not_configured: number;
};

export type AnalysisQuotaSnapshot = {
  limit: number;
  windowMs: number;
  requestCount: number;
};

export type MetricsResponse = {
  sinceProcessStart: true;
  http: {
    requests: number;
    errors: number;
    durationMsTotal: number;
    samples: HttpMetricSample[];
  };
  events: {
    accepted: number;
    rejected: number;
    duplicates: number;
  };
  incidents: {
    created: number;
  };
  analysis: {
    succeeded: number;
    failed: number;
    discarded: number;
    quotaRejected: number;
    providerCalls: number;
    durationMsTotal: number;
    providerErrors: AnalysisProviderErrorCounts;
  };
  analysisQuota: AnalysisQuotaSnapshot | null;
};
