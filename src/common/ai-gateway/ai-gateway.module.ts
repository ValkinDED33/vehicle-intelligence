import { Global, Module } from "@nestjs/common";

import { AiGatewayService } from "./ai-gateway.service";
import { AI_PROVIDER, AI_PROVIDER_CHAIN } from "./ai-provider.interface";
import { AiProviderRouter } from "./ai-provider-router";
import { GoogleProvider } from "./providers/google.provider";
import { OpenRouterProvider } from "./providers/openrouter.provider";
import { GroqProvider } from "./providers/groq.provider";
import { NvidiaProvider } from "./providers/nvidia.provider";
import { CloudflareProvider } from "./providers/cloudflare.provider";

export function createAiProviderChain(google: GoogleProvider, groq: GroqProvider, openrouter: OpenRouterProvider, nvidia?: NvidiaProvider, cloudflare?: CloudflareProvider) {
  return [google, groq, ...(nvidia ? [nvidia] : []), ...(cloudflare ? [cloudflare] : []), openrouter, ...openrouter.emergencyProviders()];
}

@Global()
@Module({
  providers: [
    GroqProvider,
    GoogleProvider,
    OpenRouterProvider,
    NvidiaProvider,
    CloudflareProvider,
    {
      provide: AI_PROVIDER_CHAIN,
      inject: [GoogleProvider, GroqProvider, OpenRouterProvider, NvidiaProvider, CloudflareProvider],
      useFactory: createAiProviderChain,
    },
    AiProviderRouter,

    {
      provide: AI_PROVIDER,
      useExisting: AiProviderRouter,
    },

    AiGatewayService,
  ],

  exports: [AiGatewayService],
})
export class AiGatewayModule {}
