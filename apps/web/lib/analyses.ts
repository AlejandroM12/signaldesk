import type { IncidentAnalysis, IncidentAnalysisListResponse } from "@signaldesk/contracts";
import { apiGet, apiPost } from "./api";

export function listAnalyses(id: string, signal?: AbortSignal): Promise<IncidentAnalysisListResponse> {
  return apiGet<IncidentAnalysisListResponse>(`/api/incidents/${encodeURIComponent(id)}/analyses`, signal);
}

export function analyzeIncident(id: string, idempotencyKey: string): Promise<IncidentAnalysis> {
  return apiPost<IncidentAnalysis>(`/api/incidents/${encodeURIComponent(id)}/analyze`, { idempotencyKey });
}

/**
 * True when the client cannot treat the attempt as finished.
 * 0 has no response, so the row may already exist.
 * 409 tells the client to retry that same key.
 * 500 can be returned after the row was stored.
 * 429 and 503 are finished responses: nothing was stored, and a later attempt is a new operation.
 */
export function analysisRetryReusesKey(status: number): boolean {
  return status === 0 || status === 409 || status === 500;
}
