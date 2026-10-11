import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentTeam,
} from "../../generated/prisma/enums";

export type IngestedEvent = {
  id: string;
  source: string;
  externalId: string | null;
  incidentId: string;
  service: string;
  errorType: string;
  message: string;
  timestamp: string;
  metadata: unknown;
  createdAt: string;
};

export type IngestedIncident = {
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
};

export type IngestEventResponse = {
  incidentCreated: boolean;
  event: IngestedEvent;
  incident: IngestedIncident;
};
