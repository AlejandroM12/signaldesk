import { CAPABILITIES_PATH, type ApiCapabilities } from "@signaldesk/contracts";
import { ApiError, apiGet } from "@/lib/api";

export async function getApiCapabilities(signal?: AbortSignal): Promise<ApiCapabilities> {
  return readCapabilitiesPayload(await apiGet<unknown>(CAPABILITIES_PATH, signal));
}

export function readCapabilitiesPayload(value: unknown): ApiCapabilities {
  if (!value || typeof value !== "object") {
    throw new ApiError(0, "La API no informó las capacidades.");
  }

  const record = value as Record<string, unknown>;
  return {
    canEditIncidents: requiredBoolean(record.canEditIncidents),
    canIngestEvents: requiredBoolean(record.canIngestEvents),
    canAnalyzeIncidents: requiredBoolean(record.canAnalyzeIncidents),
    canViewMetrics: requiredBoolean(record.canViewMetrics),
  };
}

function requiredBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new ApiError(0, "La API no informó las capacidades.");
  }

  return value;
}
