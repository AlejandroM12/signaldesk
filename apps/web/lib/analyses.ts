import type { IncidentAnalysis, IncidentAnalysisListResponse } from "@signaldesk/contracts";
import { ApiError, apiGet, readErrorMessage } from "./api";

export function listAnalyses(id: string, signal?: AbortSignal): Promise<IncidentAnalysisListResponse> {
  return apiGet<IncidentAnalysisListResponse>(`/api/incidents/${encodeURIComponent(id)}/analyses`, signal);
}

export async function analyzeIncident(id: string, idempotencyKey: string): Promise<IncidentAnalysis> {
  let response: Response;
  try {
    response = await fetch(`/api/incidents/${encodeURIComponent(id)}/analyze`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idempotencyKey }),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(0, "No se pudo conectar con la API.");
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }

  return (await response.json()) as IncidentAnalysis;
}

/**
 * True when the client cannot treat the attempt as finished.
 * 0 has no response, so the row may already exist.
 * 409 tells the client to retry that same key.
 * 500 can be returned after the row was stored.
 * 502 and 504 are ambiguous proxy or upstream failures, including a timeout.
 * 429 and 503 are finished responses: nothing was stored, and a later attempt is a new operation.
 */
export function analysisRetryReusesKey(status: number): boolean {
  return status === 0 || status === 409 || status === 500 || status === 502 || status === 504;
}
