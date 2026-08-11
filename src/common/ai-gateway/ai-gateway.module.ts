import { Global, Module } from "@nestjs/common";
import { AiGatewayService } from "./ai-gateway.service";
import { NullAiProvider } from "./providers/null-ai.provider";

@Global()
@Module({
  providers: [AiGatewayService, NullAiProvider],
  exports: [AiGatewayService],
})
export class AiGatewayModule {}
