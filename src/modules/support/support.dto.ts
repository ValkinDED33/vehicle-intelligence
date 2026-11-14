import { BadRequestException } from "@nestjs/common";
import { plainToInstance, Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, validateSync } from "class-validator";
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES, type SupportCategory, type SupportStatus } from "./schemas/support.schema";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class SupportMessageDto {
  @Transform(trim)
  @IsString()
  @Length(1, 10000)
  message!: string;
}

export class CreateSupportTicketDto extends SupportMessageDto {
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  subject!: string;

  @IsIn(SUPPORT_CATEGORIES)
  category!: SupportCategory;

  @IsOptional()
  @IsUUID()
  vehicleId?: string | null;
}

export class SupportTicketQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;

  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;

  @IsOptional()
  @IsIn(SUPPORT_CATEGORIES)
  category?: SupportCategory;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 160)
  q?: string;
}

export class AdminSupportTicketQueryDto extends SupportTicketQueryDto {
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

export class SupportStatusDto {
  @IsIn(SUPPORT_STATUSES)
  status!: SupportStatus;
}

// Keep the same validation boundary for direct service callers as for HTTP.
export function supportInput<T extends object>(Dto: new () => T, input: T): T {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new BadRequestException("Invalid support input");
  const value = plainToInstance(Dto, input);
  if (validateSync(value, { whitelist: true, forbidNonWhitelisted: true }).length) {
    throw new BadRequestException("Invalid support input");
  }
  return value;
}
