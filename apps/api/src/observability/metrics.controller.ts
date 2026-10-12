import { Controller, Get, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AnalysisQuotaSnapshot, MetricsResponse } from "@signaldesk/contracts";
import { readAnalysisBudget } from "../analysis/analysis-budget";
import { PrismaService } from "../prisma/prisma.service";
import { APP_METRICS, type AppMetrics } from "./app-metrics";

@Controller("api")
export class MetricsController {
  constructor(
    @Inject(APP_METRICS) private readonly metrics: AppMetrics,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get("metrics")
  async getMetrics(): Promise<MetricsResponse> {
    const snapshot = this.metrics.snapshot();
    snapshot.analysisQuota = await this.readQuota();
    return snapshot;
  }

  private async readQuota(): Promise<AnalysisQuotaSnapshot | null> {
    try {
      const budget = readAnalysisBudget({
        ANALYSIS_RATE_LIMIT: this.config.get<string>("ANALYSIS_RATE_LIMIT"),
        ANALYSIS_RATE_WINDOW_MS: this.config.get<string>("ANALYSIS_RATE_WINDOW_MS"),
        OPENAI_TIMEOUT_MS: this.config.get<string>("OPENAI_TIMEOUT_MS"),
      });
      const row = await this.prisma.analysisRateState.findUnique({ where: { id: 1 } });
      if (!row || !Number.isInteger(row.requestCount) || row.requestCount < 0) {
        return null;
      }
      return {
        limit: budget.rateLimit,
        windowMs: budget.rateWindowMs,
        requestCount: row.requestCount,
      };
    } catch {
      return null;
    }
  }
}
