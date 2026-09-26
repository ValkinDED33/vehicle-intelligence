import { Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";

import { DatabaseService } from "../../../common/database/database.service";
import {
  type DocumentField,
  type NewDocumentField,
  documentFields,
} from "../schemas/document-field.schema";

export interface CreateDocumentFieldData {
  fieldKey: string;
  fieldLabel?: string;

  valueType?: string;

  valueText?: string;
  valueNumber?: string;
  valueJson?: unknown;

  confidence?: string;

  source?: string;
}

@Injectable()
export class DocumentFieldsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createMany(
    documentId: string,
    fields: CreateDocumentFieldData[],
    defaultSource = "manual",
  ): Promise<DocumentField[]> {
    if (fields.length === 0) {
      return [];
    }

    const values = this.mapFields(documentId, fields, defaultSource);

    return this.databaseService.connection
      .insert(documentFields)
      .values(values)
      .returning();
  }

  async listByDocumentId(documentId: string): Promise<DocumentField[]> {
    return this.databaseService.connection
      .select()
      .from(documentFields)
      .where(eq(documentFields.documentId, documentId));
  }

  async deleteExtractedFields(documentId: string): Promise<void> {
    await this.databaseService.connection
      .delete(documentFields)
      .where(
        and(
          eq(documentFields.documentId, documentId),
          inArray(documentFields.source, ["ai", "ocr"]),
        ),
      );
  }

  mapFields(
    documentId: string,
    fields: CreateDocumentFieldData[],
    defaultSource = "manual",
  ): NewDocumentField[] {
    return fields.map((field) => ({
      documentId,

      fieldKey: field.fieldKey.trim().toLowerCase(),

      fieldLabel: field.fieldLabel?.trim() || null,

      valueType: field.valueType ?? "string",

      valueText: field.valueText ?? null,

      valueNumber: field.valueNumber ?? null,

      valueJson: field.valueJson ?? null,

      confidence: field.confidence ?? null,

      source: field.source ?? defaultSource,
    }));
  }
}
