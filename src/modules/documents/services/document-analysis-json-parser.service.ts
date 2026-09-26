import { Injectable } from "@nestjs/common";

export type AiDocumentAnalysis = Record<string, unknown>;

@Injectable()
export class DocumentAnalysisJsonParserService {
  parse(value: string): AiDocumentAnalysis {
    const jsonText = this.extractJsonObject(value);

    try {
      return this.parseObject(jsonText);
    } catch {
      const repairedJsonText = this.repairSafeInvalidEscapes(jsonText);

      try {
        return this.parseObject(repairedJsonText);
      } catch {
        throw new Error("AI returned invalid document analysis JSON");
      }
    }
  }

  private parseObject(value: string): AiDocumentAnalysis {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("AI response root must be an object");
    }

    return parsed as AiDocumentAnalysis;
  }

  private extractJsonObject(value: string): string {
    let normalized = value.trim();

    normalized = normalized
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const firstBrace = normalized.indexOf("{");
    const lastBrace = normalized.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      throw new Error("AI response does not contain a JSON object");
    }

    return normalized.slice(firstBrace, lastBrace + 1).trim();
  }

  private repairSafeInvalidEscapes(value: string): string {
    return value.replace(/\\_/g, "_");
  }
}
