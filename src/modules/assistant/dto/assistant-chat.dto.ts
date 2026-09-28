import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class AssistantChatDto {
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}
