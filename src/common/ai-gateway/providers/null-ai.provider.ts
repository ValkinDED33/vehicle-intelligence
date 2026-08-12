import { Injectable } from "@nestjs/common";

import { AiProvider } from "../ai-provider.interface";

@Injectable()
export class NullAiProvider implements AiProvider {
  async complete(_systemPrompt: string, _userPrompt: string): Promise<string> {
    return "AI provider is not configured.";
  }
}
