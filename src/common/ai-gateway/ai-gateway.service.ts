import { Inject, Injectable } from "@nestjs/common";

import { AI_PROVIDER, type AiProvider } from "./ai-provider.interface";

@Injectable()
export class AiGatewayService {
  constructor(
    @Inject(AI_PROVIDER)
    private readonly provider: AiProvider,
  ) {}

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.provider.complete(systemPrompt, userPrompt);
  }
}
