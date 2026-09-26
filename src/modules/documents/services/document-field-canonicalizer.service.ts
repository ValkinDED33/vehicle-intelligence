import { Injectable } from "@nestjs/common";

import { type CreateDocumentFieldData } from "../documents.db.service";

@Injectable()
export class DocumentFieldCanonicalizerService {
  canonicalize(fields: CreateDocumentFieldData[]): CreateDocumentFieldData[] {
    const result = new Map<string, CreateDocumentFieldData>();

    for (const field of fields) {
      const canonical = this.canonicalizeField(field);

      if (!canonical) {
        continue;
      }

      const existing = result.get(canonical.fieldKey);

      if (!existing) {
        result.set(canonical.fieldKey, canonical);
        continue;
      }

      if (this.getConfidence(canonical) > this.getConfidence(existing)) {
        result.set(canonical.fieldKey, canonical);
      }
    }

    return Array.from(result.values());
  }

  private canonicalizeField(
    field: CreateDocumentFieldData,
  ): CreateDocumentFieldData | undefined {
    const fieldKey = this.mapFieldKey(field.fieldKey);

    const normalized: CreateDocumentFieldData = {
      ...field,
      fieldKey,
    };

    if (fieldKey === "vin") {
      if (!this.normalizeVin(normalized)) {
        return undefined;
      }
    }

    if (fieldKey === "tax_rate") {
      this.normalizeTaxRate(normalized);
    }

    if (fieldKey === "issuer_tax_id" || fieldKey === "buyer_tax_id") {
      this.normalizePolishTaxId(normalized);
    }

    return normalized;
  }

  private mapFieldKey(fieldKey: string): string {
    switch (fieldKey) {
      case "seller":
      case "service_provider":
      case "provider":
        return "issuer";

      case "seller_tax_id":
      case "issuer_nip":
        return "issuer_tax_id";

      case "buyers_tax_id":
      case "buyer_nip":
      case "customer_tax_id":
      case "customer_nip":
        return "buyer_tax_id";

      case "customer":
      case "buyer_name":
      case "customer_name":
        return "buyer";

      case "license_plate":
      case "registration":
      case "registration_plate":
      case "plate_number":
      case "vehicle_registration":
        return "registration_number";

      case "invoice_no":
      case "invoice_id":
        return "invoice_number";

      case "issue_date":
      case "invoice_date":
        return "issued_at";

      case "paid_at":
      case "date_paid":
        return "payment_date";

      case "gross_amount":
      case "amount_total":
      case "grand_total":
        return "total_amount";

      case "vat_amount":
        return "tax_amount";

      case "vat_rate":
        return "tax_rate";

      case "car_make":
        return "vehicle_make";

      case "car_model":
        return "vehicle_model";

      default:
        return fieldKey;
    }
  }

  private normalizeVin(field: CreateDocumentFieldData): boolean {
    if (!field.valueText) {
      return false;
    }

    const vin = field.valueText
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "");

    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      return false;
    }

    field.valueType = "string";
    field.valueText = vin;
    field.valueNumber = undefined;
    field.valueJson = undefined;

    return true;
  }

  private normalizeTaxRate(field: CreateDocumentFieldData): void {
    const numeric = this.readNumericValue(field);

    if (numeric === undefined) {
      return;
    }

    const normalizedRate =
      numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;

    field.valueType = "number";
    field.valueNumber = normalizedRate.toFixed(4);
    field.valueText = String(normalizedRate);
  }

  private normalizePolishTaxId(field: CreateDocumentFieldData): void {
    if (!field.valueText) {
      return;
    }

    const original = field.valueText.trim();

    const compact = original.replace(/\s+/g, "").replace(/-/g, "");

    const match = compact.match(/^PL(\d{10})$/i);

    if (!match) {
      return;
    }

    field.valueType = "string";
    field.valueText = match[1];
    field.valueNumber = undefined;
    field.valueJson = undefined;
  }

  private readNumericValue(field: CreateDocumentFieldData): number | undefined {
    if (field.valueNumber) {
      const value = Number(field.valueNumber);

      if (Number.isFinite(value)) {
        return value;
      }
    }

    if (!field.valueText) {
      return undefined;
    }

    const normalized = field.valueText
      .trim()
      .replace("%", "")
      .replace(",", ".");

    const value = Number(normalized);

    return Number.isFinite(value) ? value : undefined;
  }

  private getConfidence(field: CreateDocumentFieldData): number {
    const value = field.confidence ? Number(field.confidence) : -1;

    return Number.isFinite(value) ? value : -1;
  }
}
