import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module";
import { PublicDemoGuard } from "./public-demo.guard";
import {
  isPublicDemoRequestBlocked,
  PUBLIC_DEMO_FORBIDDEN,
  readApiCapabilities,
  readPublicDemoConfig,
} from "./public-demo";

function config(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function context(method: string, path: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, originalUrl: path }),
    }),
  } as ExecutionContext;
}

describe("readPublicDemoConfig", () => {
  it("keeps the full local API when the flag is absent or false", () => {
    expect(readPublicDemoConfig({})).toEqual({ enabled: false });
    expect(readPublicDemoConfig({ PUBLIC_DEMO_MODE: "false", ANALYSIS_PROVIDER_MODE: "openai" })).toEqual({
      enabled: false,
    });
  });

  it("rejects a public demo that is not explicitly demo", () => {
    expect(() => readPublicDemoConfig({ PUBLIC_DEMO_MODE: "true" })).toThrow(
      "PUBLIC_DEMO_MODE=true exige ANALYSIS_PROVIDER_MODE=demo",
    );
    expect(() => readPublicDemoConfig({ PUBLIC_DEMO_MODE: "true", ANALYSIS_PROVIDER_MODE: "openai" })).toThrow(
      "PUBLIC_DEMO_MODE=true exige ANALYSIS_PROVIDER_MODE=demo",
    );
    expect(() => readPublicDemoConfig({ PUBLIC_DEMO_MODE: "true", ANALYSIS_PROVIDER_MODE: "openai" })).toThrow(
      /no es válido/,
    );
  });

  it("allows startup only when public demo selects demo explicitly", () => {
    expect(readPublicDemoConfig({ PUBLIC_DEMO_MODE: " true ", ANALYSIS_PROVIDER_MODE: " demo " })).toEqual({
      enabled: true,
    });
  });

  it("rejects any other flag without echoing it", () => {
    expect(() => readPublicDemoConfig({ PUBLIC_DEMO_MODE: "sk-secret" })).toThrow(
      "PUBLIC_DEMO_MODE debe ser true o false.",
    );
  });
});

describe("readApiCapabilities", () => {
  it("keeps edit, ingest, and analysis available outside the public demo", () => {
    expect(readApiCapabilities({})).toEqual({
      canEditIncidents: true,
      canIngestEvents: true,
      canAnalyzeIncidents: true,
      canViewMetrics: true,
    });
    expect(readApiCapabilities({ PUBLIC_DEMO_MODE: "false", ANALYSIS_PROVIDER_MODE: "openai" })).toEqual({
      canEditIncidents: true,
      canIngestEvents: true,
      canAnalyzeIncidents: true,
      canViewMetrics: true,
    });
  });

  it("derives the public demo from the same blocked routes", () => {
    const capabilities = readApiCapabilities({ PUBLIC_DEMO_MODE: "true", ANALYSIS_PROVIDER_MODE: "demo" });

    expect(capabilities).toEqual({
      canEditIncidents: !isPublicDemoRequestBlocked("PATCH", "/api/incidents/example"),
      canIngestEvents: !isPublicDemoRequestBlocked("POST", "/api/events"),
      canAnalyzeIncidents: !isPublicDemoRequestBlocked("POST", "/api/incidents/example/analyze"),
      canViewMetrics: !isPublicDemoRequestBlocked("GET", "/api/metrics"),
    });
    expect(capabilities).toEqual({
      canEditIncidents: false,
      canIngestEvents: false,
      canAnalyzeIncidents: true,
      canViewMetrics: false,
    });
  });
});

describe("isPublicDemoRequestBlocked", () => {
  it("blocks ingest, incident edits, and metrics only", () => {
    expect(isPublicDemoRequestBlocked("POST", "/api/events")).toBe(true);
    expect(isPublicDemoRequestBlocked("PATCH", "/api/incidents/11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isPublicDemoRequestBlocked("GET", "/api/metrics")).toBe(true);
    expect(isPublicDemoRequestBlocked("GET", "/api/capabilities")).toBe(false);
    expect(isPublicDemoRequestBlocked("GET", "/api/health")).toBe(false);
    expect(isPublicDemoRequestBlocked("GET", "/api/health/ready")).toBe(false);
    expect(isPublicDemoRequestBlocked("GET", "/api/incidents")).toBe(false);
    expect(isPublicDemoRequestBlocked("GET", "/api/incidents/11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(isPublicDemoRequestBlocked("GET", "/api/incidents/11111111-1111-4111-8111-111111111111/activity")).toBe(
      false,
    );
    expect(isPublicDemoRequestBlocked("GET", "/api/incidents/11111111-1111-4111-8111-111111111111/analyses")).toBe(
      false,
    );
    expect(isPublicDemoRequestBlocked("POST", "/api/incidents/11111111-1111-4111-8111-111111111111/analyze")).toBe(
      false,
    );
  });
});

describe("PublicDemoGuard", () => {
  it("does not block local requests when the flag is off", () => {
    const guard = new PublicDemoGuard(config({}));

    expect(guard.canActivate(context("POST", "/api/events"))).toBe(true);
    expect(guard.canActivate(context("PATCH", "/api/incidents/11111111-1111-4111-8111-111111111111"))).toBe(true);
    expect(guard.canActivate(context("GET", "/api/metrics"))).toBe(true);
  });

  it("blocks the public write and metrics routes", () => {
    const guard = new PublicDemoGuard(config({ PUBLIC_DEMO_MODE: "true", ANALYSIS_PROVIDER_MODE: "demo" }));

    expect(() => guard.canActivate(context("POST", "/api/events"))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context("GET", "/api/metrics?since=1"))).toThrow(PUBLIC_DEMO_FORBIDDEN);
    expect(guard.canActivate(context("GET", "/api/health"))).toBe(true);
    expect(guard.canActivate(context("GET", "/api/capabilities"))).toBe(true);
    expect(
      guard.canActivate(context("POST", "/api/incidents/11111111-1111-4111-8111-111111111111/analyze")),
    ).toBe(true);
  });
});

describe("public demo startup", () => {
  const previous = {
    PUBLIC_DEMO_MODE: process.env.PUBLIC_DEMO_MODE,
    ANALYSIS_PROVIDER_MODE: process.env.ANALYSIS_PROVIDER_MODE,
    ANALYSIS_PROXY_SECRET: process.env.ANALYSIS_PROXY_SECRET,
  };

  afterEach(() => {
    restore("PUBLIC_DEMO_MODE", previous.PUBLIC_DEMO_MODE);
    restore("ANALYSIS_PROVIDER_MODE", previous.ANALYSIS_PROVIDER_MODE);
    restore("ANALYSIS_PROXY_SECRET", previous.ANALYSIS_PROXY_SECRET);
  });

  it("refuses to boot a public demo configured with openai", async () => {
    process.env.PUBLIC_DEMO_MODE = "true";
    process.env.ANALYSIS_PROVIDER_MODE = "openai";

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      "PUBLIC_DEMO_MODE=true exige ANALYSIS_PROVIDER_MODE=demo",
    );
  });

  it("refuses to boot a public demo without the proxy secret", async () => {
    process.env.PUBLIC_DEMO_MODE = "true";
    process.env.ANALYSIS_PROVIDER_MODE = "demo";
    process.env.ANALYSIS_PROXY_SECRET = "";

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      "ANALYSIS_PROXY_SECRET es obligatorio en la demo pública.",
    );
  });
});

function restore(
  name: "PUBLIC_DEMO_MODE" | "ANALYSIS_PROVIDER_MODE" | "ANALYSIS_PROXY_SECRET",
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
