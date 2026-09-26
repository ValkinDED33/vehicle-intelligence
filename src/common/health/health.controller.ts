import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";

import { DatabaseService } from "../database/database.service";
import { OBJECT_STORAGE } from "../object-storage/object-storage.constants";
import { type ObjectStorageProvider } from "../object-storage/object-storage.types";

interface HealthCheckResponse {
  status: "ok";
  services: {
    database: "ok";
    objectStorage: "ok";
  };
  objectStorage: {
    provider: string;
    bucket: string;
  };
}

@Controller("health")
export class HealthController {
  constructor(
    private readonly databaseService: DatabaseService,

    private readonly configService: ConfigService,

    @Inject(OBJECT_STORAGE)
    private readonly objectStorage: ObjectStorageProvider,
  ) {}

  @Get()
  async check(): Promise<HealthCheckResponse> {
    const bucket = this.configService.get<string>("B2_BUCKET");

    if (!bucket) {
      throw new ServiceUnavailableException({
        status: "error",
        service: "object-storage",
        reason: "B2_BUCKET is not configured",
      });
    }

    try {
      await this.databaseService.connection.execute(sql`SELECT 1`);
    } catch {
      throw new ServiceUnavailableException({
        status: "error",
        service: "database",
      });
    }

    try {
      await this.objectStorage.assertAccess({
        bucket,
      });
    } catch {
      throw new ServiceUnavailableException({
        status: "error",
        service: "object-storage",
        provider: this.objectStorage.providerName,
        bucket,
      });
    }

    return {
      status: "ok",

      services: {
        database: "ok",
        objectStorage: "ok",
      },

      objectStorage: {
        provider: this.objectStorage.providerName,

        bucket,
      },
    };
  }
}
