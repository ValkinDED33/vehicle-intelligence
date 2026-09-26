import { Inject, Injectable } from "@nestjs/common";

import {
  AI_PROVIDER,
  type AiProvider,
  type AiTextRequest,
  type AiTextResponse,
  type AiVisionRequest,
  type AiVisionResponse,
} from "./ai-provider.interface";

@Injectable()
export class AiGatewayService {
  constructor(
    @Inject(AI_PROVIDER)
    private readonly provider: AiProvider,
  ) {}

  async complete(request: AiTextRequest): Promise<AiTextResponse> {
    return this.provider.complete(request);
  }

  async analyzeImages(request: AiVisionRequest): Promise<AiVisionResponse> {
    return this.provider.analyzeImages(request);
  }

  getProviderName(): string {
    return this.provider.providerName;
  }
}
