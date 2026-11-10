import type OpenAI from "openai";
import type { AiTextRequest, AiTextResponse, AiVisionRequest } from "../ai-provider.interface";
import { AiProviderError, finalText, providerError } from "../ai-provider-error";

export async function compatibleChat(
  client: OpenAI,
  provider: string,
  request: AiTextRequest | AiVisionRequest,
  model: string,
  maxTokens: number,
  extra: Partial<OpenAI.ChatCompletionCreateParamsNonStreaming> & { provider?: object } = {},
  signal?: AbortSignal,
): Promise<AiTextResponse> {
  const vision = "images" in request;
  if (vision && !request.images.length) throw new AiProviderError(provider, "missing_images");
  const content = vision ? [
    { type: "text" as const, text: request.userPrompt },
    ...request.images.map(image => ({ type: "image_url" as const, image_url: { url: image.url } })),
  ] : request.userPrompt;
  const response = await client.chat.completions.create({
    ...extra, model, messages: [{ role: "system", content: request.systemPrompt }, { role: "user", content }],
    response_format: request.responseFormat === "json" ? { type: "json_object" } : undefined,
    max_tokens: maxTokens,
  }, { maxRetries: 0, signal });
  const embeddedError = (response as unknown as { error?: { code?: number } }).error;
  if (embeddedError) throw providerError(provider, { status: embeddedError.code });
  return { provider, model: response.model || model,
    text: finalText(provider, response.choices[0]?.message?.content, response.choices[0]?.finish_reason), responseId: response.id };
}
