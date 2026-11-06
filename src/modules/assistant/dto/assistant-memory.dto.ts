import { IsIn, IsOptional, IsUUID } from "class-validator";

export class AssistantMemoryScopeDto {
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsIn(["uk", "pl", "en"]) language?: "uk" | "pl" | "en";
}
