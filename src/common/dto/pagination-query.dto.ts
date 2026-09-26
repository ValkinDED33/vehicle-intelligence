import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export const DEFAULT_PAGE_LIMIT = 100;
export const MAX_PAGE_LIMIT = 500;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export interface PaginationQuery {
  limit?: number;
  offset?: number;
}

export function resolvePagination(query: PaginationQuery): {
  limit: number;
  offset: number;
} {
  return {
    limit: query.limit ?? DEFAULT_PAGE_LIMIT,
    offset: query.offset ?? 0,
  };
}
