import {
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

export class CreateExpenseDto {
  @IsString()
  @IsIn([
    "maintenance",
    "repair",
    "parts",
    "insurance",
    "inspection",
    "tax",
    "parking",
    "toll",
    "fine",
    "wash",
    "detailing",
    "accessories",
    "tires",
    "roadside",
    "registration",
    "other",
  ])
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  subcategory?: string;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

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

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  providerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  documentNumber?: string;

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

export class ExpenseHistoryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string;
}

export class MonthlyCostOfOwnershipQueryDto {
  @IsInt()
  @Min(2000)
  @Max(2200)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}
