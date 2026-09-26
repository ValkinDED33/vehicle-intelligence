import { Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import {
  type MileageReading,
  type NewMileageReading,
  mileageReadings,
} from "./schemas/mileage-reading.schema";

export interface CreateMileageReadingData {
  vehicleId: string;
  odometerKm: number;
  engineHours?: number;
  source?: string;
  confidence?: number;
  recordedAt?: Date;
}

export interface MileageHistoryQuery {
  from?: Date;
  to?: Date;
}

@Injectable()
export class MileageDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createReading(data: CreateMileageReadingData): Promise<MileageReading> {
    const newReading: NewMileageReading = {
      vehicleId: data.vehicleId,
      odometerKm: data.odometerKm,
      engineHours: data.engineHours ?? null,
      source: data.source ?? "manual",
      confidence: data.confidence ?? 1,
      recordedAt: data.recordedAt ?? new Date(),
    };

    const [createdReading] = await this.databaseService.connection
      .insert(mileageReadings)
      .values(newReading)
      .returning();

    if (!createdReading) {
      throw new Error("Failed to persist mileage reading");
    }

    return createdReading;
  }

  async getLatest(vehicleId: string): Promise<MileageReading | null> {
    const [reading] = await this.databaseService.connection
      .select()
      .from(mileageReadings)
      .where(eq(mileageReadings.vehicleId, vehicleId))
      .orderBy(
        desc(mileageReadings.recordedAt),
        desc(mileageReadings.createdAt),
      )
      .limit(1);

    return reading ?? null;
  }

  async listForVehicle(
    vehicleId: string,
    query: MileageHistoryQuery = {},
  ): Promise<MileageReading[]> {
    const conditions = [eq(mileageReadings.vehicleId, vehicleId)];

    if (query.from) {
      conditions.push(gte(mileageReadings.recordedAt, query.from));
    }

    if (query.to) {
      conditions.push(lte(mileageReadings.recordedAt, query.to));
    }

    return this.databaseService.connection
      .select()
      .from(mileageReadings)
      .where(and(...conditions))
      .orderBy(
        desc(mileageReadings.recordedAt),
        desc(mileageReadings.createdAt),
      );
  }
}
