import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CreateEventDto } from "./dto/create-event.dto";
import type { IngestEventResponse } from "./dto/ingest-event.response";
import { EventsService } from "./events.service";

@Controller("api")
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post("events")
  @HttpCode(HttpStatus.CREATED)
  ingest(@Body() dto: CreateEventDto): Promise<IngestEventResponse> {
    return this.eventsService.ingest(dto);
  }
}
