export const API_SERVICE_NAME = "signaldesk-api" as const;

export const HEALTH_PATH = "/api/health" as const;

export type HealthResponse = {
  status: "ok";
  service: typeof API_SERVICE_NAME;
};
