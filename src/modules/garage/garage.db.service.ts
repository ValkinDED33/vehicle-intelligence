import { Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import {
  type NewVehicle,
  type Vehicle,
  vehicles,
} from "./schemas/vehicle.schema";

export interface UpdateVehicleData {
  vin?: string;
  nickname?: string;
  make?: string;
  model?: string;
  modelYear?: string;
  licensePlate?: string;
  country?: string;
}

@Injectable()
export class GarageDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByIdForOwner(
    vehicleId: string,
    ownerId: string,
  ): Promise<Vehicle | null> {
    const [vehicle] = await this.databaseService.connection
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, ownerId)))
      .limit(1);

    return vehicle ?? null;
  }

  async listForOwner(
    ownerId: string,
    includeArchived = false,
  ): Promise<Vehicle[]> {
    const condition = includeArchived
      ? eq(vehicles.ownerId, ownerId)
      : and(eq(vehicles.ownerId, ownerId), eq(vehicles.isArchived, false));

    return this.databaseService.connection
      .select()
      .from(vehicles)
      .where(condition)
      .orderBy(asc(vehicles.createdAt));
  }

  async createVehicle(data: {
    ownerId: string;
    vin?: string;
    nickname?: string;
    make?: string;
    model?: string;
    modelYear?: string;
    licensePlate?: string;
    country?: string;
  }): Promise<Vehicle> {
    const newVehicle: NewVehicle = {
      ownerId: data.ownerId,

      vin: this.normalizeUppercase(data.vin),

      nickname: this.normalizeText(data.nickname),

      make: this.normalizeText(data.make),

      model: this.normalizeText(data.model),

      modelYear: this.normalizeText(data.modelYear),

      licensePlate: this.normalizeUppercase(data.licensePlate),

      country: this.normalizeCountry(data.country),
    };

    const [createdVehicle] = await this.databaseService.connection
      .insert(vehicles)
      .values(newVehicle)
      .returning();

    if (!createdVehicle) {
      throw new Error("Failed to create vehicle");
    }

    return createdVehicle;
  }

  async updateVehicle(
    vehicleId: string,
    ownerId: string,
    data: UpdateVehicleData,
  ): Promise<Vehicle | null> {
    const values: Partial<NewVehicle> = {
      updatedAt: new Date(),
    };

    if (data.vin !== undefined) {
      values.vin = this.normalizeUppercase(data.vin);
    }

    if (data.nickname !== undefined) {
      values.nickname = this.normalizeText(data.nickname);
    }

    if (data.make !== undefined) {
      values.make = this.normalizeText(data.make);
    }

    if (data.model !== undefined) {
      values.model = this.normalizeText(data.model);
    }

    if (data.modelYear !== undefined) {
      values.modelYear = this.normalizeText(data.modelYear);
    }

    if (data.licensePlate !== undefined) {
      values.licensePlate = this.normalizeUppercase(data.licensePlate);
    }

    if (data.country !== undefined) {
      values.country = this.normalizeCountry(data.country);
    }

    const [updatedVehicle] = await this.databaseService.connection
      .update(vehicles)
      .set(values)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, ownerId)))
      .returning();

    return updatedVehicle ?? null;
  }

  async archiveVehicle(
    vehicleId: string,
    ownerId: string,
  ): Promise<Vehicle | null> {
    return this.setArchived(vehicleId, ownerId, true);
  }

  async restoreVehicle(
    vehicleId: string,
    ownerId: string,
  ): Promise<Vehicle | null> {
    return this.setArchived(vehicleId, ownerId, false);
  }

  private async setArchived(
    vehicleId: string,
    ownerId: string,
    isArchived: boolean,
  ): Promise<Vehicle | null> {
    const [vehicle] = await this.databaseService.connection
      .update(vehicles)
      .set({
        isArchived,
        updatedAt: new Date(),
      })
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, ownerId)))
      .returning();

    return vehicle ?? null;
  }

  private normalizeText(value?: string): string | null {
    return value?.trim() || null;
  }

  private normalizeUppercase(value?: string): string | null {
    const normalized = value?.trim();

    return normalized ? normalized.toUpperCase() : null;
  }

  private normalizeCountry(value?: string): string {
    const normalized = value?.trim();

    return normalized ? normalized.toUpperCase() : "PL";
  }
}
