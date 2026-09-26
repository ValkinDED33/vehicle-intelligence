import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";

import { GarageService } from "../../garage/services/garage.service";
import { type VehicleHistoryEvent } from "../schemas/vehicle-history-event.schema";
import {
  type VehicleHistoryQuery,
  VehicleHistoryDbService,
} from "../vehicle-history.db.service";

export interface RecordVehicleHistoryEventInput {
  type: string;
  sourceModule: string;
  origin: string;

  mileageKm?: number;
  confidence?: number;

  payload: Record<string, unknown>;
  attachments?: string[];

  occurredAt?: Date;

  /**
   * Позволяет сохранить внешний eventId для идемпотентности.
   */
  eventId?: string;
}

@Injectable()
export class VehicleHistoryService {
  constructor(
    private readonly garageService: GarageService,
    private readonly vehicleHistoryDbService: VehicleHistoryDbService,
  ) {}

  async recordEvent(
    ownerId: string,
    vehicleId: string,
    input: RecordVehicleHistoryEventInput,
  ): Promise<VehicleHistoryEvent> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    const eventId = input.eventId ?? randomUUID();

    const existingEvent =
      await this.vehicleHistoryDbService.findByEventId(eventId);

    if (existingEvent) {
      return existingEvent;
    }

    return this.vehicleHistoryDbService.createEvent({
      eventId,
      vehicleId,
      type: input.type.trim(),
      sourceModule: input.sourceModule.trim(),
      origin: input.origin.trim(),
      mileageKm: input.mileageKm,
      confidence: input.confidence ?? 1,
      payload: input.payload,
      attachments: input.attachments,
      occurredAt: input.occurredAt ?? new Date(),
    });
  }

  async getHistory(
    ownerId: string,
    vehicleId: string,
    query: VehicleHistoryQuery = {},
  ): Promise<VehicleHistoryEvent[]> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.vehicleHistoryDbService.listForVehicle(vehicleId, query);
  }

  async getLatestEvent(
    ownerId: string,
    vehicleId: string,
    type?: string,
  ): Promise<VehicleHistoryEvent | null> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.vehicleHistoryDbService.getLatestForVehicle(vehicleId, type);
  }
}
