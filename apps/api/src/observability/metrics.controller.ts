import { Controller, Get, Inject } from "@nestjs/common";
import type { MetricsResponse } from "@signaldesk/contracts";
import { APP_METRICS, type AppMetrics } from "./app-metrics";

@Controller("api")
export class MetricsController {
  constructor(@Inject(APP_METRICS) private readonly metrics: AppMetrics) {}

  @Get("metrics")
  getMetrics(): MetricsResponse {
    return this.metrics.snapshot();
  }
}
