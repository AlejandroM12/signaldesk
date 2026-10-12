import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import type { IncidentAnalysis, IncidentAnalysisListResponse } from "@signaldesk/contracts";
import { AnalysisService } from "./analysis.service";
import { AnalyzeIncidentDto } from "./dto/analyze-incident.dto";

@Controller("api/incidents")
export class AnalysisController {
  constructor(private readonly analyses: AnalysisService) {}

  @Post(":id/analyze")
  analyze(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: AnalyzeIncidentDto,
  ): Promise<IncidentAnalysis> {
    return this.analyses.analyze(id, body.idempotencyKey);
  }

  @Get(":id/analyses/:analysisId")
  getById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("analysisId", new ParseUUIDPipe()) analysisId: string,
  ): Promise<IncidentAnalysis> {
    return this.analyses.getById(id, analysisId);
  }

  @Get(":id/analyses")
  list(@Param("id", new ParseUUIDPipe()) id: string): Promise<IncidentAnalysisListResponse> {
    return this.analyses.list(id);
  }
}
