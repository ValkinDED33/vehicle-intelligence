import type { ConfigService } from "@nestjs/config";
import { AiProviderError } from "./ai-provider-error";

export function setting(config: ConfigService, key: string, fallback = ""): string {
  return config.get<string>(key)?.trim() || fallback;
}

export function positiveSetting(config: ConfigService, provider: string, key: string, fallback: number): number {
  const value = Number(setting(config, key, String(fallback)));
  if (!Number.isSafeInteger(value) || value <= 0 || value > 300_000) throw new AiProviderError(provider, `invalid_${key}`);
  return value;
}
