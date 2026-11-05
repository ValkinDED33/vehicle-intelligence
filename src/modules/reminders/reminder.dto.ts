import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import type { ReminderOffset } from "./reminder-schedule";

export class ReminderOffsetDto implements ReminderOffset {
  @IsInt() @Min(0) @Max(3650) amount!: number;
  @IsIn(["days", "weeks", "months"]) unit!: ReminderOffset["unit"];
}
export class ReminderPreferencesDto {
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) remindAt?: string;
  @IsOptional() @IsString() @MaxLength(64) timeZone?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10)
  @ValidateNested({ each: true }) @Type(() => ReminderOffsetDto) offsets?: ReminderOffsetDto[];
}
export class CreateReminderDto extends ReminderPreferencesDto {
  @IsString() @MinLength(1) @MaxLength(180) title!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate!: string;
}
export class ReplaceReminderDto extends CreateReminderDto {
  @IsUUID() id!: string;
}
export class UpdateReminderDto extends CreateReminderDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class ReminderStatusDto {
  @IsIn(["completed", "cancelled"]) status!: "completed" | "cancelled";
  @IsInt() @Min(1) expectedRevision!: number;
}
