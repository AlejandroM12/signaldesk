import type { ApiCapabilities } from "@signaldesk/contracts";

export const PUBLIC_DEMO_FORBIDDEN = "Esta operación no está disponible en la demo pública.";

type PublicDemoEnv = {
  PUBLIC_DEMO_MODE?: string;
  ANALYSIS_PROVIDER_MODE?: string;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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

/**
 * Collapse Express-equivalent path variants before comparing allow/deny rules.
 * Express matches case-insensitively and ignores a trailing slash by default,
 * but `originalUrl` keeps the client spelling; the guard must not.
 */
export function normalizePublicDemoPath(path: string): string {
  const withoutQuery = path.split("?")[0]?.split("#")[0] ?? "";
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    decoded = withoutQuery;
  }

  const segments = decoded
    .replace(/\\/g, "/")
    .toLowerCase()
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return `/${resolved.join("/")}`;
}

function isMetricsPath(pathname: string): boolean {
  return pathname === "/api/metrics" || pathname.startsWith("/api/metrics/");
}

function isAllowedPublicDemoRead(pathname: string): boolean {
  if (
    pathname === "/api/health" ||
    pathname === "/api/health/ready" ||
    pathname === "/api/capabilities" ||
    pathname === "/api/incidents"
  ) {
    return true;
  }
  if (/^\/api\/incidents\/[^/]+$/.test(pathname)) {
    return true;
  }
  if (/^\/api\/incidents\/[^/]+\/activity$/.test(pathname)) {
    return true;
  }
  if (/^\/api\/incidents\/[^/]+\/analyses$/.test(pathname)) {
    return true;
  }
  if (/^\/api\/incidents\/[^/]+\/analyses\/[^/]+$/.test(pathname)) {
    return true;
  }
  return false;
}

function isAllowedPublicDemoAnalyze(pathname: string): boolean {
  return /^\/api\/incidents\/[^/]+\/analyze$/.test(pathname);
}

export function isPublicDemoRequestBlocked(method: string, path: string): boolean {
  const verb = method.toUpperCase();
  const pathname = normalizePublicDemoPath(path);

  if (isMetricsPath(pathname)) {
    return true;
  }

  if (verb === "OPTIONS") {
    return false;
  }

  if (SAFE_METHODS.has(verb)) {
    return !isAllowedPublicDemoRead(pathname);
  }

  if (verb === "POST" && isAllowedPublicDemoAnalyze(pathname)) {
    return false;
  }

  return true;
}
