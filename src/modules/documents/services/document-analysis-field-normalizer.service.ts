import { Injectable } from "@nestjs/common";

import { type CreateDocumentFieldData } from "../documents.db.service";

@Injectable()
export class DocumentAnalysisFieldNormalizerService {
  private readonly dateFields = new Set([
    "issued_at",
    "payment_date",
    "valid_from",
    "valid_until",
  ]);

  private readonly currencyFields = new Set([
    "net_amount",
    "tax_amount",
    "total_amount",
  ]);

  private readonly numberFields = new Set(["tax_rate", "odometer_km"]);

  normalize(
    rawKey: string,
    value: unknown,
  ): CreateDocumentFieldData | undefined {
    const fieldKey = this.normalizeFieldKey(rawKey);

    if (!fieldKey || !this.hasValue(value)) {
      return undefined;
    }

    const valueType = this.detectValueType(fieldKey, value);

    const field: CreateDocumentFieldData = {
      fieldKey,
      fieldLabel: this.createFieldLabel(fieldKey),
      valueType,
      source: "ai",
    };

    this.assignFieldValue(field, valueType, value);

    if (
      field.valueText === undefined &&
      field.valueNumber === undefined &&
      field.valueJson === undefined
    ) {
      return undefined;
    }

    return field;
  }

  private detectValueType(fieldKey: string, value: unknown): string {
    if (this.dateFields.has(fieldKey)) {
      return "date";
    }

    if (this.currencyFields.has(fieldKey)) {
      return "currency";
    }

    if (this.numberFields.has(fieldKey)) {
      return "number";
    }

    if (typeof value === "number") {
      return "number";
    }

    if (typeof value === "boolean") {
      return "boolean";
    }

    if (typeof value === "object" && value !== null) {
      return "json";
    }

    return "string";
  }

  private assignFieldValue(
    target: CreateDocumentFieldData,
    valueType: string,
    value: unknown,
  ): void {
    if (value === null || value === undefined) {
      return;
    }

    if (valueType === "number" || valueType === "currency") {
      const numericValue = this.normalizeNumber(value);

      if (numericValue !== undefined) {
        target.valueNumber = numericValue.toFixed(4);
        target.valueText = String(value);
        return;
      }
    }

    if (valueType === "json") {
      target.valueJson = value;
      return;
    }

    if (valueType === "boolean") {
      if (typeof value === "boolean") {
        target.valueText = value ? "true" : "false";
        return;
      }

      const normalized = String(value).trim().toLowerCase();

      if (normalized === "true" || normalized === "false") {
        target.valueText = normalized;
      }

      return;
    }

    const text = this.normalizeOptionalString(value);

    if (text) {
      target.valueText = text;
    }
  }

  private normalizeFieldKey(value: string): string | undefined {
    const key = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return key || undefined;
  }

  private createFieldLabel(fieldKey: string): string {
    return fieldKey
      .split("_")
      .map((part) => {
        if (part === "vin") {
          return "VIN";
        }

        if (part === "id") {
          return "ID";
        }

        if (part === "km") {
          return "KM";
        }

        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }

  private hasValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return true;
  }

  private normalizeNumber(value: unknown): number | undefined {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value !== "string") {
      return undefined;
    }

    const normalized = value
      .trim()
      .replace(/\s/g, "")
      .replace("%", "")
      .replace(",", ".");

    if (!normalized) {
      return undefined;
    }

    const number = Number(normalized);

    return Number.isFinite(number) ? number : undefined;
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value === "string") {
      const normalized = value.trim();

      return normalized || undefined;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    return undefined;
  }
}
