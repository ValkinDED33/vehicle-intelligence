import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

import {
  type AiProvider,
  type AiTextRequest,
  type AiTextResponse,
  type AiVisionRequest,
  type AiVisionResponse,
} from "../ai-provider.interface";

@Injectable()
export class GroqProvider implements AiProvider {
  readonly providerName = "groq";

  private client: OpenAI | null = null;
  private readonly model: string | null;
  private readonly textMaxTokens: number;
  private readonly visionMaxTokens: number;
  private readonly baseURL: string | null;
  private readonly apiKey: string | null;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("GROQ_API_KEY") ?? null;
    this.model = this.configService.get<string>("GROQ_MODEL") ?? null;
    this.baseURL = this.configService.get<string>("GROQ_BASE_URL") ?? null;
    this.timeout = this.readPositiveNumber("GROQ_TIMEOUT_MS", 30000);
    this.textMaxTokens = this.readPositiveNumber("GROQ_TEXT_MAX_TOKENS", 1000);
    this.visionMaxTokens = this.readPositiveNumber(
      "GROQ_VISION_MAX_TOKENS",
      1000,
    );
  }

  private ensure(): { client: OpenAI; model: string } {
    if (!this.apiKey || !this.model || !this.baseURL) {
      throw new Error(
        "AI provider is not configured (missing GROQ_API_KEY / GROQ_MODEL / GROQ_BASE_URL)",
      );
    }
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
        timeout: this.timeout,
      });
    }
    const active: OpenAI = this.client;
    const activeModel: string = this.model;
    return { client: active, model: activeModel };
  }

  async complete(request: AiTextRequest): Promise<AiTextResponse> {
    const ready = this.ensure();
    const response = await ready.client.chat.completions.create({
      model: ready.model,

      messages: [
        {
          role: "system",
          content: request.systemPrompt,
        },
        {
          role: "user",
          content: request.userPrompt,
        },
      ],

      response_format:
        request.responseFormat === "json"
          ? {
              type: "json_object",
            }
          : undefined,

      max_tokens: this.textMaxTokens,

      reasoning_effort: "none" as never,
    });

    const text = this.extractFinalText(response.choices[0]?.message?.content);

    return {
      provider: this.providerName,
      model: response.model || ready.model,
      text,
      responseId: response.id,
    };
  }

  async analyzeImages(request: AiVisionRequest): Promise<AiVisionResponse> {
    const ready = this.ensure();
    if (request.images.length === 0) {
      throw new Error("At least one image is required");
    }

    const userContent: Array<
      | {
          type: "text";
          text: string;
        }
      | {
          type: "image_url";
          image_url: {
            url: string;
          };
        }
    > = [
      {
        type: "text",
        text: request.userPrompt,
      },
    ];

    for (const image of request.images) {
      userContent.push({
        type: "image_url",

        image_url: {
          url: image.url,
        },
      });
    }

    const response = await ready.client.chat.completions.create({
      model: ready.model,

      messages: [
        {
          role: "system",
          content: request.systemPrompt,
        },
        {
          role: "user",
          content: userContent,
        },
      ],

      max_tokens: this.visionMaxTokens,

      reasoning_effort: "none" as never,
    });

    const visionText = this.extractFinalText(
      response.choices[0]?.message?.content,
    );

    return {
      provider: this.providerName,
      model: response.model || ready.model,
      text: visionText,
      responseId: response.id,
    };
  }

  private readPositiveNumber(key: string, defaultValue: number): number {
    const rawValue =
      this.configService.get<string>(key) ?? String(defaultValue);

    const value = Number(rawValue);

    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${key} must be a positive number`);
    }

    return value;
  }

  private extractFinalText(value: string | null | undefined): string {
    const rawText = value?.trim();

    if (!rawText) {
      throw new Error("Groq returned an empty response");
    }

    const text = this.stripReasoning(rawText);

    if (!text) {
      throw new Error(
        "Groq returned no final response after reasoning cleanup",
      );
    }

    return text;
  }

  private stripReasoning(value: string): string {
    return value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  }
}
