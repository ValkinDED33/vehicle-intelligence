import { InjectionToken } from "@nestjs/common";

export const AI_PROVIDER_TOKEN = "AI_PROVIDER_TOKEN";

export interface AiProvider {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}
