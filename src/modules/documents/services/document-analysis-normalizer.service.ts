import { Injectable } from "@nestjs/common";

import { type CreateDocumentFieldData } from "../documents.db.service";
import { DocumentAnalysisFieldNormalizerService } from "./document-analysis-field-normalizer.service";
import {
  type AiDocumentAnalysis,
  DocumentAnalysisJsonParserService,
} from "./document-analysis-json-parser.service";
import { DocumentFieldCanonicalizerService } from "./document-field-canonicalizer.service";

export interface NormalizedDocumentAnalysis {
  extractedText?: string;
  fields: CreateDocumentFieldData[];
}

@Injectable()
export class DocumentAnalysisNormalizerService {
  constructor(
    private readonly jsonParser: DocumentAnalysisJsonParserService,
    private readonly fieldNormalizer: DocumentAnalysisFieldNormalizerService,
    private readonly canonicalizer: DocumentFieldCanonicalizerService,
  ) {}

  parse(value: string): AiDocumentAnalysis {
    return this.jsonParser.parse(value);
  }

  normalize(analysis: AiDocumentAnalysis): NormalizedDocumentAnalysis {
    const fields: CreateDocumentFieldData[] = [];

    for (const [rawKey, value] of Object.entries(analysis)) {
      const field = this.fieldNormalizer.normalize(rawKey, value);

      if (field) {
        fields.push(field);
      }
    }

    return {
      fields: this.canonicalizer.canonicalize(fields),
    };
  }

  merge(analyses: NormalizedDocumentAnalysis[]): NormalizedDocumentAnalysis {
    const fields: CreateDocumentFieldData[] = [];
    const extractedTexts: string[] = [];

    for (const analysis of analyses) {
      fields.push(...analysis.fields);

      if (analysis.extractedText) {
        extractedTexts.push(analysis.extractedText);
      }
    }

    return {
      extractedText:
        extractedTexts.length > 0 ? extractedTexts.join("\n\n") : undefined,

      fields: this.canonicalizer.canonicalize(fields),
    };
  }
}
