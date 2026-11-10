import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AiTextRequest, AiTextResponse, AiVisionRequest, RoutableAiProvider } from "../ai-provider.interface";
import { AiProviderError, finalText, providerError } from "../ai-provider-error";
import { positiveSetting, setting } from "../ai-config";

type GooglePart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GoogleResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  modelVersion?: string;
  responseId?: string;
};

@Injectable()
export class GoogleProvider implements RoutableAiProvider {
  readonly providerName = "google";
  readonly capabilities = { text: true, json: true, vision: true, tools: true };
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = setting(config, "GOOGLE_API_KEY") || setting(config, "GEMINI_API_KEY");
    this.model = setting(config, "GOOGLE_MODEL", "gemini-3.8-flash");
  }

  get configured() { return !!this.apiKey && !this.unavailableReason; }
  get unavailableReason() {
    if (!this.apiKey) return "not_configured" as const;
    // Both assistant context and document batches can contain personal data.
    if (setting(this.config, "GOOGLE_DATA_POLICY_APPROVED") !== "true") return "data_policy_not_approved" as const;
    return undefined;
  }

  complete(request: AiTextRequest, signal?: AbortSignal) { return this.generate(request, [], signal); }

  async analyzeImages(request: AiVisionRequest, parent?: AbortSignal) {
    if (!this.configured) throw new AiProviderError(this.providerName, this.unavailableReason ?? "not_configured");
    if (!request.images.length) throw new AiProviderError(this.providerName, "missing_images");
    const signal = this.signal(parent);
    const parts: GooglePart[] = [];
    let size = 0;
    for (const image of request.images) {
      const part = await this.imagePart(image.url, signal, parent);
      size += part.inlineData.data.length;
      if (size > 26_000_000) throw new AiProviderError(this.providerName, "image_input_too_large");
      parts.push(part);
    }
    return this.generate(request, parts, signal);
  }

  private async generate(request: AiTextRequest, images: GooglePart[] = [], signal?: AbortSignal): Promise<AiTextResponse> {
    try {
      if (!this.configured) throw new AiProviderError(this.providerName, this.unavailableReason ?? "not_configured");
      if (this.model !== "gemini-3.8-flash") throw new AiProviderError(this.providerName, "unverified_GOOGLE_MODEL");
      const maxOutputTokens = positiveSetting(this.config, this.providerName,
        images.length ? "GOOGLE_VISION_MAX_TOKENS" : request.purpose === "assistant" ? "GOOGLE_ASSISTANT_MAX_TOKENS" : "GOOGLE_TEXT_MAX_TOKENS",
        images.length ? 4096 : 2048);
      const payload = JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: request.userPrompt }, ...images] }],
          generationConfig: {
            maxOutputTokens,
            ...(request.responseFormat === "json" ? { responseMimeType: "application/json" } : {}),
            ...(this.model.startsWith("gemini-3.") ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
          },
        });
      if (Buffer.byteLength(payload, "utf8") > 20_000_000) throw new AiProviderError(this.providerName, images.length ? "image_input_too_large" : "input_too_large");
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
        method: "POST", redirect: "error",
        headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
        signal: this.signal(signal),
        body: payload,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw providerError(this.providerName, { status: response.status });
      }
      const body = await response.json() as GoogleResponse;
      const candidate = body.candidates?.[0];
      const text = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? "").join("");
      return { provider: this.providerName, model: body.modelVersion || this.model,
        text: finalText(this.providerName, text, candidate?.finishReason), responseId: body.responseId };
    } catch (error) { throw providerError(this.providerName, error); }
  }

  private signal(parent?: AbortSignal) {
    const own = AbortSignal.timeout(positiveSetting(this.config, this.providerName, "GOOGLE_TIMEOUT_MS", 30_000));
    return parent ? AbortSignal.any([parent, own]) : own;
  }

  private async imagePart(url: string, signal: AbortSignal, parent?: AbortSignal): Promise<{ inlineData: { mimeType: string; data: string } }> {
    const inline = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
    if (inline) return { inlineData: { mimeType: inline[1], data: inline[2] } };
    // Signed B2 URLs are downloaded server-side, never forwarded in prompts or logs.
    try {
      const source = new URL(url);
      const storage = new URL(setting(this.config, "B2_S3_ENDPOINT"));
      const bucket = setting(this.config, "B2_BUCKET");
      const virtualHost = new URL(storage);
      if (bucket) virtualHost.hostname = `${bucket}.${storage.hostname}`;
      if (source.protocol !== "https:" || ![storage.origin, ...(bucket ? [virtualHost.origin] : [])].includes(source.origin)
        || source.username || source.password) throw new Error();
      const response = await fetch(source, { redirect: "error", signal });
      const mimeType = response.headers.get("content-type")?.split(";")[0].trim();
      if (!response.ok || !mimeType || !["image/png", "image/jpeg", "image/webp"].includes(mimeType)
        || Number(response.headers.get("content-length")) > 19_000_000 || !response.body) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error();
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 19_000_000) throw new Error();
        chunks.push(Buffer.from(chunk));
      }
      return { inlineData: { mimeType, data: Buffer.concat(chunks).toString("base64") } };
    } catch {
      if (parent?.aborted) throw new AiProviderError(this.providerName, "network_or_timeout", true);
      throw new AiProviderError(this.providerName, "image_input_unavailable");
    }
  }
}
