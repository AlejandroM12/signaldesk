import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from "@nestjs/common";
import type {
  IncidentActivityResponse,
  IncidentDetail,
  IncidentListResponse,
} from "@signaldesk/contracts";
import { ListIncidentsQueryDto } from "./dto/list-incidents.query";
import { UpdateIncidentDto } from "./dto/update-incident.dto";
import { IncidentsService } from "./incidents.service";

@Controller("api/incidents")
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  list(@Query() query: ListIncidentsQueryDto): Promise<IncidentListResponse> {
    return this.incidents.list(query);
  }

  @Get(":id/activity")
  listActivity(@Param("id", new ParseUUIDPipe()) id: string): Promise<IncidentActivityResponse> {
    return this.incidents.listActivity(id);
  }

  @Get(":id")
  getById(@Param("id", new ParseUUIDPipe()) id: string): Promise<IncidentDetail> {
    return this.incidents.getById(id);
  }

  @Patch(":id")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateIncidentDto,
  ): Promise<IncidentDetail> {
    return this.incidents.update(id, body);
  }
}
