import type {
  IncidentDetail,
  IncidentListResponse,
  IncidentSeverity,
  IncidentStatus,
  IncidentTeam,
} from "@signaldesk/contracts";
import { apiGet } from "./api";

export type IncidentListQuery = {
  page: number;
  limit: number;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  service?: string;
  team?: IncidentTeam;
};

export function listIncidents(
  query: IncidentListQuery,
  signal?: AbortSignal,
): Promise<IncidentListResponse> {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("limit", String(query.limit));

  if (query.status) {
    params.set("status", query.status);
  }
  if (query.severity) {
    params.set("severity", query.severity);
  }
  if (query.service) {
    params.set("service", query.service);
  }
  if (query.team) {
    params.set("team", query.team);
  }

  return apiGet<IncidentListResponse>(`/api/incidents?${params.toString()}`, signal);
}

export function getIncident(id: string, signal?: AbortSignal): Promise<IncidentDetail> {
  return apiGet<IncidentDetail>(`/api/incidents/${encodeURIComponent(id)}`, signal);
}
