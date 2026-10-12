import type { IncidentAnalysis, IncidentAnalysisListResponse } from "@signaldesk/contracts";
import { apiGet, apiPost } from "./api";

export function listAnalyses(id: string, signal?: AbortSignal): Promise<IncidentAnalysisListResponse> {
  return apiGet<IncidentAnalysisListResponse>(`/api/incidents/${encodeURIComponent(id)}/analyses`, signal);
}

export function analyzeIncident(id: string, idempotencyKey: string): Promise<IncidentAnalysis> {
  return apiPost<IncidentAnalysis>(`/api/incidents/${encodeURIComponent(id)}/analyze`, { idempotencyKey });
}
