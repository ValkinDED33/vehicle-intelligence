import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateVehicleHistoryEventDto {
  @IsString()
  @MaxLength(120)
  type!: string;

  @IsString()
  @MaxLength(64)
  sourceModule!: string;

  @IsString()
  @IsIn(["telegram", "web", "ocr", "ai-inferred", "system"])
  origin!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mileageKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  eventId?: string;
}

export class VehicleHistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  type?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
