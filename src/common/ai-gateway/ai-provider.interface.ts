import type { InjectionToken } from "@nestjs/common";

export const AI_PROVIDER: InjectionToken = Symbol("AI_PROVIDER");

export interface AiTextRequest {
  systemPrompt: string;
  userPrompt: string;

  responseFormat?: "text" | "json";
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
