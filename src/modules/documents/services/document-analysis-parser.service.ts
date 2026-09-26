import { Injectable } from "@nestjs/common";

import {
  DocumentAnalysisNormalizerService,
  type NormalizedDocumentAnalysis,
} from "./document-analysis-normalizer.service";

@Injectable()
export class DocumentAnalysisParserService {
  constructor(private readonly normalizer: DocumentAnalysisNormalizerService) {}

  parse(value: string): NormalizedDocumentAnalysis {
    const normalizedValue = this.normalizeResponse(value);

    const analysis = this.normalizer.parse(normalizedValue);

    return this.normalizer.normalize(analysis);
  }

  private normalizeResponse(value: string): string {
    const normalized = value.trim();

    if (!normalized) {
      throw new Error("AI returned an empty document analysis response");
    }

    return normalized
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
}
