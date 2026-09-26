import { Type } from "class-transformer";
import { IsDate, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class DocumentHistoryQueryDto extends PaginationQueryDto {
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
