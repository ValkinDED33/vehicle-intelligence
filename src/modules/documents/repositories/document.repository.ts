import { Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { DatabaseService } from "../../../common/database/database.service";
import { resolvePagination } from "../../../common/dto/pagination-query.dto";
import {
  type NewVehicleDocument,
  type VehicleDocument,
  vehicleDocuments,
} from "../schemas/vehicle-document.schema";

export interface CreateVehicleDocumentData {
  vehicleId: string;

  type: string;

  title: string;
  description?: string;

  documentNumber?: string;
  issuerName?: string;

  issuedAt?: Date;
  expiresAt?: Date;

  source?: string;
}

export interface VehicleDocumentQuery {
  type?: string;

  issuedFrom?: Date;
  issuedTo?: Date;

  expiresFrom?: Date;
  expiresTo?: Date;

  processingStatus?: string;

  limit?: number;
  offset?: number;
}

export interface ConfirmStoredDocumentData {
  storageProvider: string;
  storageBucket: string;
  storageKey: string;

  storageVersionId?: string;

  originalFileName?: string;
  mimeType?: string;

  fileSizeBytes?: number;
  checksum?: string;

  processingStatus?: string;
}

@Injectable()
export class DocumentRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(data: CreateVehicleDocumentData): Promise<VehicleDocument> {
    const values: NewVehicleDocument = {
      vehicleId: data.vehicleId,

      type: data.type.trim().toLowerCase(),

      title: data.title.trim(),

      description: data.description?.trim() || null,

      documentNumber: data.documentNumber?.trim() || null,

      issuerName: data.issuerName?.trim() || null,

      issuedAt: data.issuedAt ?? null,

      expiresAt: data.expiresAt ?? null,

      source: data.source ?? "manual",

      processingStatus: "none",
    };

    const [document] = await this.databaseService.connection
      .insert(vehicleDocuments)
      .values(values)
      .returning();

    if (!document) {
      throw new Error("Failed to persist vehicle document");
    }

    return document;
  }

  async findByIdForVehicle(
    vehicleId: string,
    documentId: string,
  ): Promise<VehicleDocument | null> {
    const [document] = await this.databaseService.connection
      .select()
      .from(vehicleDocuments)
      .where(
        and(
          eq(vehicleDocuments.id, documentId),
          eq(vehicleDocuments.vehicleId, vehicleId),
        ),
      )
      .limit(1);

    return document ?? null;
  }

  async listForVehicle(
    vehicleId: string,
    query: VehicleDocumentQuery = {},
  ): Promise<VehicleDocument[]> {
    const conditions = [eq(vehicleDocuments.vehicleId, vehicleId)];

    if (query.type) {
      conditions.push(
        eq(vehicleDocuments.type, query.type.trim().toLowerCase()),
      );
    }

    if (query.issuedFrom) {
      conditions.push(gte(vehicleDocuments.issuedAt, query.issuedFrom));
    }

    if (query.issuedTo) {
      conditions.push(lte(vehicleDocuments.issuedAt, query.issuedTo));
    }

    if (query.expiresFrom) {
      conditions.push(gte(vehicleDocuments.expiresAt, query.expiresFrom));
    }

    if (query.expiresTo) {
      conditions.push(lte(vehicleDocuments.expiresAt, query.expiresTo));
    }

    if (query.processingStatus) {
      conditions.push(
        eq(vehicleDocuments.processingStatus, query.processingStatus),
      );
    }

    return this.databaseService.connection
      .select()
      .from(vehicleDocuments)
      .where(and(...conditions))
      .orderBy(desc(vehicleDocuments.createdAt))
      .limit(resolvePagination(query).limit)
      .offset(resolvePagination(query).offset);
  }

  async confirmStoredObject(
    vehicleId: string,
    documentId: string,
    data: ConfirmStoredDocumentData,
  ): Promise<VehicleDocument | null> {
    const [document] = await this.databaseService.connection
      .update(vehicleDocuments)
      .set({
        storageProvider: data.storageProvider,

        storageBucket: data.storageBucket,

        storageKey: data.storageKey,

        storageVersionId: data.storageVersionId ?? null,

        originalFileName: data.originalFileName ?? null,

        mimeType: data.mimeType ?? null,

        fileSizeBytes: data.fileSizeBytes ?? null,

        checksum: data.checksum ?? null,

        processingStatus: data.processingStatus ?? "pending",

        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vehicleDocuments.id, documentId),
          eq(vehicleDocuments.vehicleId, vehicleId),
        ),
      )
      .returning();

    return document ?? null;
  }

  async updateProcessingResult(
    vehicleId: string,
    documentId: string,
    data: {
      processingStatus: string;
      extractedText?: string;
    },
  ): Promise<VehicleDocument | null> {
    const [document] = await this.databaseService.connection
      .update(vehicleDocuments)
      .set({
        processingStatus: data.processingStatus,

        extractedText: data.extractedText ?? null,

        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vehicleDocuments.id, documentId),
          eq(vehicleDocuments.vehicleId, vehicleId),
        ),
      )
      .returning();

    return document ?? null;
  }

  async delete(
    vehicleId: string,
    documentId: string,
  ): Promise<VehicleDocument | null> {
    const [document] = await this.databaseService.connection
      .delete(vehicleDocuments)
      .where(
        and(
          eq(vehicleDocuments.id, documentId),
          eq(vehicleDocuments.vehicleId, vehicleId),
        ),
      )
      .returning();

    return document ?? null;
  }
}
