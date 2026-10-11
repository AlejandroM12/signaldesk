export {
  EDITABLE_INCIDENT_STATUSES,
  INCIDENT_ACTIVITY_ACTIONS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_TEAMS,
  type EditableIncidentStatus,
  type IncidentActivityAction,
  type IncidentActivityChange,
  type IncidentActivityChanges,
  type IncidentActivityEntry,
  type IncidentActivityResponse,
  type IncidentDetail,
  type IncidentEventView,
  type IncidentListItem,
  type IncidentListResponse,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentSummary,
  type IncidentTeam,
} from "./incidents.js";

export const API_SERVICE_NAME = "signaldesk-api" as const;

export const HEALTH_PATH = "/api/health" as const;

export type HealthResponse = {
  status: "ok";
  service: typeof API_SERVICE_NAME;
};
