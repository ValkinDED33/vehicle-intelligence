import { BadRequestException, Injectable } from "@nestjs/common";

import { type CreateDocumentInput } from "../documents.types";

@Injectable()
export class DocumentValidatorService {
  validateCreate(input: CreateDocumentInput): void {
    if (!input.title.trim()) {
      throw new BadRequestException("Document title is required");
    }

    if (input.expiresAt && input.issuedAt && input.expiresAt < input.issuedAt) {
      throw new BadRequestException(
        "Document expiration date cannot be before issue date",
      );
    }

    for (const field of input.fields ?? []) {
      if (!field.fieldKey.trim()) {
        throw new BadRequestException("Document field key is required");
      }

      if (
        field.confidence !== undefined &&
        (field.confidence < 0 || field.confidence > 1)
      ) {
        throw new BadRequestException(
          "Document field confidence must be between 0 and 1",
        );
      }
    }
  }
}
