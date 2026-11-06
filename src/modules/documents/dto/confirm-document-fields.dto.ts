import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDate, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";

export class ConfirmDocumentFieldDto {
  @IsUUID() id!: string;
  @IsString() @MaxLength(4000) valueText!: string;
}

export class ConfirmDocumentFieldsDto {
  @Type(() => Date) @IsDate() expectedUpdatedAt!: Date;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => ConfirmDocumentFieldDto)
  fields!: ConfirmDocumentFieldDto[];
}
