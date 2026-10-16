import type { AnalysisConfidence, IncidentSeverity, IncidentStatus, IncidentTeam } from "@signaldesk/contracts";

export const statusLabels: Record<IncidentStatus, string> = {
  OPEN: "Abierto",
  INVESTIGATING: "Investigando",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

export const severityLabels: Record<IncidentSeverity, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export const teamLabels: Record<IncidentTeam, string> = {
  FRONTEND: "Frontend",
  BACKEND: "Backend",
  UNKNOWN: "Sin equipo",
};

export const statusStyles: Record<IncidentStatus, string> = {
  OPEN: "bg-status-open text-status-open-ink",
  INVESTIGATING: "bg-status-investigating text-status-investigating-ink",
  RESOLVED: "bg-status-resolved text-status-resolved-ink",
  CLOSED: "bg-status-closed text-status-closed-ink",
};

export const severityStyles: Record<IncidentSeverity, string> = {
  LOW: "bg-severity-low",
  MEDIUM: "bg-severity-medium",
  HIGH: "bg-severity-high",
  CRITICAL: "bg-severity-critical",
};

export const confidenceStyles: Record<AnalysisConfidence, string> = {
  LOW: "bg-confidence-low",
  MEDIUM: "bg-confidence-medium",
  HIGH: "bg-confidence-high",
};
