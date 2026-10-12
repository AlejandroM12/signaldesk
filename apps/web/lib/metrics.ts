import { METRICS_PATH, type MetricsResponse } from "@signaldesk/contracts";
import { apiGet } from "@/lib/api";

export function getMetrics(signal?: AbortSignal): Promise<MetricsResponse> {
  return apiGet<MetricsResponse>(METRICS_PATH, signal);
}
