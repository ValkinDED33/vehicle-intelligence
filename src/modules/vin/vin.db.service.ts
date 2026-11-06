import { Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import {
  type NewVinDecode,
  type VinDecode,
  vinDecodes,
} from "./schemas/vin-decode.schema";
import { type VinDecodeResult } from "./providers/vin-provider.interface";
import { standaloneVinChecks } from "./schemas/standalone-vin-check.schema";

@Injectable()
export class VinDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async saveStandalone(ownerId: string, vin: string, result: VinDecodeResult, status = "success"): Promise<void> {
    await this.databaseService.connection.insert(standaloneVinChecks).values({ ownerId, vin, result, status });
  }

  listStandalone(ownerId: string) {
    return this.databaseService.connection.select({ id: standaloneVinChecks.id, vin: standaloneVinChecks.vin, status: standaloneVinChecks.status, result: standaloneVinChecks.result, createdAt: standaloneVinChecks.createdAt })
      .from(standaloneVinChecks).where(eq(standaloneVinChecks.ownerId, ownerId)).orderBy(desc(standaloneVinChecks.createdAt));
  }

  async saveDecodeResult(data: {
    vehicleId: string;
    vin: string;
    result: VinDecodeResult;
    status?: "success" | "no-data";
  }): Promise<VinDecode> {
    const newDecode: NewVinDecode = {
      vehicleId: data.vehicleId,
      vin: data.vin.trim().toUpperCase(),
      provider: data.result.provider,
      status: data.status ?? "success",

      make: data.result.make?.trim() || null,
      model: data.result.model?.trim() || null,
      modelYear: data.result.modelYear ?? null,

      engineCode: data.result.engineCode?.trim() || null,
      engineFamily: data.result.engineFamily?.trim() || null,
      displacementCc: data.result.displacementCc ?? null,

      fuelType: data.result.fuelType?.trim().toLowerCase() || null,
      transmissionType:
        data.result.transmissionType?.trim().toLowerCase() || null,
      driveType: data.result.driveType?.trim().toLowerCase() || null,

      rawPayload: data.result.rawPayload ?? null,
    };

    const [createdDecode] = await this.databaseService.connection
      .insert(vinDecodes)
      .values(newDecode)
      .returning();

    if (!createdDecode) {
      throw new Error("Failed to persist VIN decode result");
    }

    return createdDecode;
  }

  async findLatestForVehicle(vehicleId: string): Promise<VinDecode | null> {
    const [decode] = await this.databaseService.connection
      .select()
      .from(vinDecodes)
      .where(eq(vinDecodes.vehicleId, vehicleId))
      .orderBy(desc(vinDecodes.decodedAt))
      .limit(1);

    return decode ?? null;
  }

  async listForVehicle(vehicleId: string): Promise<VinDecode[]> {
    return this.databaseService.connection
      .select()
      .from(vinDecodes)
      .where(eq(vinDecodes.vehicleId, vehicleId))
      .orderBy(desc(vinDecodes.decodedAt));
  }
}
