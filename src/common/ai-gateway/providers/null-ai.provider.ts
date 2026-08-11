import { Injectable } from "@nestjs/common";
import { AiProvider } from "../ai-provider.interface";

@Injectable()
export class NullAiProvider implements AiProvider {
  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    return "AI provider not configured. This is a placeholder response.";
  }
}
