import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateEnergyEntryDto {
  @IsString()
  @IsIn(["fuel", "charge"])
  kind!: "fuel" | "charge";

  @IsString()
  @MaxLength(32)
  energyType!: string;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  volumeLiters?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  energyKwh?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotalCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  discountLabel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalCost?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @IsBoolean()
  isFullTank?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  providerName?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    "manual",
    "web",
    "telegram",
    "receipt",
    "ocr",
    "integration",
    "system",
    "ai",
    "ai-inferred",
  ])
  source?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class EnergyHistoryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  energyType?: string;

  @IsOptional()
  @IsString()
  @IsIn(["fuel", "charge"])
  kind?: string;
}

export class MonthlyEnergySummaryQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}
