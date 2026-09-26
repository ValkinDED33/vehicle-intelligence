import {
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024;

export class CreateDocumentUploadDto {
  @IsString()
  @MaxLength(255)
  originalFileName!: string;

  @IsIn(ALLOWED_DOCUMENT_MIME_TYPES as unknown as string[])
  @MaxLength(120)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_SIZE_BYTES)
  fileSizeBytes!: number;
}
