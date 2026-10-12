import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "node:path";
import { EventsModule } from "./events/events.module";
import { HealthController } from "./health/health.controller";
import { IncidentsModule } from "./incidents/incidents.module";
import { ObservabilityModule } from "./observability/observability.module";
import { RequestContextMiddleware } from "./observability/request-context.middleware";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), ".env"), join(process.cwd(), "../../.env")],
    }),
    PrismaModule,
    ObservabilityModule,
    EventsModule,
    IncidentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
