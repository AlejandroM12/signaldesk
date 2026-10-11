import { Transform } from "class-transformer";
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidateBy,
} from "class-validator";
import { IncidentSeverity, IncidentTeam } from "../../generated/prisma/enums";
import { EventMetadataConstraint } from "../event-metadata";
import { isAcceptableEventTimestamp } from "../event-timestamp";

function normalizedToken(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

function trimmedText(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class CreateEventDto {
  @Transform(({ value }) => normalizedToken(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  source!: string;

  @IsOptional()
  @Transform(({ value }) => trimmedText(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  externalId?: string;

  @Transform(({ value }) => normalizedToken(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  service!: string;

  @Transform(({ value }) => normalizedToken(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  errorType!: string;

  @Transform(({ value }) => trimmedText(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  @ValidateBy({
    name: "eventTimestamp",
    validator: {
      validate: (value: unknown) => isAcceptableEventTimestamp(value),
      defaultMessage: () =>
        "timestamp debe ser una fecha ISO-8601 dentro del último año y no más de 5 minutos en el futuro",
    },
  })
  timestamp!: string;

  @IsOptional()
  @Validate(EventMetadataConstraint)
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional()
  @IsEnum(IncidentTeam)
  team?: IncidentTeam;
}
