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
  constructor(
    private readonly documentsDbService: DocumentsDbService,
    private readonly documentAnalysisService: DocumentAnalysisService,
  ) {}

  async processDocument(
    vehicleId: string,
    documentId: string,
  ): Promise<VehicleDocumentWithFields> {
    const result = await this.documentsDbService.findByIdForVehicle(
      vehicleId,
      documentId,
    );

    if (!result) {
      throw new NotFoundException("Vehicle document not found");
    }

    const document = result.document;

    this.validateProcessableDocument(document);

    await this.documentsDbService.updateProcessingResult(
      vehicleId,
      documentId,
      {
        processingStatus: "processing",
      },
    );

    try {
      const analysis = await this.documentAnalysisService.analyze(document);

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
        },
      );

      throw error;
    }
  }

  private validateProcessableDocument(document: VehicleDocument): void {
    if (!document.storageBucket || !document.storageKey) {
      throw new BadRequestException("Document file has not been uploaded");
    }

    if (document.processingStatus === "processing") {
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
}
