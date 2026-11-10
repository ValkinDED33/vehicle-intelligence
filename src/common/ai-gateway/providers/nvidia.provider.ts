import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type { AiTextRequest, AiVisionRequest, RoutableAiProvider } from "../ai-provider.interface";
import { AiProviderError, providerError } from "../ai-provider-error";
import { positiveSetting, setting } from "../ai-config";
import { compatibleChat } from "./compatible-chat";

const MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";

@Injectable()
export class NvidiaProvider implements RoutableAiProvider {
  readonly providerName = "nvidia";
  readonly capabilities = { text: true, json: true, vision: true, tools: true };
  private client: OpenAI | null = null;
  constructor(private readonly config: ConfigService) {}

  get configured() { return !this.unavailableReason; }
  get unavailableReason() {
    if (!setting(this.config, "NVIDIA_API_KEY")) return "not_configured" as const;
    if (setting(this.config, "NVIDIA_DATA_POLICY_APPROVED") !== "true") return "data_policy_not_approved" as const;
    return undefined;
  }
  complete(request: AiTextRequest, signal?: AbortSignal) { return this.generate(request, signal); }
  analyzeImages(request: AiVisionRequest, signal?: AbortSignal) { return this.generate(request, signal); }

  private async generate(request: AiTextRequest | AiVisionRequest, signal?: AbortSignal) {
    try {
      if (!this.configured) throw new AiProviderError(this.providerName, this.unavailableReason ?? "not_configured");
      const model = setting(this.config, "NVIDIA_MODEL", MODEL);
      if (model !== MODEL) throw new AiProviderError(this.providerName, "unverified_NVIDIA_MODEL");
      const baseURL = setting(this.config, "NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1");
      if (!/^https:\/\/integrate\.api\.nvidia\.com\/v1\/?$/.test(baseURL)) throw new AiProviderError(this.providerName, "invalid_NVIDIA_BASE_URL");
      if (!this.client) this.client = new OpenAI({ apiKey: setting(this.config, "NVIDIA_API_KEY"),
        baseURL, maxRetries: 0, logLevel: "off", fetchOptions: { redirect: "error" },
        timeout: positiveSetting(this.config, this.providerName, "NVIDIA_TIMEOUT_MS", 30_000) });
      return await compatibleChat(this.client, this.providerName, request, model,
        positiveSetting(this.config, this.providerName, "NVIDIA_MAX_TOKENS", 4096), { reasoning_effort: "low" }, signal);
    } catch (error) { throw providerError(this.providerName, error); }
  }
}
