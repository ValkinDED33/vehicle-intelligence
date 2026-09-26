import { Type } from "class-transformer";
import {
  IsArray,
  IsDate,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateDocumentFieldDto {
  @IsString()
  @MaxLength(120)
  fieldKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  fieldLabel?: string;

  @IsOptional()
  @IsString()
  @IsIn(["string", "number", "date", "boolean", "json"])
  valueType?: string;

  @IsOptional()
  @IsString()
  valueText?: string;

  @IsOptional()
  @IsNumber()
  valueNumber?: number;

  @IsOptional()
  @IsObject()
  valueJson?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsString()
  @IsIn(["manual", "ocr", "ai", "integration"])
  source?: string;
}

export class CreateDocumentDto {
  @IsString()
  @MaxLength(32)
  type!: string;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  issuerName?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  issuedAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;

  @IsOptional()
  @IsString()
  @IsIn(["manual", "upload", "telegram", "email", "integration", "ocr", "ai"])
  source?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => CreateDocumentFieldDto)
  fields?: CreateDocumentFieldDto[];
}
