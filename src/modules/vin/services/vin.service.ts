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
import { VinAccessService } from "../../vin-access/vin-access.service";
import { VehicleDatabasesNoRecordsError } from "../../../common/vehicle-databases/vehicle-databases-client.service";
import { mapVincarioResponse } from "../providers/vincario/vincario.mapper";

type ResolvedVinDecode = VinDecode & Pick<Partial<VinDecodeResult>, "powerKw" | "powerHp" | "bodyType" | "exteriorColor">;

@Injectable()
export class VinService {
  constructor(
    private readonly garageService: GarageService,
    private readonly vehicleProfileService: VehicleProfileService,
    private readonly vinDbService: VinDbService,

    @Inject(VIN_PROVIDER_TOKEN)
    private readonly vinProvider: VinProvider,
    private readonly access: VinAccessService,
  ) {}

  ensureAccess(ownerId: string) { return this.access.ensureAvailable(ownerId); }
  getAccessStatus(ownerId: string) { return this.access.status(ownerId); }
  async getStandaloneChecks(ownerId: string) {
    return (await this.vinDbService.listStandalone(ownerId)).map(check => {
      if (check.result.provider !== "vincario") return check;
      const mapped = mapVincarioResponse(check.result.rawPayload ?? {});
      return { ...check, result: { ...mapped, ...check.result, fuelType: check.result.fuelType ?? mapped.fuelType, rawPayload: mapped.rawPayload } };
    });
  }

  async decodeVehicleVin(
    ownerId: string,
    vehicleId: string,
  ): Promise<VinDecode> {
    const vehicle = await this.garageService.getVehicle(ownerId, vehicleId);

    const vin = vehicle.vin?.trim().toUpperCase();

    if (!vin) {
      throw new BadRequestException("В автомобіля не вказано VIN");
    }

    return this.access.run(ownerId, "vin-decode", vin, async () => {
      let result: VinDecodeResult;
      try { result = await this.vinProvider.decode(vin); }
      catch (error) {
        if (error instanceof VehicleDatabasesNoRecordsError) {
          await this.vinDbService.saveDecodeResult({ vehicleId, vin, status: "no-data", result: { provider: "vehicle-databases", rawPayload: { status: "no-data" } } });
        }
        throw error;
      }
      await this.updateVehicleIdentityFromDecode(ownerId, vehicleId, vehicle, result);
      await this.createVehicleProfileFromDecode(ownerId, vehicleId, result);
      return this.vinDbService.saveDecodeResult({ vehicleId, vin, result });
    });
  }

  async decodeStandaloneVin(
    ownerId: string,
    vin: string,
  ): Promise<VinDecodeResult> {
    const normalizedVin = vin.trim().toUpperCase();

    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalizedVin)) {
      throw new BadRequestException("Некоректний VIN");
    }

    return this.access.run(ownerId, "vin-decode", normalizedVin, async () => {
      let result: VinDecodeResult;
      try { result = await this.vinProvider.decode(normalizedVin); }
      catch (error) {
        if (error instanceof VehicleDatabasesNoRecordsError) {
          await this.vinDbService.saveStandalone(ownerId, normalizedVin, { provider: "vehicle-databases", rawPayload: { status: "no-data" } }, "no-data");
        }
        throw error;
      }
      await this.vinDbService.saveStandalone(ownerId, normalizedVin, result);
      return result;
    });
  }

  async getLatestDecode(
    ownerId: string,
    vehicleId: string,
  ): Promise<ResolvedVinDecode | null> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    const row = await this.vinDbService.findLatestForVehicle(vehicleId);
    return row ? this.publicDecode(row) : null;
  }

  async getDecodeHistory(
    ownerId: string,
    vehicleId: string,
  ): Promise<ResolvedVinDecode[]> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return (await this.vinDbService.listForVehicle(vehicleId)).map(row => this.publicDecode(row));
  }

  private publicDecode(row: VinDecode): ResolvedVinDecode {
    if (row.provider !== "vincario") return row;
    const mapped = mapVincarioResponse(row.rawPayload ?? {});
    return { ...mapped, ...row, fuelType: row.fuelType ?? mapped.fuelType ?? null, rawPayload: mapped.rawPayload ?? null };
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
      powerKw: result.powerKw,
      powerHp: result.powerHp,
      fuelType: result.fuelType,
      transmissionType: result.transmissionType,
      driveType: result.driveType,
      bodyType: result.bodyType,
      exteriorColor: result.exteriorColor,
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
