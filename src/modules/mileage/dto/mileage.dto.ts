import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class CreateMileageReadingDto {
  @IsInt()
  @Min(0)
  odometerKm!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  engineHours?: number;

  @IsOptional()
  @IsString()
  @IsIn([
    "manual",
    "web",
    "telegram",
    "obd",
    "document",
    "service",
    "system",
    "ai",
    "ai-inferred",
  ])
  source?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

export class MileageHistoryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
