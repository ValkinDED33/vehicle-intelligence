import { BadRequestException, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte, max, sql } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import { resolvePagination } from "../../common/dto/pagination-query.dto";
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
  limit?: number;
  offset?: number;
}

const CHRONOLOGICAL_READ_LIMIT = 1000;

@Injectable()
export class MileageDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createReadingGuarded(
    data: CreateMileageReadingData,
  ): Promise<MileageReading> {
    return this.databaseService.connection.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${data.vehicleId}))`,
      );

      // External historical imports (vdb:*) are treated as evidence, not as
      // trusted current input: a lower-than-max odometer there is a potential
      // rollback we must STORE so anomaly detection can flag it, not reject.
      const enforceMonotonic = !(data.source ?? "manual").startsWith("vdb:");

      const [bounds] = await tx
        .select({
          maxOdometerKm: max(mileageReadings.odometerKm),
          maxEngineHours: max(mileageReadings.engineHours),
        })
        .from(mileageReadings)
        .where(eq(mileageReadings.vehicleId, data.vehicleId));

      const maxOdometerKm = bounds?.maxOdometerKm;
      const maxEngineHours = bounds?.maxEngineHours;

      if (
        enforceMonotonic &&
        maxOdometerKm !== null &&
        maxOdometerKm !== undefined
      ) {
        const maxKm =
          typeof maxOdometerKm === "string"
            ? Number(maxOdometerKm)
            : maxOdometerKm;

        if (data.odometerKm < maxKm) {
          throw new BadRequestException(
            `Новий пробіг (${data.odometerKm} км) менший за максимальний збережений (${maxKm} км)`,
          );
        }
      }

      if (
        enforceMonotonic &&
        data.engineHours !== undefined &&
        maxEngineHours !== null &&
        maxEngineHours !== undefined
      ) {
        const maxHours =
          typeof maxEngineHours === "string"
            ? Number(maxEngineHours)
            : maxEngineHours;

        if (data.engineHours < maxHours) {
          throw new BadRequestException(
            `Нові мотогодини (${data.engineHours}) менші за максимальне збережене значення (${maxHours})`,
          );
        }
      }

      const newReading: NewMileageReading = {
        vehicleId: data.vehicleId,
        odometerKm: data.odometerKm,
        engineHours: data.engineHours ?? null,
        source: data.source ?? "manual",
        confidence: data.confidence ?? 1,
        recordedAt: data.recordedAt ?? new Date(),
      };

      const [createdReading] = await tx
        .insert(mileageReadings)
        .values(newReading)
        .returning();

      if (!createdReading) {
        throw new Error("Failed to persist mileage reading");
      }

      return createdReading;
    });
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

  /**
   * All readings in chronological order (oldest first) for anomaly analysis.
   * Bounded to the most recent {@link CHRONOLOGICAL_READ_LIMIT} rows.
   */
  async listChronological(vehicleId: string): Promise<MileageReading[]> {
    return this.databaseService.connection
      .select()
      .from(mileageReadings)
      .where(eq(mileageReadings.vehicleId, vehicleId))
      .orderBy(
        desc(mileageReadings.recordedAt),
        desc(mileageReadings.createdAt),
      )
      .limit(CHRONOLOGICAL_READ_LIMIT)
      .then((rows) => rows.reverse());
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
      )
      .limit(resolvePagination(query).limit)
      .offset(resolvePagination(query).offset);
  }
}
