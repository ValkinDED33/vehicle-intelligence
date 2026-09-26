import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";

import { OBJECT_STORAGE } from "../../../common/object-storage/object-storage.constants";
import {
  type ObjectStorageDownloadTarget,
  type ObjectStorageObjectMetadata,
  type ObjectStorageProvider,
} from "../../../common/object-storage/object-storage.types";
import { type VehicleDocument } from "../schemas/vehicle-document.schema";

const MAX_PROCESSING_SIZE_BYTES = 50 * 1024 * 1024;

export interface CreateDocumentUploadInput {
  originalFileName: string;
  mimeType: string;
  fileSizeBytes?: number;
}

export interface CreateDocumentUploadResult {
  documentId: string;

  provider: string;
  bucket: string;
  key: string;

  uploadUrl: string;
  method: "PUT" | "POST";

  headers?: Record<string, string>;

  expiresAt: Date;
}

export interface ConfirmDocumentUploadInput {
  bucket: string;
  key: string;
}

export interface StoredDocumentContent {
  buffer: Buffer;

  mimeType?: string;
  fileSizeBytes: number;
}

@Injectable()
export class DocumentStorageService {
  constructor(
    private readonly configService: ConfigService,

    @Inject(OBJECT_STORAGE)
    private readonly objectStorage: ObjectStorageProvider,
  ) {}

  async createUploadTarget(
    vehicleId: string,
    documentId: string,
    input: CreateDocumentUploadInput,
  ): Promise<CreateDocumentUploadResult> {
    this.validateUploadInput(input);

    const bucket = this.getBucket();

    const extension = this.extractSafeExtension(input.originalFileName);

    const objectId = randomUUID();

    const key = extension
      ? `vehicles/${vehicleId}/documents/${documentId}/${objectId}.${extension}`
      : `vehicles/${vehicleId}/documents/${documentId}/${objectId}`;

    const uploadTarget = await this.objectStorage.createSignedUpload({
      bucket,
      key,

      contentType: input.mimeType,

      contentLength: input.fileSizeBytes,

      metadata: {
        vehicleId,
        documentId,
      },
    });

    return {
      documentId,

      provider: uploadTarget.provider,

      bucket: uploadTarget.bucket,

      key: uploadTarget.key,

      uploadUrl: uploadTarget.uploadUrl,

      method: uploadTarget.method,

      headers: uploadTarget.headers,

      expiresAt: uploadTarget.expiresAt,
    };
  }

  async getUploadedObjectMetadata(
    vehicleId: string,
    documentId: string,
    input: ConfirmDocumentUploadInput,
  ): Promise<ObjectStorageObjectMetadata> {
    const configuredBucket = this.getBucket();

    if (input.bucket !== configuredBucket) {
      throw new BadRequestException("Unexpected object storage bucket");
    }

    const expectedPrefix = `vehicles/${vehicleId}/documents/${documentId}/`;

    if (!input.key.startsWith(expectedPrefix)) {
      throw new BadRequestException(
        "Object key does not belong to this document",
      );
    }

    return this.objectStorage.getObjectMetadata({
      bucket: input.bucket,

      key: input.key,
    });
  }

  async createDownloadTarget(
    document: VehicleDocument,
  ): Promise<ObjectStorageDownloadTarget> {
    this.assertStoredDocument(document);

    return this.objectStorage.createSignedDownload({
      bucket: document.storageBucket!,

      key: document.storageKey!,

      versionId: document.storageVersionId ?? undefined,

      expiresInSeconds: 15 * 60,
    });
  }

  async readStoredObject(
    document: VehicleDocument,
  ): Promise<StoredDocumentContent> {
    this.assertStoredDocument(document);

    if (
      document.fileSizeBytes !== null &&
      document.fileSizeBytes > MAX_PROCESSING_SIZE_BYTES
    ) {
      throw new BadRequestException(
        "Document exceeds maximum AI processing size",
      );
    }

    const downloadTarget = await this.createDownloadTarget(document);

    const response = await fetch(downloadTarget.downloadUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to download document from object storage: HTTP ${response.status}`,
      );
    }

    const declaredLength = this.parseContentLength(
      response.headers.get("content-length"),
    );

    if (
      declaredLength !== undefined &&
      declaredLength > MAX_PROCESSING_SIZE_BYTES
    ) {
      throw new BadRequestException(
        "Document exceeds maximum AI processing size",
      );
    }

    const arrayBuffer = await response.arrayBuffer();

    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_PROCESSING_SIZE_BYTES) {
      throw new BadRequestException(
        "Document exceeds maximum AI processing size",
      );
    }

    return {
      buffer,

      mimeType:
        response.headers.get("content-type") ?? document.mimeType ?? undefined,

      fileSizeBytes: buffer.length,
    };
  }

  async deleteStoredObject(document: VehicleDocument): Promise<void> {
    if (!document.storageBucket || !document.storageKey) {
      return;
    }

    await this.objectStorage.deleteObject({
      bucket: document.storageBucket,

      key: document.storageKey,

      versionId: document.storageVersionId ?? undefined,
    });
  }

  private assertStoredDocument(document: VehicleDocument): void {
    if (!document.storageBucket || !document.storageKey) {
      throw new BadRequestException("Document file has not been uploaded yet");
    }
  }

  private validateUploadInput(input: CreateDocumentUploadInput): void {
    if (!input.originalFileName.trim()) {
      throw new BadRequestException("Original file name is required");
    }

    if (!input.mimeType.trim()) {
      throw new BadRequestException("MIME type is required");
    }

    if (
      input.fileSizeBytes !== undefined &&
      (!Number.isSafeInteger(input.fileSizeBytes) || input.fileSizeBytes <= 0)
    ) {
      throw new BadRequestException(
        "File size must be a positive safe integer",
      );
    }
  }

  private getBucket(): string {
    const bucket = this.configService.get<string>("B2_BUCKET");

    if (!bucket) {
      throw new Error("B2_BUCKET environment variable is required");
    }

    return bucket;
  }

  private extractSafeExtension(fileName: string): string | null {
    const normalized = fileName.trim();

    const lastDot = normalized.lastIndexOf(".");

    if (lastDot <= 0 || lastDot === normalized.length - 1) {
      return null;
    }

    const extension = normalized
      .slice(lastDot + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (extension.length === 0 || extension.length > 12) {
      return null;
    }

    return extension;
  }

  private parseContentLength(value: string | null): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      return undefined;
    }

    return parsed;
  }
}
