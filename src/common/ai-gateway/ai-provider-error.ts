import { HttpException } from "@nestjs/common";
import { APIConnectionError, APIUserAbortError } from "openai";

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const NETWORK_CODES = new Set([
  "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND",
  "ENETUNREACH", "EHOSTUNREACH", "EPIPE", "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET",
]);

// Never retain a raw SDK error: it may carry headers, signed URLs and prompts.
export class AiProviderError extends HttpException {
  constructor(
    readonly provider: string,
    readonly reason: string,
    readonly technical = false,
    readonly upstreamStatus?: number,
  ) {
    super({
      code: technical ? "AI_PROVIDER_UNAVAILABLE" : "AI_PROVIDER_ERROR",
      message: `AI provider ${provider}: ${reason}`,
      provider, reason, ...(upstreamStatus ? { upstreamStatus } : {}),
    }, 502);
  }
}

export function providerError(provider: string, error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  const value = error as { status?: unknown; name?: unknown; code?: unknown; cause?: unknown } | null;
  const status = typeof value?.status === "number" && Number.isInteger(value.status) ? value.status : undefined;
  if (status) return new AiProviderError(provider, `http_${status}`, TRANSIENT_STATUSES.has(status), status);
  let current: unknown = error;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth++) {
    const item = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (current instanceof APIConnectionError || current instanceof APIUserAbortError
      || NETWORK_CODES.has(String(item.code)) || ["APIConnectionError", "APIConnectionTimeoutError", "APIUserAbortError", "TimeoutError", "AbortError"].includes(String(item.name))) {
      return new AiProviderError(provider, "network_or_timeout", true);
    }
    current = item.cause;
  }
  return new AiProviderError(provider, "invalid_response_or_configuration");
}

export function finalText(provider: string, content: string | null | undefined, finishReason?: string | null): string {
  if (finishReason === "length" || finishReason === "MAX_TOKENS") throw new AiProviderError(provider, "output_limit");
  if (finishReason && !["stop", "STOP"].includes(finishReason)) throw new AiProviderError(provider, "response_blocked");
  const text = content?.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!text) throw new AiProviderError(provider, "empty_response");
  return text;
}
