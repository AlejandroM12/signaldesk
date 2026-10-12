import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { APP_METRICS, type AppMetrics } from "./app-metrics";
import {
  durationMs,
  normalizeMethod,
  normalizeRoute,
  normalizeStatus,
  resolveRequestId,
  runWithRequestId,
  writeOperationalLog,
} from "./request-context";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(@Inject(APP_METRICS) private readonly metrics: AppMetrics) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = resolveRequestId(request.headers["x-request-id"]);
    const started = process.hrtime.bigint();
    response.setHeader("X-Request-Id", requestId);
    runWithRequestId(requestId, () => {
      response.on("finish", () => {
        const method = normalizeMethod(request.method);
        const route = normalizeRoute(request);
        const status = normalizeStatus(response.statusCode);
        const elapsed = durationMs(started);
        try {
          this.metrics.recordHttp({ method, route, status, durationMs: elapsed });
          if (method === "POST" && route === "/api/events" && (status === 400 || status >= 500)) {
            this.metrics.recordEventRejected();
          }
        } catch {
          // Metrics must not affect the response.
        }
        writeOperationalLog({
          msg: "http_request",
          requestId,
          method,
          route,
          status,
          durationMs: Math.round(elapsed * 1000) / 1000,
        });
      });
      next();
    });
  }
}
