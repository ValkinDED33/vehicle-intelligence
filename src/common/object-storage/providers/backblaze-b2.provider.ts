import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  type AssertObjectStorageAccessInput,
  type CreateSignedDownloadInput,
  type DeleteObjectInput,
  type GetObjectMetadataInput,
  type ObjectStorageDownloadTarget,
  type ObjectStorageObjectMetadata,
  type ObjectStorageProvider,
  type ObjectStorageUploadRequest,
  type ObjectStorageUploadTarget,
} from "../object-storage.types";

@Injectable()
export class BackblazeB2Provider implements ObjectStorageProvider {
  readonly providerName = "backblaze-b2";

  private client: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {
    // Optional integration: do NOT throw in constructor, otherwise the API
    // fails to boot (status 1) when B2 keys are missing on Render.
  }

  private ensureClient(): S3Client {
    if (this.client) return this.client;
    const endpoint = this.configService.get<string>("B2_S3_ENDPOINT");

    const region = this.configService.get<string>("B2_S3_REGION");

    const keyId = this.configService.get<string>("B2_KEY_ID");

    const applicationKey =
      this.configService.get<string>("B2_APPLICATION_KEY");

    if (!endpoint || !region || !keyId || !applicationKey) {
      throw new Error(
        "Object storage is not configured (missing B2_S3_ENDPOINT / B2_S3_REGION / B2_KEY_ID / B2_APPLICATION_KEY)",
      );
    }

    this.client = new S3Client({
      endpoint,
      region,

      credentials: {
        accessKeyId: keyId,
        secretAccessKey: applicationKey,
      },
    });
    return this.client;
  }

  async assertAccess(input: AssertObjectStorageAccessInput): Promise<void> {
    await this.ensureClient().send(
      new HeadBucketCommand({
        Bucket: input.bucket,
      }),
    );
  }

  async createSignedUpload(
    input: ObjectStorageUploadRequest,
  ): Promise<ObjectStorageUploadTarget> {
    const client = this.ensureClient();
    const expiresInSeconds = 15 * 60;

    const command = new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      Metadata: input.metadata,
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      provider: this.providerName,
      bucket: input.bucket,
      key: input.key,
      uploadUrl,
      method: "PUT",
      headers: {
        "Content-Type": input.contentType,
      },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async createSignedDownload(
    input: CreateSignedDownloadInput,
  ): Promise<ObjectStorageDownloadTarget> {
    const downloadClient = this.ensureClient();
    const expiresInSeconds = input.expiresInSeconds ?? 15 * 60;

    const command = new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      VersionId: input.versionId,
    });

    const downloadUrl = await getSignedUrl(downloadClient, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      provider: this.providerName,
      bucket: input.bucket,
      key: input.key,
      downloadUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async getObjectMetadata(
    input: GetObjectMetadataInput,
  ): Promise<ObjectStorageObjectMetadata> {
    const response = await this.ensureClient().send(
      new HeadObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        VersionId: input.versionId,
      }),
    );

    return {
      provider: this.providerName,
      bucket: input.bucket,
      key: input.key,

      versionId: response.VersionId,

      contentType: response.ContentType,

      contentLength: response.ContentLength,

      checksum: response.ChecksumSHA256,

      etag: response.ETag,

      lastModifiedAt: response.LastModified,
    };
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    await this.ensureClient().send(
      new DeleteObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        VersionId: input.versionId,
      }),
    );
  }
}
