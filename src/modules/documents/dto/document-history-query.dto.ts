import { Type } from "class-transformer";
import { IsDate, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class DocumentHistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  type?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  issuedFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  issuedTo?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresTo?: Date;

  @IsOptional()
  @IsString()
  @IsIn(["none", "pending", "processing", "completed", "failed"])
  processingStatus?: string;
}
