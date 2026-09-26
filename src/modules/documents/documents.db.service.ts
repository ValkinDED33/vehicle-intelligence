import { Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import {
  documentFields,
  type DocumentField,
} from "./schemas/document-field.schema";
import {
  vehicleDocuments,
  type VehicleDocument,
} from "./schemas/vehicle-document.schema";
import {
  DocumentFieldsRepository,
  type CreateDocumentFieldData,
} from "./repositories/document-fields.repository";
import {
  DocumentRepository,
  type ConfirmStoredDocumentData,
  type CreateVehicleDocumentData as CreateVehicleDocumentMetadata,
  type VehicleDocumentQuery,
} from "./repositories/document.repository";

export type {
  CreateDocumentFieldData,
  ConfirmStoredDocumentData,
  VehicleDocumentQuery,
};

export interface CreateVehicleDocumentData extends CreateVehicleDocumentMetadata {
  fields?: CreateDocumentFieldData[];
}

export interface VehicleDocumentWithFields {
  document: VehicleDocument;
  fields: DocumentField[];
}

export interface ReplaceExtractedFieldsData {
  fields: CreateDocumentFieldData[];
  processingStatus: string;
  extractedText?: string;
}

@Injectable()
export class DocumentsDbService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly documentRepository: DocumentRepository,
    private readonly documentFieldsRepository: DocumentFieldsRepository,
  ) {}

  async createDocument(
    data: CreateVehicleDocumentData,
  ): Promise<VehicleDocumentWithFields> {
    return this.databaseService.connection.transaction(async (tx) => {
      const [document] = await tx
        .insert(vehicleDocuments)
        .values({
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
        })
        .returning();

      if (!document) {
        throw new Error("Failed to persist vehicle document");
      }

      const values = this.documentFieldsRepository.mapFields(
        document.id,
        data.fields ?? [],
      );

      const fields =
        values.length > 0
          ? await tx.insert(documentFields).values(values).returning()
          : [];

      if (fields.length !== values.length) {
        throw new Error("Failed to persist all document fields");
      }

      return {
        document,
        fields,
      };
    });
  }

  async findByIdForVehicle(
    vehicleId: string,
    documentId: string,
  ): Promise<VehicleDocumentWithFields | null> {
    const document = await this.documentRepository.findByIdForVehicle(
      vehicleId,
      documentId,
    );

    if (!document) {
      return null;
    }

    const fields =
      await this.documentFieldsRepository.listByDocumentId(documentId);

    return {
      document,
      fields,
    };
  }

  async listForVehicle(
    vehicleId: string,
    query: VehicleDocumentQuery = {},
  ): Promise<VehicleDocument[]> {
    return this.documentRepository.listForVehicle(vehicleId, query);
  }

  async confirmStoredObject(
    vehicleId: string,
    documentId: string,
    data: ConfirmStoredDocumentData,
  ): Promise<VehicleDocument | null> {
    return this.documentRepository.confirmStoredObject(
      vehicleId,
      documentId,
      data,
    );
  }

  async updateProcessingResult(
    vehicleId: string,
    documentId: string,
    data: {
      processingStatus: string;
      extractedText?: string;
    },
  ): Promise<VehicleDocument | null> {
    return this.documentRepository.updateProcessingResult(
      vehicleId,
      documentId,
      data,
    );
  }

  async replaceExtractedFields(
    vehicleId: string,
    documentId: string,
    data: ReplaceExtractedFieldsData,
  ): Promise<VehicleDocumentWithFields | null> {
    return this.databaseService.connection.transaction(async (tx) => {
      const [document] = await tx
        .select()
        .from(vehicleDocuments)
        .where(
          and(
            eq(vehicleDocuments.id, documentId),
            eq(vehicleDocuments.vehicleId, vehicleId),
          ),
        )
        .limit(1);

      if (!document) {
        return null;
      }

      await tx
        .delete(documentFields)
        .where(
          and(
            eq(documentFields.documentId, documentId),
            inArray(documentFields.source, ["ai", "ocr"]),
          ),
        );

      const values = this.documentFieldsRepository.mapFields(
        documentId,
        data.fields,
        "ai",
      );

      if (values.length > 0) {
        const createdFields = await tx
          .insert(documentFields)
          .values(values)
          .returning();

        if (createdFields.length !== values.length) {
          throw new Error("Failed to persist extracted document fields");
        }
      }

      const [updatedDocument] = await tx
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

      if (!updatedDocument) {
        throw new Error("Failed to update processed vehicle document");
      }

      const fields = await tx
        .select()
        .from(documentFields)
        .where(eq(documentFields.documentId, documentId));

      return {
        document: updatedDocument,
        fields,
      };
    });
  }

  async deleteDocument(
    vehicleId: string,
    documentId: string,
  ): Promise<VehicleDocument | null> {
    return this.documentRepository.delete(vehicleId, documentId);
  }
}
