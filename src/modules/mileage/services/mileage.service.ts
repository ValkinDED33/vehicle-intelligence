import { BadRequestException, Injectable } from "@nestjs/common";

import { GarageService } from "../../garage/services/garage.service";
import { VehicleHistoryService } from "../../vehicle-history/services/vehicle-history.service";
import { type MileageReading } from "../schemas/mileage-reading.schema";
import {
  type MileageHistoryQuery,
  MileageDbService,
} from "../mileage.db.service";

export interface RecordMileageInput {
  odometerKm: number;
  engineHours?: number;
  source?: string;
  confidence?: number;
  recordedAt?: Date;
}

@Injectable()
export class MileageService {
  constructor(
    private readonly garageService: GarageService,
    private readonly mileageDbService: MileageDbService,
    private readonly vehicleHistoryService: VehicleHistoryService,
  ) {}

  async recordReading(
    ownerId: string,
    vehicleId: string,
    input: RecordMileageInput,
  ): Promise<MileageReading> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    if (input.recordedAt && input.recordedAt.getTime() > Date.now() + 60_000) {
      throw new BadRequestException("recordedAt не может быть в будущем");
    }

    const reading = await this.mileageDbService.createReadingGuarded({
      vehicleId,
      odometerKm: input.odometerKm,
      engineHours: input.engineHours,
      source: input.source ?? "manual",
      confidence: input.confidence ?? 1,
      recordedAt: input.recordedAt,
    });

    await this.vehicleHistoryService.recordEvent(ownerId, vehicleId, {
      type: "vehicle.mileage_updated",
      sourceModule: "mileage",
      origin: this.mapSourceToOrigin(input.source ?? "manual"),
      mileageKm: reading.odometerKm,
      confidence: reading.confidence,
      occurredAt: reading.recordedAt,
      payload: {
        readingId: reading.id,
        odometerKm: reading.odometerKm,
        engineHours: reading.engineHours,
        source: reading.source,
      },
    });

    return reading;
  }

  async getLatestReading(
    ownerId: string,
    vehicleId: string,
  ): Promise<MileageReading | null> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.mileageDbService.getLatest(vehicleId);
  }

  async getHistory(
    ownerId: string,
    vehicleId: string,
    query: MileageHistoryQuery = {},
  ): Promise<MileageReading[]> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.mileageDbService.listForVehicle(vehicleId, query);
  }

  async isStale(
    ownerId: string,
    vehicleId: string,
    staleAfterDays = 30,
  ): Promise<boolean> {
    const latest = await this.getLatestReading(ownerId, vehicleId);

    if (!latest) {
      return true;
    }

    const staleAfterMs = staleAfterDays * 24 * 60 * 60 * 1000;

    return Date.now() - latest.recordedAt.getTime() > staleAfterMs;
  }

  private mapSourceToOrigin(
    source: string,
  ): "telegram" | "web" | "ocr" | "ai-inferred" | "system" {
    if (source.startsWith("vdb:")) {
      return "system";
    }

    switch (source) {
      case "telegram":
        return "telegram";

      case "ocr":
      case "document":
        return "ocr";

      case "ai":
      case "ai-inferred":
        return "ai-inferred";

      case "system":
      case "obd":
      case "service":
        return "system";

      case "manual":
      case "web":
      default:
        return "web";
    }
  }
}
