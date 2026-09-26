import { Injectable } from "@nestjs/common";

import { type VehicleDocument } from "../schemas/vehicle-document.schema";

@Injectable()
export class DocumentAnalysisPromptService {
  buildSystemPrompt(): string {
    return [
      "You extract structured data from vehicle-related documents.",
      "Read only information clearly visible in the supplied images.",
      "Do not invent or infer missing values.",
      "Preserve identifiers and names exactly as printed.",
      "Pay special attention to VINs, registration numbers, invoice numbers, tax IDs and names.",
      "Distinguish visually similar characters such as 0/O, 1/I, 5/S and 8/B.",
      "Return exactly one compact valid JSON object and nothing else.",
      "Do not return OCR transcription.",
      "Do not return labels, types, confidence scores or explanations.",
      "Do not use Markdown or code fences.",
      "Use only snake_case keys.",
      "Use ISO YYYY-MM-DD for dates when possible.",
      "Use JSON numbers for numeric amounts.",
      "Omit fields that are absent or unreadable.",
      "Keep the response compact.",
    ].join(" ");
  }

  buildImagePrompt(document: VehicleDocument): string {
    return [
      `Document type: ${document.type}.`,
      `Document title: ${document.title}.`,
      "",
      "Extract the useful structured data visible in this document.",
      "",
      this.buildExtractionRules(),
    ].join("\n");
  }

  buildPdfBatchPrompt(
    document: VehicleDocument,
    firstPage: number,
    lastPage: number,
    totalPages: number,
  ): string {
    return [
      `Document type: ${document.type}.`,
      `Document title: ${document.title}.`,
      `These images are pages ${firstPage}-${lastPage} of ${totalPages}.`,
      "",
      "Analyze every supplied page.",
      "Extract only information visible on the supplied pages.",
      "Do not infer information from pages that are not supplied.",
      "",
      this.buildExtractionRules(),
    ].join("\n");
  }

  private buildExtractionRules(): string {
    return [
      "Return one flat JSON object.",
      "",
      "Use these canonical keys when applicable:",
      "vin",
      "registration_number",
      "vehicle_make",
      "vehicle_model",
      "invoice_number",
      "issued_at",
      "issuer",
      "issuer_tax_id",
      "issuer_address",
      "buyer",
      "buyer_tax_id",
      "buyer_address",
      "service_description",
      "odometer_km",
      "net_amount",
      "tax_amount",
      "tax_rate",
      "total_amount",
      "currency",
      "payment_method",
      "payment_status",
      "payment_date",
      "bank_account",
      "bank_name",
      "policy_number",
      "valid_from",
      "valid_until",
      "",
      "Separate vehicle information from service_description.",
      "For example, if a line contains vehicle make, model, registration number and service text, extract them into separate fields.",
      "service_description must contain only the performed service or work description.",
      "For tax_rate return the percentage number, for example 23 for 23%.",
      "Do not return null values.",
      "Do not return empty strings.",
      "Do not repeat the same information under different keys.",
      "If useful information does not match a listed key, use a concise snake_case key.",
      "",
      "Example shape:",
      "{",
      '  "invoice_number": "FV/123",',
      '  "issued_at": "2026-05-25",',
      '  "vehicle_make": "Skoda",',
      '  "vehicle_model": "Citigo",',
      '  "registration_number": "GD335LS",',
      '  "service_description": "Wymiana oleju oraz filtrów",',
      '  "total_amount": 350,',
      '  "currency": "PLN"',
      "}",
    ].join("\n");
  }
}
