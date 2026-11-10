import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type { AiTextRequest, AiTextResponse, AiVisionRequest, RoutableAiProvider } from "../ai-provider.interface";
import { AiProviderError, providerError } from "../ai-provider-error";
import { positiveSetting, setting } from "../ai-config";
import { compatibleChat } from "./compatible-chat";

const FREE_MODEL = "nvidia/nemotron-3.5-super-vl:free";

@Injectable()
export class OpenRouterProvider implements RoutableAiProvider {
  readonly providerName = "openrouter";
  readonly capabilities = { text: true, json: true, vision: true, tools: true };
  private client: OpenAI | null = null;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = setting(config, "OPENROUTER_API_KEY");
    this.model = setting(config, "OPENROUTER_MODEL", FREE_MODEL);
  }

  get configured() { return !!this.apiKey && !this.unavailableReason; }
  get unavailableReason() {
    if (!this.apiKey) return "not_configured" as const;
    if (setting(this.config, "OPENROUTER_DATA_POLICY_APPROVED") !== "true") return "data_policy_not_approved" as const;
    return undefined;
  }

  complete(request: AiTextRequest, signal?: AbortSignal) { return this.generate(request, this.model, signal); }
  analyzeImages(request: AiVisionRequest, signal?: AbortSignal) { return this.generate(request, this.model, signal); }

  emergencyProviders(): RoutableAiProvider[] {
    if (setting(this.config, "OPENROUTER_EMERGENCY_MODEL") !== "openrouter/free") return [];
    return [{
      providerName: "openrouter-free", configured: this.configured,
      unavailableReason: this.unavailableReason, capabilities: this.capabilities,
      complete: (request, signal) => this.generate(request, "openrouter/free", signal, true),
      analyzeImages: (request, signal) => this.generate(request, "openrouter/free", signal, true),
    }];
  }

  private async generate(request: AiTextRequest | AiVisionRequest, model: string, signal?: AbortSignal, emergency = false): Promise<AiTextResponse> {
    try {
      if (!this.configured) throw new AiProviderError(this.providerName, this.unavailableReason ?? "not_configured");
      // Only verified multimodal models: a paid or unknown override is a configuration error.
      if (model !== (emergency ? "openrouter/free" : FREE_MODEL)) throw new AiProviderError(this.providerName, "invalid_OPENROUTER_MODEL");
      const vision = "images" in request;
      if (vision && !request.images.length) throw new AiProviderError(this.providerName, "missing_images");
      const baseURL = setting(this.config, "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
      if (!/^https:\/\/openrouter\.ai\/api\/v1\/?$/.test(baseURL)) throw new AiProviderError(this.providerName, "invalid_OPENROUTER_BASE_URL");
      if (!this.client) this.client = new OpenAI({ apiKey: this.apiKey, baseURL,
        maxRetries: 0, logLevel: "off", fetchOptions: { redirect: "error" },
        timeout: positiveSetting(this.config, this.providerName, "OPENROUTER_TIMEOUT_MS", 30_000) });
      return await compatibleChat(this.client, this.providerName, request, model,
        positiveSetting(this.config, this.providerName,
          vision ? "OPENROUTER_VISION_MAX_TOKENS" : "OPENROUTER_TEXT_MAX_TOKENS", vision ? 4096 : 2048),
        {
          // No upstream retry chain, paid endpoints, parameter dropping, or training providers.
          provider: { allow_fallbacks: false, require_parameters: true, data_collection: "deny", max_price: { prompt: 0, completion: 0, request: 0, image: 0 } },
        }, signal);
    } catch (error) { throw providerError(this.providerName, error); }
  }
}
