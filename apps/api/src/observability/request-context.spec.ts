import { Logger, BadRequestException } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { InMemoryAppMetrics } from "./app-metrics";
import { ObservabilityExceptionFilter } from "./observability-exception.filter";
import { RequestContextMiddleware } from "./request-context.middleware";
import { currentRequestId, resolveRequestId } from "./request-context";

describe("request context", () => {
  const logs: string[] = [];
  let logError: jest.SpiedFunction<typeof Logger.error>;

  beforeEach(() => {
    logs.length = 0;
    logError = jest.spyOn(Logger, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger, "log").mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("generates a request id when the header is missing or invalid and keeps a valid one", () => {
    expect(resolveRequestId(undefined)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(resolveRequestId("bad id")).not.toBe("bad id");
    expect(resolveRequestId("a".repeat(80))).toHaveLength(36);
    expect(resolveRequestId(["req_12345678", "other"])).not.toBe("req_12345678");
    expect(resolveRequestId("req_12345678")).toBe("req_12345678");
  });

  it("returns the generated id and logs the request without bodies or secrets", () => {
    const metrics = new InMemoryAppMetrics();
    const middleware = new RequestContextMiddleware(metrics);
    let seen: string | undefined;
    const response = mockResponse();
    const request = {
      method: "GET",
      headers: {
        authorization: "Bearer secret-token",
        "x-request-id": "bad id",
      },
      baseUrl: "",
      route: { path: "/api/health" },
      url: "/api/health?token=secret-token",
      body: { message: "SECRET-BODY" },
    };

    middleware.use(request as unknown as Request, response as unknown as Response, (() => {
      seen = currentRequestId();
    }) as NextFunction);
    response.finish();

    expect(seen).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.setHeader).toHaveBeenCalledWith("X-Request-Id", seen);
    const line = logs.find((entry) => entry.includes("http_request"));
    expect(line).toContain(seen);
    expect(line).toContain("\"route\":\"/api/health\"");
    expect(line).toContain("\"status\":204");
    expect(line).toContain("durationMs");
    expect(line).not.toContain("secret-token");
    expect(line).not.toContain("SECRET-BODY");
    expect(line).not.toContain("bad id");
    expect(metrics.snapshot().http.requests).toBe(1);
    expect(metrics.snapshot().http.samples[0]?.durationMsTotal).toBeGreaterThanOrEqual(0);
  });

  it("logs an unknown failure once without the exception text", () => {
    const reply = jest.fn();
    const filter = new ObservabilityExceptionFilter({
      httpAdapter: { reply, isHeadersSent: () => false },
    } as never);
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: "POST", baseUrl: "", route: { path: "/api/events" } }),
        getResponse: () => ({}),
      }),
    };

    filter.catch(new Error("password=secret"), host as never);

    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      { statusCode: 500, message: "Internal server error" },
      500,
    );
    expect(logs.join("\n")).toContain("http_error");
    expect(logs.join("\n")).not.toContain("password");
    expect(logError).not.toHaveBeenCalled();

    logs.length = 0;
    filter.catch(new BadRequestException("invalid"), host as never);
    expect(logs.join("\n")).not.toContain("http_error");
  });
});

function mockResponse() {
  let finish = (): void => undefined;
  return {
    statusCode: 204,
    setHeader: jest.fn(),
    on(event: string, callback: () => void) {
      if (event === "finish") {
        finish = callback;
      }
    },
    finish() {
      finish();
    },
  };
}
