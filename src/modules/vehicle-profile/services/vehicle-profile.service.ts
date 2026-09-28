import { BadRequestException, Injectable } from "@nestjs/common";

import { GarageService } from "../../garage/services/garage.service";
import { CreateVehicleProfileDto } from "../dto/create-vehicle-profile.dto";
import { type VehicleProfile } from "../schemas/vehicle-profile.schema";
import {
  VEHICLE_PROFILE_BATTERY_CAPACITY_ERROR,
  VehicleProfileDbService,
} from "../vehicle-profile.db.service";

@Injectable()
export class VehicleProfileService {
  constructor(
    private readonly garageService: GarageService,
    private readonly vehicleProfileDbService: VehicleProfileDbService,
  ) {}

  async getCurrentProfile(
    ownerId: string,
    vehicleId: string,
  ): Promise<VehicleProfile | null> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.vehicleProfileDbService.findCurrent(vehicleId);
  }

  async getProfileHistory(
    ownerId: string,
    vehicleId: string,
  ): Promise<VehicleProfile[]> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.vehicleProfileDbService.listVersions(vehicleId);
  }

  async createProfileVersion(
    ownerId: string,
    vehicleId: string,
    dto: CreateVehicleProfileDto,
  ): Promise<VehicleProfile> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        "At least one vehicle profile field is required",
      );
    }

    try {
      return await this.vehicleProfileDbService.createVersion({
        vehicleId,
        source: dto.source ?? "manual",

        engineCode: dto.engineCode,
        engineFamily: dto.engineFamily,
        displacementCc: dto.displacementCc,

        fuelType: dto.fuelType,
        aspirationType: dto.aspirationType,

        powerKw: dto.powerKw,
        powerHp: dto.powerHp,

        transmissionType: dto.transmissionType,
        transmissionCode: dto.transmissionCode,

        driveType: dto.driveType,

        bodyType: dto.bodyType,
        doorCount: dto.doorCount,
        seatCount: dto.seatCount,
        trimLevel: dto.trimLevel,
        exteriorColor: dto.exteriorColor,

        fuelTankCapacityLiters: dto.fuelTankCapacityLiters,
        adBlueTankCapacityLiters: dto.adBlueTankCapacityLiters,

        batteryGrossCapacityKwh: dto.batteryGrossCapacityKwh,
        batteryUsableCapacityKwh: dto.batteryUsableCapacityKwh,

        confirmedAt: dto.source?.startsWith("manual") ? new Date() : undefined,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === VEHICLE_PROFILE_BATTERY_CAPACITY_ERROR
      ) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }
}
