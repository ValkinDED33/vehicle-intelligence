import type { InjectionToken } from "@nestjs/common";

export const AI_PROVIDER: InjectionToken = Symbol("AI_PROVIDER");
export const AI_PROVIDER_CHAIN: InjectionToken = Symbol("AI_PROVIDER_CHAIN");

export interface AiTextRequest {
  systemPrompt: string;
  userPrompt: string;

  responseFormat?: "text" | "json";
  purpose?: "assistant";
}

export interface AiImageInput {
  url: string;
}

export interface AiVisionRequest {
  systemPrompt: string;
  userPrompt: string;

  images: AiImageInput[];

  responseFormat?: "text" | "json";
}

export interface AiTextResponse {
  provider: string;
  model: string;

  text: string;

  responseId?: string;
}

export interface AiVisionResponse {
  provider: string;
  model: string;

  text: string;

  responseId?: string;
}

export interface AiProvider {
  readonly providerName: string;

  complete(request: AiTextRequest): Promise<AiTextResponse>;

  analyzeImages(request: AiVisionRequest): Promise<AiVisionResponse>;
}

export interface AiCapabilities {
  text: boolean;
  json: boolean;
  vision: boolean;
  tools: boolean;
}

export interface RoutableAiProvider extends AiProvider {
  complete(request: AiTextRequest, signal?: AbortSignal): Promise<AiTextResponse>;
  analyzeImages(request: AiVisionRequest, signal?: AbortSignal): Promise<AiVisionResponse>;
  readonly configured: boolean;
  readonly unavailableReason?: "not_configured" | "data_policy_not_approved" | "free_plan_not_confirmed";
  readonly capabilities: AiCapabilities;
}
