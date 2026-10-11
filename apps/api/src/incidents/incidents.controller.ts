import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import type { IncidentDetail, IncidentListResponse } from "@signaldesk/contracts";
import { ListIncidentsQueryDto } from "./dto/list-incidents.query";
import { IncidentsService } from "./incidents.service";

@Controller("api/incidents")
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  list(@Query() query: ListIncidentsQueryDto): Promise<IncidentListResponse> {
    return this.incidents.list(query);
  }

  @Get(":id")
  getById(@Param("id", new ParseUUIDPipe()) id: string): Promise<IncidentDetail> {
    return this.incidents.getById(id);
  }
}
