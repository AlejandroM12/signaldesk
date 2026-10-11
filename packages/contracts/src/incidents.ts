export const INCIDENT_STATUSES = ["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_TEAMS = ["FRONTEND", "BACKEND", "UNKNOWN"] as const;
export type IncidentTeam = (typeof INCIDENT_TEAMS)[number];

export type IncidentSummary = {
  open: number;
  investigating: number;
  resolved: number;
};

export type IncidentListItem = {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  service: string;
  team: IncidentTeam;
  assignee: string | null;
  createdAt: string;
  eventCount: number;
};

export type IncidentListResponse = {
  items: IncidentListItem[];
  page: number;
  limit: number;
  total: number;
  pageCount: number;
  summary: IncidentSummary;
};

export type IncidentEventView = {
  id: string;
  timestamp: string;
  source: string;
  service: string;
  errorType: string;
  message: string;
  metadata: unknown;
};

export type IncidentDetail = {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  service: string;
  team: IncidentTeam;
  assignee: string | null;
  rootCause: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  eventCount: number;
  events: IncidentEventView[];
};
