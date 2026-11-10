import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI, { toFile } from "openai";
import type { ImageEditParamsNonStreaming } from "openai/resources/images";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { createHash } from "crypto";
import { artworkDirection, artworkPrompt, type ArtworkFacts } from "./artwork-facts";

export class ArtworkProviderError extends Error {
  constructor(readonly code: string, readonly uncertain: boolean) { super(code); }
}
export const ARTWORK_MODEL = "gpt-image-2";
export const MAX_ARTWORK_BYTES = 2 * 1024 * 1024;

@Injectable()
export class OpenAiArtworkProvider {
  constructor(private readonly config: ConfigService) {}
  get configured() { return !!this.config.get<string>("OPENAI_API_KEY")?.trim(); }

  async reference(facts: ArtworkFacts): Promise<Buffer> {
    // Only bundled references: no user-controlled paths, network URLs or documents.
    return readFile(resolve(process.cwd(), "frontend/public/vehicle-artwork", artworkDirection(facts).reference));
  }

  async generate(facts: ArtworkFacts, ownerId: string, reference: Buffer): Promise<string> {
    const apiKey = this.config.get<string>("OPENAI_API_KEY")?.trim();
    if (!apiKey) throw new ArtworkProviderError("not_configured", false);
    const client = new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1", maxRetries: 0, timeout: 180_000 });
    try {
      const body: ImageEditParamsNonStreaming & { safety_identifier: string } = {
        model: ARTWORK_MODEL, image: await toFile(reference, "style.webp", { type: "image/webp" }),
        prompt: artworkPrompt(facts), size: "1536x1024", quality: "high", n: 1,
        output_format: "webp", output_compression: 88, background: "opaque",
        safety_identifier: createHash("sha256").update(ownerId).digest("hex"),
      };
      const result = await client.images.edit(body);
      const encoded = result.data?.[0]?.b64_json;
      if (!encoded || encoded.length > Math.ceil(MAX_ARTWORK_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new ArtworkProviderError("invalid_image", true);
      const buffer = Buffer.from(encoded, "base64");
      if (buffer.toString("base64") !== encoded || buffer.length > MAX_ARTWORK_BYTES || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") throw new ArtworkProviderError("invalid_image", true);
      const image = await loadImage(buffer);
      if (image.width !== 1536 || image.height !== 1024) throw new ArtworkProviderError("invalid_image_size", true);
      const canvas = createCanvas(32, 32), context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, 32, 32);
      const pixels = context.getImageData(0, 0, 32, 32).data;
      let min = 765, max = 0, visible = 0;
      for (let i = 0; i < pixels.length; i += 4) { const value = pixels[i] + pixels[i + 1] + pixels[i + 2]; min = Math.min(min, value); max = Math.max(max, value); if (pixels[i + 3] > 128 && value > 90) visible++; }
      if (max - min < 30 || visible < 20) throw new ArtworkProviderError("blank_image", true);
      return encoded;
    } catch (error) {
      if (error instanceof ArtworkProviderError) throw error;
      if (error instanceof OpenAI.APIError && error.status) {
        throw new ArtworkProviderError(error.status === 401 || error.status === 403 ? "provider_access" : error.status === 429 ? "provider_limit" : "provider_error", error.status >= 500);
      }
      // Never expose SDK messages, headers, request bodies, credentials or URLs.
      throw new ArtworkProviderError("generation_uncertain", true);
    }
  }
}
