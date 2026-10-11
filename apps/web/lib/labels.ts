import type { IncidentSeverity, IncidentStatus, IncidentTeam } from "@signaldesk/contracts";

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
  OPEN: "bg-amber-100 text-amber-950",
  INVESTIGATING: "bg-sky-100 text-sky-950",
  RESOLVED: "bg-emerald-100 text-emerald-950",
  CLOSED: "bg-zinc-200 text-zinc-950",
};

export const severityStyles: Record<IncidentSeverity, string> = {
  LOW: "bg-zinc-200 text-zinc-950",
  MEDIUM: "bg-amber-100 text-amber-950",
  HIGH: "bg-orange-200 text-orange-950",
  CRITICAL: "bg-red-200 text-red-950",
};
