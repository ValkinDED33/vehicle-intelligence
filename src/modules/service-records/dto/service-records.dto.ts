import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateServiceRecordItemDto {
  @IsString()
  @IsIn(["work", "part", "fluid", "consumable", "diagnostic", "other"])
  itemType!: "work" | "part" | "fluid" | "consumable" | "diagnostic" | "other";

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  partNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

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
  warrantyMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  warrantyKm?: number;
}

export class CreateServiceRecordDto {
  /**
   * Пока только ссылка на уже существующий Expense.
   * Автоматическое атомарное создание Expense
   * добавим через общий Unit of Work.
   */
  @IsOptional()
  @IsUUID()
  expenseId?: string;

  @IsString()
  @IsIn([
    "maintenance",
    "repair",
    "diagnostic",
    "inspection",
    "replacement",
    "upgrade",
    "other",
  ])
  type!:
    | "maintenance"
    | "repair"
    | "diagnostic"
    | "inspection"
    | "replacement"
    | "upgrade"
    | "other";

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  engineHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  providerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  documentNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalCost?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    "manual",
    "web",
    "telegram",
    "receipt",
    "ocr",
    "service",
    "integration",
    "system",
    "ai",
    "ai-inferred",
  ])
  source?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => CreateServiceRecordItemDto)
  items?: CreateServiceRecordItemDto[];
}

export class ServiceRecordHistoryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    "maintenance",
    "repair",
    "diagnostic",
    "inspection",
    "replacement",
    "upgrade",
    "other",
  ])
  type?: string;
}

export class PartHistoryQueryDto {
  @IsString()
  @MaxLength(120)
  partNumber!: string;
}
