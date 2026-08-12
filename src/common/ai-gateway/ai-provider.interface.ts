import type { InjectionToken } from "@nestjs/common";

export const AI_PROVIDER: InjectionToken = Symbol("AI_PROVIDER");

export interface AiProvider {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}
