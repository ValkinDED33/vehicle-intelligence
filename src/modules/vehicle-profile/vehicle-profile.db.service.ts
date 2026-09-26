import { Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import {
  type NewVehicleProfile,
  type VehicleProfile,
  vehicleProfiles,
} from "./schemas/vehicle-profile.schema";

export const VEHICLE_PROFILE_BATTERY_CAPACITY_ERROR =
  "VEHICLE_PROFILE_BATTERY_CAPACITY_INVALID";

export interface CreateVehicleProfileData {
  vehicleId: string;
  source?: string;

  engineCode?: string;
  engineFamily?: string;
  displacementCc?: number;

  fuelType?: string;
  aspirationType?: string;

  powerKw?: number;
  powerHp?: number;

  transmissionType?: string;
  transmissionCode?: string;

  driveType?: string;

  fuelTankCapacityLiters?: number;
  adBlueTankCapacityLiters?: number;

  batteryGrossCapacityKwh?: number;
  batteryUsableCapacityKwh?: number;

  confirmedAt?: Date;
}

@Injectable()
export class VehicleProfileDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findCurrent(vehicleId: string): Promise<VehicleProfile | null> {
    const [profile] = await this.databaseService.connection
      .select()
      .from(vehicleProfiles)
      .where(
        and(
          eq(vehicleProfiles.vehicleId, vehicleId),
          eq(vehicleProfiles.isCurrent, true),
        ),
      )
      .orderBy(desc(vehicleProfiles.version))
      .limit(1);

    return profile ?? null;
  }

  async listVersions(vehicleId: string): Promise<VehicleProfile[]> {
    return this.databaseService.connection
      .select()
      .from(vehicleProfiles)
      .where(eq(vehicleProfiles.vehicleId, vehicleId))
      .orderBy(desc(vehicleProfiles.version));
  }

  async createVersion(data: CreateVehicleProfileData): Promise<VehicleProfile> {
    return this.databaseService.connection.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${data.vehicleId}))`,
      );

      const [latestProfile] = await tx
        .select()
        .from(vehicleProfiles)
        .where(eq(vehicleProfiles.vehicleId, data.vehicleId))
        .orderBy(desc(vehicleProfiles.version))
        .limit(1);

      const nextVersion = (latestProfile?.version ?? 0) + 1;

      const newProfile: NewVehicleProfile = {
        vehicleId: data.vehicleId,
        version: nextVersion,
        isCurrent: true,

        source:
          data.source !== undefined
            ? (this.normalizeText(data.source) ?? "manual")
            : (latestProfile?.source ?? "manual"),

        engineCode:
          data.engineCode !== undefined
            ? this.normalizeText(data.engineCode)
            : (latestProfile?.engineCode ?? null),

        engineFamily:
          data.engineFamily !== undefined
            ? this.normalizeText(data.engineFamily)
            : (latestProfile?.engineFamily ?? null),

        displacementCc:
          data.displacementCc !== undefined
            ? data.displacementCc
            : (latestProfile?.displacementCc ?? null),

        fuelType:
          data.fuelType !== undefined
            ? this.normalizeLowercase(data.fuelType)
            : (latestProfile?.fuelType ?? null),

        aspirationType:
          data.aspirationType !== undefined
            ? this.normalizeLowercase(data.aspirationType)
            : (latestProfile?.aspirationType ?? null),

        powerKw:
          data.powerKw !== undefined
            ? data.powerKw
            : (latestProfile?.powerKw ?? null),

        powerHp:
          data.powerHp !== undefined
            ? data.powerHp
            : (latestProfile?.powerHp ?? null),

        transmissionType:
          data.transmissionType !== undefined
            ? this.normalizeLowercase(data.transmissionType)
            : (latestProfile?.transmissionType ?? null),

        transmissionCode:
          data.transmissionCode !== undefined
            ? this.normalizeText(data.transmissionCode)
            : (latestProfile?.transmissionCode ?? null),

        driveType:
          data.driveType !== undefined
            ? this.normalizeLowercase(data.driveType)
            : (latestProfile?.driveType ?? null),

        fuelTankCapacityLiters:
          data.fuelTankCapacityLiters !== undefined
            ? data.fuelTankCapacityLiters
            : (latestProfile?.fuelTankCapacityLiters ?? null),

        adBlueTankCapacityLiters:
          data.adBlueTankCapacityLiters !== undefined
            ? data.adBlueTankCapacityLiters
            : (latestProfile?.adBlueTankCapacityLiters ?? null),

        batteryGrossCapacityKwh:
          data.batteryGrossCapacityKwh !== undefined
            ? data.batteryGrossCapacityKwh
            : (latestProfile?.batteryGrossCapacityKwh ?? null),

        batteryUsableCapacityKwh:
          data.batteryUsableCapacityKwh !== undefined
            ? data.batteryUsableCapacityKwh
            : (latestProfile?.batteryUsableCapacityKwh ?? null),

        confirmedAt:
          data.confirmedAt !== undefined
            ? data.confirmedAt
            : (latestProfile?.confirmedAt ?? null),
      };

      if (
        newProfile.batteryGrossCapacityKwh != null &&
        newProfile.batteryUsableCapacityKwh != null &&
        newProfile.batteryUsableCapacityKwh > newProfile.batteryGrossCapacityKwh
      ) {
        const error = new Error(
          "batteryUsableCapacityKwh cannot exceed batteryGrossCapacityKwh",
        );

        error.name = VEHICLE_PROFILE_BATTERY_CAPACITY_ERROR;

        throw error;
      }

      await tx
        .update(vehicleProfiles)
        .set({
          isCurrent: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(vehicleProfiles.vehicleId, data.vehicleId),
            eq(vehicleProfiles.isCurrent, true),
          ),
        );

      const [createdProfile] = await tx
        .insert(vehicleProfiles)
        .values(newProfile)
        .returning();

      if (!createdProfile) {
        throw new Error("Failed to create vehicle profile");
      }

      return createdProfile;
    });
  }

  private normalizeText(value: string): string | null {
    return value.trim() || null;
  }

  private normalizeLowercase(value: string): string | null {
    const normalized = value.trim();

    return normalized ? normalized.toLowerCase() : null;
  }
}
