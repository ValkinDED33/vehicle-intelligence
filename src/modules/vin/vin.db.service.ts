import { Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import {
  type NewVinDecode,
  type VinDecode,
  vinDecodes,
} from "./schemas/vin-decode.schema";
import { type VinDecodeResult } from "./providers/vin-provider.interface";

@Injectable()
export class VinDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async saveDecodeResult(data: {
    vehicleId: string;
    vin: string;
    result: VinDecodeResult;
  }): Promise<VinDecode> {
    const newDecode: NewVinDecode = {
      vehicleId: data.vehicleId,
      vin: data.vin.trim().toUpperCase(),
      provider: data.result.provider,
      status: "success",

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
