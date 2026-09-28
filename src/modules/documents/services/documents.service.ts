import { Injectable, Logger, NotFoundException } from "@nestjs/common";

import { GarageService } from "../../garage/services/garage.service";
import {
  DocumentsDbService,
  type VehicleDocumentQuery,
  type VehicleDocumentWithFields,
} from "../documents.db.service";
import {
  type ConfirmDocumentUploadResult,
  type CreateDocumentInput,
  type DeleteDocumentResult,
} from "../documents.types";
import { type VehicleDocument } from "../schemas/vehicle-document.schema";

import { DocumentFieldMapperService } from "./document-field-mapper.service";
import {
  DocumentStorageService,
  type CreateDocumentUploadInput,
  type CreateDocumentUploadResult,
} from "./document-storage.service";
import { DocumentValidatorService } from "./document-validator.service";

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly garageService: GarageService,
    private readonly documentsDbService: DocumentsDbService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly documentValidatorService: DocumentValidatorService,
    private readonly documentFieldMapperService: DocumentFieldMapperService,
  ) {}

  async createDocument(
    ownerId: string,
    vehicleId: string,
    input: CreateDocumentInput,
  ): Promise<VehicleDocumentWithFields> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    this.documentValidatorService.validateCreate(input);

    const fields = this.documentFieldMapperService.map(input.fields ?? []);

    return this.documentsDbService.createDocument({
      vehicleId,

      type: input.type,

      title: input.title,
      description: input.description,

      documentNumber: input.documentNumber,

      issuerName: input.issuerName,

      issuedAt: input.issuedAt,

      expiresAt: input.expiresAt,

      source: input.source ?? "manual",

      fields,
    });
  }

  async createUploadTarget(
    ownerId: string,
    vehicleId: string,
    documentId: string,
    input: CreateDocumentUploadInput,
  ): Promise<CreateDocumentUploadResult> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    await this.requireDocument(vehicleId, documentId);

    const uploadTarget = await this.documentStorageService.createUploadTarget(
      vehicleId,
      documentId,
      input,
    );

    const updated = await this.documentsDbService.setUploadIntent(
      vehicleId,
      documentId,
      {
        key: uploadTarget.key,
        fileSizeBytes: input.fileSizeBytes,
        expiresAt: uploadTarget.expiresAt,
      },
    );

    if (!updated) {
      throw new NotFoundException("Vehicle document not found");
    }

    return uploadTarget;
  }

  async confirmUpload(
    ownerId: string,
    vehicleId: string,
    documentId: string,
    input: {
      bucket: string;
      key: string;
      originalFileName?: string;
    },
  ): Promise<ConfirmDocumentUploadResult> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    const document = await this.requireDocument(vehicleId, documentId);

    const metadata =
      await this.documentStorageService.getUploadedObjectMetadata(
        vehicleId,
        documentId,
        {
          bucket: input.bucket,
          key: input.key,
          document: document.document,
        },
      );

    const updated = await this.documentsDbService.confirmStoredObject(
      vehicleId,
      documentId,
      {
        storageProvider: metadata.provider,

        storageBucket: metadata.bucket,

        storageKey: metadata.key,

        storageVersionId: metadata.versionId,

        originalFileName: input.originalFileName,

        mimeType: metadata.contentType,

        fileSizeBytes: metadata.contentLength,

        checksum: metadata.checksum ?? metadata.etag,

        processingStatus: "pending",
      },
    );

    if (!updated) {
      throw new NotFoundException("Vehicle document not found");
    }

    return {
      document: updated,

      provider: metadata.provider,

      bucket: metadata.bucket,

      key: metadata.key,

      versionId: metadata.versionId,

      contentType: metadata.contentType,

      contentLength: metadata.contentLength,

      checksum: metadata.checksum,

      etag: metadata.etag,
    };
  }

  async createDownloadTarget(
    ownerId: string,
    vehicleId: string,
    documentId: string,
  ) {
    await this.garageService.getVehicle(ownerId, vehicleId);

    const result = await this.requireDocument(vehicleId, documentId);

    return this.documentStorageService.createDownloadTarget(result.document);
  }

  async getDocument(
    ownerId: string,
    vehicleId: string,
    documentId: string,
  ): Promise<VehicleDocumentWithFields> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.requireDocument(vehicleId, documentId);
  }

  async getHistory(
    ownerId: string,
    vehicleId: string,
    query: VehicleDocumentQuery = {},
  ): Promise<VehicleDocument[]> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.documentsDbService.listForVehicle(vehicleId, query);
  }

  async deleteDocument(
    ownerId: string,
    vehicleId: string,
    documentId: string,
  ): Promise<DeleteDocumentResult> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    const result = await this.requireDocument(vehicleId, documentId);

    const document = result.document;

    const deleted = await this.documentsDbService.deleteDocument(
      vehicleId,
      documentId,
    );

    if (!deleted) {
      throw new NotFoundException("Vehicle document not found");
    }

    let objectDeleted = false;

    if (document.storageBucket && document.storageKey) {
      try {
        await this.documentStorageService.deleteStoredObject(document);
        objectDeleted = true;
      } catch (error) {
        this.logger.warn(
          `Failed to delete stored object for document ${documentId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      id: deleted.id,
      deleted: true,
      objectDeleted,
    };
  }

  private async requireDocument(
    vehicleId: string,
    documentId: string,
  ): Promise<VehicleDocumentWithFields> {
    const document = await this.documentsDbService.findByIdForVehicle(
      vehicleId,
      documentId,
    );

    if (!document) {
      throw new NotFoundException("Vehicle document not found");
    }

    return document;
  }
}
