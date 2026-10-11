import { Transform } from "class-transformer";
import {
  IsEnum,
  IsISO8601,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";
import {
  EDITABLE_INCIDENT_STATUSES,
  INCIDENT_TEAMS,
  type EditableIncidentStatus,
  type IncidentTeam,
} from "@signaldesk/contracts";

function trimmedText(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class UpdateIncidentDto {
  @IsISO8601()
  expectedUpdatedAt!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(EDITABLE_INCIDENT_STATUSES)
  status?: EditableIncidentStatus;

  @IsOptional()
  @Transform(({ value }) => trimmedText(value))
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  rootCause?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimmedText(value))
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  resolution?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(INCIDENT_TEAMS)
  team?: IncidentTeam;

  @IsOptional()
  @Transform(({ value }) => trimmedText(value))
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  assignee?: string | null;
}
