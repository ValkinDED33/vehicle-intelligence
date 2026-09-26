import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateMaintenanceRuleDto {
  @IsString()
  @MaxLength(120)
  key!: string;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @IsIn(["manufacturer", "vin", "manual", "service", "system"])
  source?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalKm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalEngineHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  warningKmBefore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  warningDaysBefore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  warningEngineHoursBefore?: number;

  @IsString()
  @MaxLength(160)
  completionEventType!: string;
}
