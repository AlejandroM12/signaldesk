import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "node:path";
import { AnalysisModule } from "./analysis/analysis.module";
import { EventsModule } from "./events/events.module";
import { HealthController } from "./health/health.controller";
import { IncidentsModule } from "./incidents/incidents.module";
import { ObservabilityModule } from "./observability/observability.module";
import { RequestContextMiddleware } from "./observability/request-context.middleware";
import { PrismaModule } from "./prisma/prisma.module";
import { PublicDemoModule } from "./public-demo/public-demo.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), ".env"), join(process.cwd(), "../../.env")],
    }),
    PrismaModule,
    PublicDemoModule,
    ObservabilityModule,
    EventsModule,
    IncidentsModule,
    AnalysisModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
