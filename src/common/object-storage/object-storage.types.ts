export interface ObjectStorageUploadRequest {
  bucket: string;
  key: string;
  contentType: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}

export interface ObjectStorageUploadTarget {
  provider: string;
  bucket: string;
  key: string;
  uploadUrl: string;
  method: "PUT" | "POST";
  headers?: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectStorageDownloadTarget {
  provider: string;
  bucket: string;
  key: string;
  downloadUrl: string;
  expiresAt: Date;
}

export interface ObjectStorageObjectMetadata {
  provider: string;
  bucket: string;
  key: string;
  versionId?: string;
  contentType?: string;
  contentLength?: number;
  checksum?: string;
  etag?: string;
  lastModifiedAt?: Date;
}

export interface CreateSignedDownloadInput {
  bucket: string;
  key: string;
  versionId?: string;
  expiresInSeconds?: number;
}

export interface DeleteObjectInput {
  bucket: string;
  key: string;
  versionId?: string;
}

export interface GetObjectMetadataInput {
  bucket: string;
  key: string;
  versionId?: string;
}

export interface AssertObjectStorageAccessInput {
  bucket: string;
}

export interface ObjectStorageProvider {
  readonly providerName: string;

  assertAccess(input: AssertObjectStorageAccessInput): Promise<void>;

  createSignedUpload(
    input: ObjectStorageUploadRequest,
  ): Promise<ObjectStorageUploadTarget>;

  createSignedDownload(
    input: CreateSignedDownloadInput,
  ): Promise<ObjectStorageDownloadTarget>;

  getObjectMetadata(
    input: GetObjectMetadataInput,
  ): Promise<ObjectStorageObjectMetadata>;

  deleteObject(input: DeleteObjectInput): Promise<void>;
}
