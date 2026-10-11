import type {
  EditableIncidentStatus,
  IncidentActivityResponse,
  IncidentDetail,
  IncidentListResponse,
  IncidentSeverity,
  IncidentStatus,
  IncidentTeam,
} from "@signaldesk/contracts";
import { apiGet, apiPatch } from "./api";

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

export type IncidentUpdate = {
  expectedUpdatedAt: string;
  status?: EditableIncidentStatus;
  rootCause?: string | null;
  resolution?: string | null;
  team?: IncidentTeam;
  assignee?: string | null;
};

export function updateIncident(id: string, body: IncidentUpdate): Promise<IncidentDetail> {
  return apiPatch<IncidentDetail>(`/api/incidents/${encodeURIComponent(id)}`, body);
}

export function getIncidentActivity(id: string, signal?: AbortSignal): Promise<IncidentActivityResponse> {
  return apiGet<IncidentActivityResponse>(`/api/incidents/${encodeURIComponent(id)}/activity`, signal);
}
