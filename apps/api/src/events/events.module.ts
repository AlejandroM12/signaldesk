import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { EventCorrelationService } from "./event-correlation.service";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [PrismaModule],
  controllers: [EventsController],
  providers: [EventsService, EventCorrelationService],
})
export class EventsModule {}
