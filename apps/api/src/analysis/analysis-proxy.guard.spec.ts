import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { AnalysisProxyGuard } from "./analysis-proxy.guard";
import { ANALYSIS_PROXY_FORBIDDEN, ANALYSIS_PROXY_SECRET_HEADER } from "./analysis-proxy-secret";

const SECRET = "0123456789abcdef";

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

function context(secret?: string | string[]): ExecutionContext {
  const headers: Record<string, string | string[] | undefined> = {};
  if (secret !== undefined) {
    headers[ANALYSIS_PROXY_SECRET_HEADER] = secret;
  }
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as ExecutionContext;
}

describe("AnalysisProxyGuard", () => {
  it("allows a direct post when the public demo is off", () => {
    const guard = new AnalysisProxyGuard(config({ PUBLIC_DEMO_MODE: "false", ANALYSIS_PROVIDER_MODE: "openai" }));

    expect(guard.canActivate(context())).toBe(true);
  });

  it("rejects a public demo request without a secret or with the wrong secret", () => {
    const guard = new AnalysisProxyGuard(
      config({ PUBLIC_DEMO_MODE: "true", ANALYSIS_PROVIDER_MODE: "demo", ANALYSIS_PROXY_SECRET: SECRET }),
    );

    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context("wrong-secret-value"))).toThrow(ANALYSIS_PROXY_FORBIDDEN);
    expect(() => guard.canActivate(context([SECRET, SECRET]))).toThrow(ANALYSIS_PROXY_FORBIDDEN);
  });

  it("fails closed when the public demo secret is not configured", () => {
    const guard = new AnalysisProxyGuard(config({ PUBLIC_DEMO_MODE: "true", ANALYSIS_PROVIDER_MODE: "demo" }));

    expect(() => guard.canActivate(context(SECRET))).toThrow(ANALYSIS_PROXY_FORBIDDEN);
  });

  it("allows the public demo post when the secret matches", () => {
    const guard = new AnalysisProxyGuard(
      config({ PUBLIC_DEMO_MODE: "true", ANALYSIS_PROVIDER_MODE: "demo", ANALYSIS_PROXY_SECRET: SECRET }),
    );

    expect(guard.canActivate(context(SECRET))).toBe(true);
    expect(JSON.stringify(ANALYSIS_PROXY_FORBIDDEN)).not.toContain(SECRET);
  });
});
