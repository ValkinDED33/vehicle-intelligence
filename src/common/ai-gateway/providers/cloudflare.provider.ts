import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type { AiTextRequest, AiVisionRequest, RoutableAiProvider } from "../ai-provider.interface";
import { AiProviderError, providerError } from "../ai-provider-error";
import { positiveSetting, setting } from "../ai-config";
import { compatibleChat } from "./compatible-chat";

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const QWEN_MODEL = "@cf/qwen/qwen3.8-27b";

@Injectable()
export class CloudflareProvider implements RoutableAiProvider {
  readonly providerName = "cloudflare";
  readonly capabilities = { text: true, json: true, vision: true, tools: true };
  private client: OpenAI | null = null;
  constructor(private readonly config: ConfigService) {}

  get configured() { return !this.unavailableReason; }
  get unavailableReason() {
    if (!setting(this.config, "CLOUDFLARE_API_TOKEN") || !setting(this.config, "CLOUDFLARE_ACCOUNT_ID")) return "not_configured" as const;
    if (setting(this.config, "CLOUDFLARE_DATA_POLICY_APPROVED") !== "true") return "data_policy_not_approved" as const;
    if (setting(this.config, "CLOUDFLARE_FREE_PLAN_CONFIRMED") !== "true") return "free_plan_not_confirmed" as const;
    return undefined;
  }
  complete(request: AiTextRequest, signal?: AbortSignal) { return this.generate(request, signal); }
  analyzeImages(request: AiVisionRequest, signal?: AbortSignal) { return this.generate(request, signal); }

  private async generate(request: AiTextRequest | AiVisionRequest, signal?: AbortSignal) {
    try {
      if (!this.configured) throw new AiProviderError(this.providerName, this.unavailableReason ?? "not_configured");
      const account = setting(this.config, "CLOUDFLARE_ACCOUNT_ID");
      const model = setting(this.config, "CLOUDFLARE_MODEL") || setting(this.config, "CLOUDFLARE_AI_MODEL", MODEL);
      if (!/^[a-f0-9]{32}$/i.test(account)) throw new AiProviderError(this.providerName, "invalid_CLOUDFLARE_ACCOUNT_ID");
      if (![MODEL, QWEN_MODEL].includes(model)) throw new AiProviderError(this.providerName, "unverified_CLOUDFLARE_MODEL");
      if (!this.client) this.client = new OpenAI({ apiKey: setting(this.config, "CLOUDFLARE_API_TOKEN"),
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1`, maxRetries: 0, logLevel: "off", fetchOptions: { redirect: "error" },
        timeout: positiveSetting(this.config, this.providerName, "CLOUDFLARE_TIMEOUT_MS", 30_000) });
      return await compatibleChat(this.client, this.providerName, request, model,
        positiveSetting(this.config, this.providerName, "CLOUDFLARE_MAX_TOKENS", 4096),
        model === QWEN_MODEL ? { reasoning_effort: "low", store: false } : {}, signal);
    } catch (error) { throw providerError(this.providerName, error); }
  }
}
