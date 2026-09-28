import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  DocumentsDbService,
  type VehicleDocumentWithFields,
} from "../documents.db.service";
import { type VehicleDocument } from "../schemas/vehicle-document.schema";
import { DocumentAnalysisService } from "./document-analysis.service";

@Injectable()
export class DocumentProcessingService {
  private static readonly PROCESSING_LEASE_MS = 30 * 60 * 1000;

  constructor(
    private readonly documentsDbService: DocumentsDbService,
    private readonly documentAnalysisService: DocumentAnalysisService,
  ) {}

  async processDocument(
    vehicleId: string,
    documentId: string,
  ): Promise<VehicleDocumentWithFields> {
    const lease = await this.documentsDbService.acquireProcessingLease(
      vehicleId,
      documentId,
      new Date(Date.now() - DocumentProcessingService.PROCESSING_LEASE_MS),
    );

    if (!lease) {
      await this.explainProcessingLeaseFailure(vehicleId, documentId);

      throw new ConflictException("Document is not available for processing");
    }

    try {
      this.validateProcessableDocument(lease, {
        allowActiveProcessing: true,
      });

      const analysis = await this.documentAnalysisService.analyze(lease);

      const updated = await this.documentsDbService.replaceExtractedFields(
        vehicleId,
        documentId,
        {
          fields: analysis.fields,

          processingStatus: "completed",

          extractedText: analysis.extractedText,
        },
      );

      if (!updated) {
        throw new NotFoundException(
          "Vehicle document not found during processing",
        );
      }

      return updated;
    } catch (error) {
      await this.documentsDbService.updateProcessingResult(
        vehicleId,
        documentId,
        {
          processingStatus: "failed",
          processingError: this.toProcessingError(error),
        },
      );

      throw error;
    }
  }

  private validateProcessableDocument(
    document: VehicleDocument,
    options: { allowActiveProcessing?: boolean } = {},
  ): void {
    if (!document.storageBucket || !document.storageKey) {
      throw new BadRequestException("Document file has not been uploaded");
    }

    if (
      !options.allowActiveProcessing &&
      document.processingStatus === "processing"
    ) {
      throw new ConflictException("Document is already being processed");
    }

    const mimeType = document.mimeType?.trim().toLowerCase();

    if (!mimeType) {
      throw new BadRequestException("Document MIME type is missing");
    }

    const supported =
      mimeType.startsWith("image/") || mimeType === "application/pdf";

    if (!supported) {
      throw new BadRequestException(
        `Unsupported document MIME type: ${mimeType}`,
      );
    }
  }

  private async explainProcessingLeaseFailure(
    vehicleId: string,
    documentId: string,
  ): Promise<never> {
    const result = await this.documentsDbService.findByIdForVehicle(
      vehicleId,
      documentId,
    );

    if (!result) {
      throw new NotFoundException("Vehicle document not found");
    }

    this.validateProcessableDocument(result.document);

    throw new ConflictException("Document is already being processed");
  }

  private toProcessingError(error: unknown): string {
    const message =
      error instanceof Error ? error.message : "Unknown document error";

    return message.slice(0, 4000);
  }
}
