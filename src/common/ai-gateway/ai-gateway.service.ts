import { Inject, Injectable } from "@nestjs/common";
import { AI_PROVIDER_TOKEN, type AiProvider } from "./ai-provider.interface";

@Injectable()
export class AiGatewayService {
  constructor(
    @Inject(AI_PROVIDER_TOKEN) private readonly provider: AiProvider,
  ) {}

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.provider.complete(systemPrompt, userPrompt);
  }
}
