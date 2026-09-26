import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { ConfirmDocumentUploadDto } from "../dto/confirm-document-upload.dto";
import { CreateDocumentDto } from "../dto/create-document.dto";
import { CreateDocumentUploadDto } from "../dto/create-document-upload.dto";
import { DocumentHistoryQueryDto } from "../dto/document-history-query.dto";
import { DocumentProcessingService } from "../services/document-processing.service";
import { DocumentsService } from "../services/documents.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("vehicles/:vehicleId/documents")
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentProcessingService: DocumentProcessingService,
  ) {}

  @Post()
  createDocument(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.documentsService.createDocument(request.userId, vehicleId, {
      type: dto.type,

      title: dto.title,
      description: dto.description,

      documentNumber: dto.documentNumber,

      issuerName: dto.issuerName,

      issuedAt: dto.issuedAt,

      expiresAt: dto.expiresAt,

      source: dto.source,

      fields: dto.fields?.map((field) => ({
        fieldKey: field.fieldKey,

        fieldLabel: field.fieldLabel,

        valueType: field.valueType,

        valueText: field.valueText,

        valueNumber: field.valueNumber,

        valueJson: field.valueJson,

        confidence: field.confidence,

        source: field.source,
      })),
    });
  }

  @Post(":documentId/upload")
  createUploadTarget(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Param("documentId") documentId: string,
    @Body() dto: CreateDocumentUploadDto,
  ) {
    return this.documentsService.createUploadTarget(
      request.userId,
      vehicleId,
      documentId,
      {
        originalFileName: dto.originalFileName,

        mimeType: dto.mimeType,

        fileSizeBytes: dto.fileSizeBytes,
      },
    );
  }

  @Post(":documentId/confirm")
  confirmUpload(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Param("documentId") documentId: string,
    @Body() dto: ConfirmDocumentUploadDto,
  ) {
    return this.documentsService.confirmUpload(
      request.userId,
      vehicleId,
      documentId,
      {
        bucket: dto.bucket,

        key: dto.key,

        originalFileName: dto.originalFileName,
      },
    );
  }

  @Post(":documentId/process")
  async processDocument(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Param("documentId") documentId: string,
  ) {
    // Ownership проверяем через основной DocumentsService.
    // Нельзя разрешать AI-processing только потому,
    // что пользователь знает чужие vehicleId/documentId.
    await this.documentsService.getDocument(
      request.userId,
      vehicleId,
      documentId,
    );

    return this.documentProcessingService.processDocument(
      vehicleId,
      documentId,
    );
  }

  @Get(":documentId/download")
  createDownloadTarget(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documentsService.createDownloadTarget(
      request.userId,
      vehicleId,
      documentId,
    );
  }

  @Get(":documentId")
  getDocument(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documentsService.getDocument(
      request.userId,
      vehicleId,
      documentId,
    );
  }

  @Get()
  getHistory(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query() query: DocumentHistoryQueryDto,
  ) {
    return this.documentsService.getHistory(request.userId, vehicleId, {
      type: query.type,

      issuedFrom: query.issuedFrom,

      issuedTo: query.issuedTo,

      expiresFrom: query.expiresFrom,

      expiresTo: query.expiresTo,

      processingStatus: query.processingStatus,

      limit: query.limit,
      offset: query.offset,
    });
  }

  @Delete(":documentId")
  deleteDocument(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.documentsService.deleteDocument(
      request.userId,
      vehicleId,
      documentId,
    );
  }
}
