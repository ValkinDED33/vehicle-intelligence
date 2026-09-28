import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";

import { DatabaseService } from "../database/database.service";
import { OBJECT_STORAGE } from "../object-storage/object-storage.constants";
import { type ObjectStorageProvider } from "../object-storage/object-storage.types";

interface HealthCheckResponse {
  status: "ok" | "degraded";
  services: {
    database: "ok";
    objectStorage: "ok" | "not_configured" | "error";
    aiGateway: "configured" | "not_configured";
    vinProvider: "configured" | "not_configured";
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
    let objectStorageStatus: HealthCheckResponse["services"]["objectStorage"] =
      "not_configured";

    try {
      await this.databaseService.connection.execute(sql`SELECT 1`);
    } catch {
      throw new ServiceUnavailableException({
        status: "error",
        service: "database",
      });
    }

    if (bucket) {
      try {
        await this.objectStorage.assertAccess({
          bucket,
        });

        objectStorageStatus = "ok";
      } catch {
        objectStorageStatus = "error";
      }
    }

    const aiGatewayStatus =
      this.configService.get<string>("GROQ_API_KEY") &&
      this.configService.get<string>("GROQ_MODEL") &&
      this.configService.get<string>("GROQ_BASE_URL")
        ? "configured"
        : "not_configured";

    const vinProviderStatus = this.configService.get<string>(
      "VIN_PROVIDER_API_KEY",
    )
      ? "configured"
      : "not_configured";

    const status =
      objectStorageStatus === "ok" &&
      aiGatewayStatus === "configured" &&
      vinProviderStatus === "configured"
        ? "ok"
        : "degraded";

    return {
      status,

      services: {
        database: "ok",
        objectStorage: objectStorageStatus,
        aiGateway: aiGatewayStatus,
        vinProvider: vinProviderStatus,
      },
    };
  }
}
