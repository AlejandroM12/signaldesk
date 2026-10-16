export const CAPABILITIES_PATH = "/api/capabilities" as const;

export type ApiCapabilities = {
  canEditIncidents: boolean;
  canIngestEvents: boolean;
  canAnalyzeIncidents: boolean;
  canViewMetrics: boolean;
};
