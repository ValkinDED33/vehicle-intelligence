import { IsIn, IsInt, Min } from "class-validator";
import type { AssistantPreferences } from "../assistant-preferences";

export class UpdateAssistantPreferencesDto implements AssistantPreferences {
  @IsIn(["concise", "detailed"]) detailLevel!: AssistantPreferences["detailLevel"];
  @IsIn(["balanced", "reliability", "economy"]) priority!: AssistantPreferences["priority"];
  @IsIn(["unspecified", "city", "highway", "mixed"]) drivingPattern!: AssistantPreferences["drivingPattern"];
  @IsInt() @Min(0) expectedRevision!: number;
}
