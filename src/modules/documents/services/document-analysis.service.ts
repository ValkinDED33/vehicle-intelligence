import { Injectable, Logger } from "@nestjs/common";

import { type AiImageInput } from "../../../common/ai-gateway/ai-provider.interface";
import { type VehicleDocument } from "../schemas/vehicle-document.schema";
import {
  type NormalizedDocumentAnalysis,
  DocumentAnalysisNormalizerService,
} from "./document-analysis-normalizer.service";
import { DocumentStorageService } from "./document-storage.service";
import { DocumentVisionService } from "./document-vision.service";
import { PdfRendererService } from "./pdf-renderer.service";

@Injectable()
export class DocumentAnalysisService {
  private readonly logger = new Logger(DocumentAnalysisService.name);

  constructor(
    private readonly documentStorageService: DocumentStorageService,
    private readonly pdfRendererService: PdfRendererService,
    private readonly documentVisionService: DocumentVisionService,
    private readonly normalizer: DocumentAnalysisNormalizerService,
  ) {}

  async analyze(
    document: VehicleDocument,
  ): Promise<NormalizedDocumentAnalysis> {
    const mimeType = document.mimeType?.trim().toLowerCase();

    if (!mimeType) {
      throw new Error("Document MIME type is missing");
    }

    if (mimeType.startsWith("image/")) {
      return this.analyzeImage(document);
    }

    if (mimeType === "application/pdf") {
      return this.analyzePdf(document);
    }

    throw new Error(`Unsupported document MIME type: ${mimeType}`);
  }

  private async analyzeImage(
    document: VehicleDocument,
  ): Promise<NormalizedDocumentAnalysis> {
    const startedAt = Date.now();

    const downloadTarget =
      await this.documentStorageService.createDownloadTarget(document);

    const result = await this.documentVisionService.analyzeImage(
      document,
      downloadTarget.downloadUrl,
    );

    this.logger.log(`Image analysis TOTAL: ${Date.now() - startedAt} ms`);

    return result;
  }

  private async analyzePdf(
    document: VehicleDocument,
  ): Promise<NormalizedDocumentAnalysis> {
    const totalStartedAt = Date.now();

    const downloadStartedAt = Date.now();

    const storedContent =
      await this.documentStorageService.readStoredObject(document);

    this.logger.log(`PDF download: ${Date.now() - downloadStartedAt} ms`);

    const analyses: NormalizedDocumentAnalysis[] = [];

    for await (const batch of this.pdfRendererService.renderBatches(
      storedContent.buffer,
      5,
    )) {
      const images: AiImageInput[] = batch.pages.map((page) => ({
        url: `data:${page.mimeType};base64,${page.buffer.toString("base64")}`,
      }));

      const visionStartedAt = Date.now();

      const result = await this.documentVisionService.analyzePdfBatch(
        document,
        images,
        batch.firstPage,
        batch.lastPage,
        batch.totalPages,
      );

      this.logger.log(
        `Vision pages ${batch.firstPage}-${batch.lastPage}: ${
          Date.now() - visionStartedAt
        } ms`,
      );

      analyses.push(result);
    }

    if (analyses.length === 0) {
      throw new Error("PDF processing produced no analysis batches");
    }

    const result = this.normalizer.merge(analyses);

    this.logger.log(`PDF analysis TOTAL: ${Date.now() - totalStartedAt} ms`);

    return result;
  }
}
