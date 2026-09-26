import { Global, Module } from "@nestjs/common";

import { AiGatewayService } from "./ai-gateway.service";
import { AI_PROVIDER } from "./ai-provider.interface";
import { GroqProvider } from "./providers/groq.provider";

@Global()
@Module({
  providers: [
    GroqProvider,

    {
      provide: AI_PROVIDER,
      useExisting: GroqProvider,
    },

    AiGatewayService,
  ],

  exports: [AiGatewayService],
})
export class AiGatewayModule {}
