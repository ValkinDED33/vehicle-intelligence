import { Injectable } from "@nestjs/common";

import { AiGatewayService } from "../../../common/ai-gateway/ai-gateway.service";
import { type AiImageInput } from "../../../common/ai-gateway/ai-provider.interface";
import { type VehicleDocument } from "../schemas/vehicle-document.schema";
import { DocumentAnalysisParserService } from "./document-analysis-parser.service";
import { DocumentAnalysisPromptService } from "./document-analysis-prompt.service";
import { type NormalizedDocumentAnalysis } from "./document-analysis-normalizer.service";

@Injectable()
export class DocumentVisionService {
  constructor(
    private readonly aiGatewayService: AiGatewayService,
    private readonly promptService: DocumentAnalysisPromptService,
    private readonly parserService: DocumentAnalysisParserService,
  ) {}

  async analyzeImage(
    document: VehicleDocument,
    imageUrl: string,
  ): Promise<NormalizedDocumentAnalysis> {
    const response = await this.aiGatewayService.analyzeImages({
      systemPrompt: this.promptService.buildSystemPrompt(),

      userPrompt: this.promptService.buildImagePrompt(document),

      images: [
        {
          url: imageUrl,
        },
      ],

      responseFormat: "text",
    });

    return this.parserService.parse(response.text);
  }

  async analyzePdfBatch(
    document: VehicleDocument,
    images: AiImageInput[],
    firstPage: number,
    lastPage: number,
    totalPages: number,
  ): Promise<NormalizedDocumentAnalysis> {
    if (images.length === 0) {
      throw new Error("PDF vision batch contains no images");
    }

    const response = await this.aiGatewayService.analyzeImages({
      systemPrompt: this.promptService.buildSystemPrompt(),

      userPrompt: this.promptService.buildPdfBatchPrompt(
        document,
        firstPage,
        lastPage,
        totalPages,
      ),

      images,

      responseFormat: "text",
    });

    return this.parserService.parse(response.text);
  }
}
