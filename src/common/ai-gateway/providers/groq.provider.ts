import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

import {
  type RoutableAiProvider,
  type AiTextRequest,
  type AiTextResponse,
  type AiVisionRequest,
  type AiVisionResponse,
} from "../ai-provider.interface";
import { AiProviderError, finalText, providerError } from "../ai-provider-error";
import { positiveSetting, setting } from "../ai-config";

@Injectable()
export class GroqProvider implements RoutableAiProvider {
  readonly providerName = "groq";
  readonly capabilities = { text: true, json: true, vision: false, tools: true };

  private client: OpenAI | null = null;
  private readonly model: string | null;
  private readonly textMaxTokens: number;
  private readonly baseURL: string | null;
  private readonly apiKey: string | null;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = setting(configService, "GROQ_API_KEY") || null;
    this.model = setting(configService, "GROQ_MODEL", "openai/gpt-oss-120b");
    this.baseURL = setting(configService, "GROQ_BASE_URL", "https://api.groq.com/openai/v1");
    this.timeout = this.readPositiveNumber("GROQ_TIMEOUT_MS", 30000);
    this.textMaxTokens = this.readPositiveNumber("GROQ_TEXT_MAX_TOKENS", 1000);
  }

  get configured() { return !!this.apiKey; }
  get unavailableReason() { return this.configured ? undefined : "not_configured" as const; }

  private ensure(): { client: OpenAI; model: string } {
    if (!this.apiKey || !this.model || !this.baseURL) {
      throw new AiProviderError(this.providerName, "not_configured");
    }
    if (!/^https:\/\/api\.groq\.com\/openai\/v1\/?$/.test(this.baseURL)) throw new AiProviderError(this.providerName, "invalid_GROQ_BASE_URL");
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
        timeout: this.timeout,
        maxRetries: 0,
        logLevel: "off",
        fetchOptions: { redirect: "error" },
      });
    }
    const active: OpenAI = this.client;
    const activeModel: string = this.model;
    return { client: active, model: activeModel };
  }

  async complete(request: AiTextRequest, signal?: AbortSignal): Promise<AiTextResponse> {
    try {
      const ready = this.ensure();
      const model = request.purpose === "assistant"
        ? setting(this.configService, "GROQ_ASSISTANT_MODEL", "openai/gpt-oss-120b") : ready.model;
      const response = await ready.client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        response_format: request.responseFormat === "json" ? { type: "json_object" } : undefined,
        max_tokens: request.purpose === "assistant"
          ? this.readPositiveNumber("GROQ_ASSISTANT_MAX_TOKENS", 2048) : this.textMaxTokens,
        temperature: request.purpose === "assistant" ? 0.2 : undefined,
        reasoning_effort: model.startsWith("openai/gpt-oss") ? "low"
          : model.startsWith("qwen/") ? "none" as never : undefined,
      }, { maxRetries: 0, signal });
      return {
        provider: this.providerName,
        model: response.model || model,
        text: finalText(this.providerName, response.choices[0]?.message?.content, response.choices[0]?.finish_reason),
        responseId: response.id,
      };
    } catch (error) { throw providerError(this.providerName, error); }
  }

  async analyzeImages(_request: AiVisionRequest): Promise<AiVisionResponse> {
    throw new AiProviderError(this.providerName, "unsupported_vision");
  }

  private readPositiveNumber(key: string, defaultValue: number): number {
    return positiveSetting(this.configService, this.providerName, key, defaultValue);
  }
}
