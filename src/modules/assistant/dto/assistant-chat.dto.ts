import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class AssistantHistoryMessageDto {
  @IsIn(["user", "assistant"])
  role!: "user" | "assistant";

  @IsString()
  @MaxLength(3000)
  content!: string;
}

export class AssistantChatDto {
  @IsOptional() @IsInt() @Min(0) expectedMemoryEpoch?: number;
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsIn(["uk", "pl", "en"])
  language?: "uk" | "pl" | "en";

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AssistantHistoryMessageDto)
  // Accepted for older clients, but never used as authoritative shared history.
  history?: AssistantHistoryMessageDto[];
}
