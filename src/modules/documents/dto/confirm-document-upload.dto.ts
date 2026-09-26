import { IsOptional, IsString, MaxLength } from "class-validator";

export class ConfirmDocumentUploadDto {
  @IsString()
  @MaxLength(255)
  bucket!: string;

  @IsString()
  @MaxLength(1024)
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalFileName?: string;
}
