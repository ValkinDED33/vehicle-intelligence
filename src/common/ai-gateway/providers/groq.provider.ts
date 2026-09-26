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

  private readonly client: OpenAI;
  private readonly model: string;
  private readonly textMaxTokens: number;
  private readonly visionMaxTokens: number;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("GROQ_API_KEY");
    const model = this.configService.get<string>("GROQ_MODEL");
    const baseURL = this.configService.get<string>("GROQ_BASE_URL");

    const timeout = this.readPositiveNumber("GROQ_TIMEOUT_MS", 30000);

    this.textMaxTokens = this.readPositiveNumber("GROQ_TEXT_MAX_TOKENS", 1000);

    this.visionMaxTokens = this.readPositiveNumber(
      "GROQ_VISION_MAX_TOKENS",
      1000,
    );

    if (!apiKey) {
      throw new Error("GROQ_API_KEY environment variable is required");
    }

    if (!model) {
      throw new Error("GROQ_MODEL environment variable is required");
    }

    if (!baseURL) {
      throw new Error("GROQ_BASE_URL environment variable is required");
    }

    this.client = new OpenAI({
      apiKey,
      baseURL,
      timeout,
    });

    this.model = model;
  }

  async complete(request: AiTextRequest): Promise<AiTextResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,

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
      model: response.model || this.model,
      text,
      responseId: response.id,
    };
  }

  async analyzeImages(request: AiVisionRequest): Promise<AiVisionResponse> {
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

    const response = await this.client.chat.completions.create({
      model: this.model,

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

    const text = this.extractFinalText(response.choices[0]?.message?.content);

    return {
      provider: this.providerName,
      model: response.model || this.model,
      text,
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
