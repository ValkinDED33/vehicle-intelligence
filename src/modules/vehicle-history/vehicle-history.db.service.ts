import { Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import { resolvePagination } from "../../common/dto/pagination-query.dto";
import {
  type NewVehicleHistoryEvent,
  type VehicleHistoryEvent,
  vehicleHistoryEvents,
} from "./schemas/vehicle-history-event.schema";

export interface CreateVehicleHistoryEventData {
  eventId: string;
  vehicleId: string;
  type: string;
  sourceModule: string;
  origin: string;
  mileageKm?: number;
  confidence?: number;
  payload: Record<string, unknown>;
  attachments?: string[];
  occurredAt: Date;
}

export interface VehicleHistoryQuery {
  type?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class VehicleHistoryDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createEvent(
    data: CreateVehicleHistoryEventData,
  ): Promise<VehicleHistoryEvent> {
    const newEvent: NewVehicleHistoryEvent = {
      eventId: data.eventId,
      vehicleId: data.vehicleId,
      type: data.type,
      sourceModule: data.sourceModule,
      origin: data.origin,
      mileageKm: data.mileageKm ?? null,
      confidence: data.confidence ?? 1,
      payload: data.payload,
      attachments: data.attachments ?? null,
      occurredAt: data.occurredAt,
    };

    const [createdEvent] = await this.databaseService.connection
      .insert(vehicleHistoryEvents)
      .values(newEvent)
      .returning();

    if (!createdEvent) {
      throw new Error("Failed to persist vehicle history event");
    }

    return createdEvent;
  }

  async findByEventId(eventId: string): Promise<VehicleHistoryEvent | null> {
    const [event] = await this.databaseService.connection
      .select()
      .from(vehicleHistoryEvents)
      .where(eq(vehicleHistoryEvents.eventId, eventId))
      .limit(1);

    return event ?? null;
  }

  async listForVehicle(
    vehicleId: string,
    query: VehicleHistoryQuery = {},
  ): Promise<VehicleHistoryEvent[]> {
    const conditions = [eq(vehicleHistoryEvents.vehicleId, vehicleId)];

    if (query.type) {
      conditions.push(eq(vehicleHistoryEvents.type, query.type));
    }

    if (query.from) {
      conditions.push(gte(vehicleHistoryEvents.occurredAt, query.from));
    }

    if (query.to) {
      conditions.push(lte(vehicleHistoryEvents.occurredAt, query.to));
    }

    return this.databaseService.connection
      .select()
      .from(vehicleHistoryEvents)
      .where(and(...conditions))
      .orderBy(desc(vehicleHistoryEvents.occurredAt))
      .limit(resolvePagination(query).limit)
      .offset(resolvePagination(query).offset);
  }

  async getLatestForVehicle(
    vehicleId: string,
    type?: string,
  ): Promise<VehicleHistoryEvent | null> {
    const conditions = [eq(vehicleHistoryEvents.vehicleId, vehicleId)];

    if (type) {
      conditions.push(eq(vehicleHistoryEvents.type, type));
    }

    const [event] = await this.databaseService.connection
      .select()
      .from(vehicleHistoryEvents)
      .where(and(...conditions))
      .orderBy(desc(vehicleHistoryEvents.occurredAt))
      .limit(1);

    return event ?? null;
  }
}
