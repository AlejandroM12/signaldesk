import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_TEAMS,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentTeam,
} from "@signaldesk/contracts";

export class ListIncidentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(INCIDENT_STATUSES)
  status?: IncidentStatus;

  @IsOptional()
  @IsEnum(INCIDENT_SEVERITIES)
  severity?: IncidentSeverity;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  service?: string;

  @IsOptional()
  @IsEnum(INCIDENT_TEAMS)
  team?: IncidentTeam;
}
