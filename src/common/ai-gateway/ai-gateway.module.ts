import { Global, Module } from "@nestjs/common";

import { AiGatewayService } from "./ai-gateway.service";
import { AI_PROVIDER } from "./ai-provider.interface";
import { NullAiProvider } from "./providers/null-ai.provider";

@Global()
@Module({
  providers: [
    NullAiProvider,
    {
      provide: AI_PROVIDER,
      useExisting: NullAiProvider,
    },
    AiGatewayService,
  ],
  exports: [AiGatewayService],
})
export class AiGatewayModule {}
