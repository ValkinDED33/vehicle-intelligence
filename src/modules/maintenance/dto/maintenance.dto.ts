import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsBoolean, IsArray, ArrayMaxSize, ValidateNested, Matches, IsUUID,
} from "class-validator";
import { Type } from "class-transformer";
import { ReminderOffsetDto } from "../../reminders/reminder.dto";

export class CreateMaintenanceRuleDto {
  @IsOptional() @IsBoolean() telegramEnabled?: boolean;
  @IsOptional() @IsBoolean() notifyWhenDue?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ReminderOffsetDto)
  reminderOffsets?: ReminderOffsetDto[];
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) remindAt?: string;
  @IsOptional() @IsString() @MaxLength(64) timeZone?: string;
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

export class UpdateMaintenanceActionDto extends CreateMaintenanceRuleDto { @IsUUID() id!: string }
