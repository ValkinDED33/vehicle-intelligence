import { type VehicleDocument } from "./schemas/vehicle-document.schema";

export interface CreateDocumentFieldInput {
  fieldKey: string;
  fieldLabel?: string;

  valueType?: string;

  valueText?: string;
  valueNumber?: number;
  valueJson?: unknown;

  confidence?: number;

  source?: string;
}

export interface CreateDocumentInput {
  type: string;

  title: string;
  description?: string;

  documentNumber?: string;
  issuerName?: string;

  issuedAt?: Date;
  expiresAt?: Date;

  source?: string;

  fields?: CreateDocumentFieldInput[];
}

export interface ConfirmDocumentUploadResult {
  document: VehicleDocument;

  provider: string;
  bucket: string;
  key: string;

  versionId?: string;
  contentType?: string;
  contentLength?: number;
  checksum?: string;
  etag?: string;
}

export interface DeleteDocumentResult {
  id: string;
  deleted: true;
  objectDeleted: boolean;
}
