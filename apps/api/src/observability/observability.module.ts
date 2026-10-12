import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { PrismaModule } from "../prisma/prisma.module";
import { APP_METRICS, InMemoryAppMetrics } from "./app-metrics";
import { MetricsController } from "./metrics.controller";
import { ObservabilityExceptionFilter } from "./observability-exception.filter";
import { RequestContextMiddleware } from "./request-context.middleware";

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [MetricsController],
  providers: [
    InMemoryAppMetrics,
    { provide: APP_METRICS, useExisting: InMemoryAppMetrics },
    { provide: APP_FILTER, useClass: ObservabilityExceptionFilter },
    RequestContextMiddleware,
  ],
  exports: [APP_METRICS, RequestContextMiddleware],
})
export class ObservabilityModule {}
