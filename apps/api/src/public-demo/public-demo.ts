import type { ApiCapabilities } from "@signaldesk/contracts";

export const PUBLIC_DEMO_FORBIDDEN = "Esta operación no está disponible en la demo pública.";

type PublicDemoEnv = {
  PUBLIC_DEMO_MODE?: string;
  ANALYSIS_PROVIDER_MODE?: string;
};

export function readPublicDemoConfig(env: PublicDemoEnv): { enabled: boolean } {
  const flag = env.PUBLIC_DEMO_MODE?.trim() ?? "";
  if (flag === "" || flag === "false") {
    return { enabled: false };
  }
  if (flag !== "true") {
    throw new Error("PUBLIC_DEMO_MODE debe ser true o false.");
  }
  const mode = env.ANALYSIS_PROVIDER_MODE?.trim() ?? "";
  if (mode !== "demo") {
    throw new Error(
      "PUBLIC_DEMO_MODE=true exige ANALYSIS_PROVIDER_MODE=demo. El valor por defecto openai no es válido en la demo pública.",
    );
  }
  return { enabled: true };
}

export function readApiCapabilities(env: PublicDemoEnv): ApiCapabilities {
  const { enabled } = readPublicDemoConfig(env);
  if (!enabled) {
    return {
      canEditIncidents: true,
      canIngestEvents: true,
      canAnalyzeIncidents: true,
      canViewMetrics: true,
    };
  }

  return {
    canEditIncidents: !isPublicDemoRequestBlocked("PATCH", "/api/incidents/example"),
    canIngestEvents: !isPublicDemoRequestBlocked("POST", "/api/events"),
    canAnalyzeIncidents: !isPublicDemoRequestBlocked("POST", "/api/incidents/example/analyze"),
    canViewMetrics: !isPublicDemoRequestBlocked("GET", "/api/metrics"),
  };
}

export function isPublicDemoRequestBlocked(method: string, path: string): boolean {
  const verb = method.toUpperCase();
  const pathname = path.split("?")[0] ?? "";
  if (verb === "POST" && pathname === "/api/events") {
    return true;
  }
  if (verb === "GET" && pathname === "/api/metrics") {
    return true;
  }
  if (verb === "PATCH" && /^\/api\/incidents\/[^/]+$/.test(pathname)) {
    return true;
  }
  return false;
}
