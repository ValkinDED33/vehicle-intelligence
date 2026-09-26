import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";

import { ObjectStorageModule } from "../../common/object-storage/object-storage.module";
import { GarageModule } from "../garage/garage.module";

import { DocumentsController } from "./controllers/documents.controller";
import { DocumentsDbService } from "./documents.db.service";
import { DocumentFieldsRepository } from "./repositories/document-fields.repository";
import { DocumentRepository } from "./repositories/document.repository";
import { DocumentAnalysisFieldNormalizerService } from "./services/document-analysis-field-normalizer.service";
import { DocumentAnalysisJsonParserService } from "./services/document-analysis-json-parser.service";
import { DocumentAnalysisNormalizerService } from "./services/document-analysis-normalizer.service";
import { DocumentAnalysisParserService } from "./services/document-analysis-parser.service";
import { DocumentAnalysisPromptService } from "./services/document-analysis-prompt.service";
import { DocumentAnalysisService } from "./services/document-analysis.service";
import { DocumentFieldCanonicalizerService } from "./services/document-field-canonicalizer.service";
import { DocumentFieldMapperService } from "./services/document-field-mapper.service";
import { DocumentProcessingService } from "./services/document-processing.service";
import { DocumentStorageService } from "./services/document-storage.service";
import { DocumentValidatorService } from "./services/document-validator.service";
import { DocumentVisionService } from "./services/document-vision.service";
import { DocumentsService } from "./services/documents.service";
import { PdfRendererService } from "./services/pdf-renderer.service";

@Module({
  imports: [
    GarageModule,
    ObjectStorageModule,

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const jwtSecret = configService.get<string>("JWT_SECRET");

        if (!jwtSecret) {
          throw new Error("JWT_SECRET environment variable is required");
        }

        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: "7d",
          },
        };
      },
    }),
  ],

  controllers: [DocumentsController],

  providers: [
    DocumentRepository,
    DocumentFieldsRepository,

    DocumentsDbService,

    DocumentStorageService,
    PdfRendererService,

    DocumentValidatorService,
    DocumentFieldMapperService,

    DocumentFieldCanonicalizerService,
    DocumentAnalysisJsonParserService,
    DocumentAnalysisFieldNormalizerService,
    DocumentAnalysisNormalizerService,
    DocumentAnalysisParserService,
    DocumentAnalysisPromptService,
    DocumentVisionService,
    DocumentAnalysisService,
    DocumentProcessingService,

    DocumentsService,
  ],

  exports: [DocumentsService, DocumentProcessingService],
})
export class DocumentsModule {}
