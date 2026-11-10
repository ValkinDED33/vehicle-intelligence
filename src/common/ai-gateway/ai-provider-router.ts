import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AI_PROVIDER_CHAIN, type AiTextRequest, type AiVisionRequest, type AiTextResponse, type RoutableAiProvider } from "./ai-provider.interface";
import { AiProviderError, providerError } from "./ai-provider-error";
import { positiveSetting } from "./ai-config";

@Injectable()
export class AiProviderRouter implements RoutableAiProvider {
  readonly providerName = "router";
  private readonly logger = new Logger(AiProviderRouter.name);

  constructor(@Inject(AI_PROVIDER_CHAIN) private readonly providers: RoutableAiProvider[],
    @Optional() private readonly config?: ConfigService) {}

  onModuleInit() {
    for (const provider of this.providers) {
      this.logger.log(`AI provider ${provider.providerName}: ${provider.configured ? "configured" : provider.unavailableReason ?? "not_configured"}`);
    }
  }

  get configured() { return this.providers.some(provider => provider.configured); }
  get capabilities() {
    const active = this.providers.filter(provider => provider.configured);
    return {
      text: active.some(provider => provider.capabilities.text),
      json: active.some(provider => provider.capabilities.json),
      vision: active.some(provider => provider.capabilities.vision),
      tools: false,
    };
  }

  complete(request: AiTextRequest) { return this.route(request, false); }
  analyzeImages(request: AiVisionRequest) { return this.route(request, true); }

  private async route(request: AiTextRequest | AiVisionRequest, vision: boolean): Promise<AiTextResponse> {
    const candidates = this.providers.filter(provider => provider.configured
      && (vision ? provider.capabilities.vision : provider.capabilities.text)
      && (request.responseFormat !== "json" || provider.capabilities.json));
    if (vision && !(request as AiVisionRequest).images.length) {
      throw providerError("router", { status: 400 });
    }
    const failures: { provider: string; reason: string; upstreamStatus?: number }[] = [];
    const timeout = this.config ? positiveSetting(this.config, this.providerName, "AI_GATEWAY_TIMEOUT_MS", 60_000) : 60_000;
    if (timeout > 60_000) throw new AiProviderError(this.providerName, "invalid_AI_GATEWAY_TIMEOUT_MS");
    const signal = AbortSignal.timeout(timeout);
    for (const [index, provider] of candidates.entries()) {
      try {
        const response = await (vision ? provider.analyzeImages(request as AiVisionRequest, signal) : provider.complete(request, signal));
        signal.throwIfAborted();
        return response;
      } catch (error) {
        const failure = providerError(provider.providerName, error);
        if (!failure.technical) {
          this.logger.error(`AI provider ${provider.providerName}: ${failure.reason}; no fallback`);
          throw failure;
        }
        failures.push({ provider: provider.providerName, reason: failure.reason, ...(failure.upstreamStatus ? { upstreamStatus: failure.upstreamStatus } : {}) });
        this.logger.warn(`AI provider ${provider.providerName} unavailable${failure.upstreamStatus === 429 ? " due to quota/rate limit" : ""}: ${failure.reason}`);
        if (signal.aborted) break;
        const next = candidates[index + 1];
        if (next) this.logger.warn(`Falling back ${provider.providerName} -> ${next.providerName}`);
      }
    }
    throw new ServiceUnavailableException({
      code: candidates.length ? "AI_PROVIDERS_UNAVAILABLE" : "AI_NO_COMPATIBLE_PROVIDER",
      capability: vision ? "vision" : request.responseFormat === "json" ? "json" : "text",
      failures,
    });
  }
}
