import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { GarageService } from "../../garage/services/garage.service";
import { type Vehicle } from "../../garage/schemas/vehicle.schema";
import { VehicleProfileService } from "../../vehicle-profile/services/vehicle-profile.service";
import {
  VIN_PROVIDER_TOKEN,
  type VinDecodeResult,
  type VinProvider,
} from "../providers/vin-provider.interface";
import { type VinDecode } from "../schemas/vin-decode.schema";
import { VinDbService } from "../vin.db.service";

@Injectable()
export class VinService {
  constructor(
    private readonly garageService: GarageService,
    private readonly vehicleProfileService: VehicleProfileService,
    private readonly vinDbService: VinDbService,

    @Inject(VIN_PROVIDER_TOKEN)
    private readonly vinProvider: VinProvider,
  ) {}

  async decodeVehicleVin(
    ownerId: string,
    vehicleId: string,
  ): Promise<VinDecode> {
    const vehicle = await this.garageService.getVehicle(ownerId, vehicleId);

    const vin = vehicle.vin?.trim().toUpperCase();

    if (!vin) {
      throw new BadRequestException("У автомобиля не указан VIN");
    }

    const result = await this.vinProvider.decode(vin);

    await this.updateVehicleIdentityFromDecode(
      ownerId,
      vehicleId,
      vehicle,
      result,
    );

    await this.createVehicleProfileFromDecode(ownerId, vehicleId, result);

    return this.vinDbService.saveDecodeResult({
      vehicleId,
      vin,
      result,
    });
  }

  async getLatestDecode(
    ownerId: string,
    vehicleId: string,
  ): Promise<VinDecode | null> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.vinDbService.findLatestForVehicle(vehicleId);
  }

  async getDecodeHistory(
    ownerId: string,
    vehicleId: string,
  ): Promise<VinDecode[]> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.vinDbService.listForVehicle(vehicleId);
  }

  private async updateVehicleIdentityFromDecode(
    ownerId: string,
    vehicleId: string,
    vehicle: Vehicle,
    result: VinDecodeResult,
  ): Promise<void> {
    const updates: {
      make?: string;
      model?: string;
      modelYear?: string;
    } = {};

    if (!vehicle.make && result.make) {
      updates.make = result.make;
    }

    if (!vehicle.model && result.model) {
      updates.model = result.model;
    }

    if (!vehicle.modelYear && result.modelYear !== undefined) {
      updates.modelYear = String(result.modelYear);
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    await this.garageService.updateVehicle(ownerId, vehicleId, updates);
  }

  private async createVehicleProfileFromDecode(
    ownerId: string,
    vehicleId: string,
    result: VinDecodeResult,
  ): Promise<void> {
    const profileData = {
      engineCode: result.engineCode,
      engineFamily: result.engineFamily,
      displacementCc: result.displacementCc,
      fuelType: result.fuelType,
      transmissionType: result.transmissionType,
      driveType: result.driveType,
    };

    const hasProfileData = Object.values(profileData).some(
      (value) => value !== undefined && value !== null,
    );

    if (!hasProfileData) {
      return;
    }

    await this.vehicleProfileService.createProfileVersion(ownerId, vehicleId, {
      source: `vin:${result.provider}`,
      ...profileData,
    });
  }
}
