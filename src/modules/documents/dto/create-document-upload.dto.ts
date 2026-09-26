import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateDocumentUploadDto {
  @IsString()
  @MaxLength(255)
  originalFileName!: string;

  @IsString()
  @MaxLength(120)
  mimeType!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  fileSizeBytes?: number;
}
