import { Injectable } from "@nestjs/common";

import { type CreateDocumentFieldData } from "../documents.db.service";
import { type CreateDocumentFieldInput } from "../documents.types";

@Injectable()
export class DocumentFieldMapperService {
  map(fields: CreateDocumentFieldInput[]): CreateDocumentFieldData[] {
    return fields.map((field) => ({
      fieldKey: field.fieldKey,

      fieldLabel: field.fieldLabel,

      valueType: field.valueType,

      valueText: field.valueText,

      valueNumber:
        field.valueNumber !== undefined
          ? this.toDecimalString(field.valueNumber, 4)
          : undefined,

      valueJson: field.valueJson,

      confidence:
        field.confidence !== undefined
          ? this.toDecimalString(field.confidence, 4)
          : undefined,

      source: field.source,
    }));
  }

  private toDecimalString(value: number, scale: number): string {
    return value.toFixed(scale);
  }
}
