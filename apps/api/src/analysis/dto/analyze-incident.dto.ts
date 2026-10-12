import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class AnalyzeIncidentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9_-]+$/)
  idempotencyKey?: string;
}
