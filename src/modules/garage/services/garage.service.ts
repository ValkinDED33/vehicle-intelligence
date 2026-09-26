import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { GarageDbService, type UpdateVehicleData } from "../garage.db.service";
import { type Vehicle } from "../schemas/vehicle.schema";

@Injectable()
export class GarageService {
  constructor(private readonly garageDbService: GarageDbService) {}

  async getVehicles(
    ownerId: string,
    includeArchived = false,
  ): Promise<Vehicle[]> {
    return this.garageDbService.listForOwner(ownerId, includeArchived);
  }

  async getVehicle(ownerId: string, vehicleId: string): Promise<Vehicle> {
    const vehicle = await this.garageDbService.findByIdForOwner(
      vehicleId,
      ownerId,
    );

    if (!vehicle) {
      throw new NotFoundException("Автомобиль не найден");
    }

    return vehicle;
  }

  async createVehicle(
    ownerId: string,
    data: {
      vin?: string;
      nickname?: string;
      make?: string;
      model?: string;
      modelYear?: string;
      licensePlate?: string;
      country?: string;
    },
  ): Promise<Vehicle> {
    return this.garageDbService.createVehicle({
      ownerId,
      ...data,
    });
  }

  async updateVehicle(
    ownerId: string,
    vehicleId: string,
    data: UpdateVehicleData,
  ): Promise<Vehicle> {
    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        "Необходимо передать хотя бы одно поле для обновления",
      );
    }

    const vehicle = await this.garageDbService.updateVehicle(
      vehicleId,
      ownerId,
      data,
    );

    if (!vehicle) {
      throw new NotFoundException("Автомобиль не найден");
    }

    return vehicle;
  }

  async archiveVehicle(ownerId: string, vehicleId: string): Promise<Vehicle> {
    const vehicle = await this.garageDbService.archiveVehicle(
      vehicleId,
      ownerId,
    );

    if (!vehicle) {
      throw new NotFoundException("Автомобиль не найден");
    }

    return vehicle;
  }

  async restoreVehicle(ownerId: string, vehicleId: string): Promise<Vehicle> {
    const vehicle = await this.garageDbService.restoreVehicle(
      vehicleId,
      ownerId,
    );

    if (!vehicle) {
      throw new NotFoundException("Автомобиль не найден");
    }

    return vehicle;
  }
}
