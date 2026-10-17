import { createHash, timingSafeEqual } from "node:crypto";
import { readPublicDemoConfig } from "../public-demo/public-demo";

export const ANALYSIS_PROXY_SECRET_HEADER = "x-signaldesk-analysis-secret";
export const ANALYSIS_PROXY_SECRET_MIN_LENGTH = 16;
export const ANALYSIS_PROXY_FORBIDDEN = "No se pudo autorizar el análisis.";
export const ANALYSIS_PROXY_SECRET_REQUIRED = "ANALYSIS_PROXY_SECRET es obligatorio en la demo pública.";

type ProxySecretEnv = {
  PUBLIC_DEMO_MODE?: string;
  ANALYSIS_PROVIDER_MODE?: string;
  ANALYSIS_PROXY_SECRET?: string;
};

export function assertPublicDemoProxySecret(env: ProxySecretEnv): void {
  if (!readPublicDemoConfig(env).enabled) {
    return;
  }
  const secret = env.ANALYSIS_PROXY_SECRET?.trim() ?? "";
  if (secret.length < ANALYSIS_PROXY_SECRET_MIN_LENGTH) {
    throw new Error(ANALYSIS_PROXY_SECRET_REQUIRED);
  }
}

export function readProxySecretHeader(headers: Record<string, string | string[] | undefined>): string {
  const value = headers[ANALYSIS_PROXY_SECRET_HEADER];
  return typeof value === "string" ? value : "";
}

export function proxySecretsMatch(expected: string, provided: string): boolean {
  const left = createHash("sha256").update(expected, "utf8").digest();
  const right = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(left, right);
}
