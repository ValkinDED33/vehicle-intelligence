import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import {
  type EnergyEntry,
  type NewEnergyEntry,
  energyEntries,
} from "./schemas/energy-entry.schema";

export interface CreateEnergyEntryData {
  vehicleId: string;

  kind: string;
  energyType: string;

  volumeLiters?: string;
  energyKwh?: string;

  unitPrice?: string;

  subtotalCost?: string;
  discountPercent?: string;
  discountAmount?: string;
  discountLabel?: string;

  totalCost?: string;
  currency?: string;

  odometerKm?: number;

  isFullTank?: boolean;

  providerName?: string;
  source?: string;

  occurredAt?: Date;
}

export interface EnergyHistoryQuery {
  from?: Date;
  to?: Date;
  energyType?: string;
  kind?: string;
}

@Injectable()
export class EnergyDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createEntry(data: CreateEnergyEntryData): Promise<EnergyEntry> {
    const newEntry: NewEnergyEntry = {
      vehicleId: data.vehicleId,

      kind: data.kind.trim().toLowerCase(),
      energyType: data.energyType.trim().toLowerCase(),

      volumeLiters: data.volumeLiters ?? null,

      energyKwh: data.energyKwh ?? null,

      unitPrice: data.unitPrice ?? null,

      subtotalCost: data.subtotalCost ?? null,

      discountPercent: data.discountPercent ?? null,

      discountAmount: data.discountAmount ?? null,

      discountLabel: data.discountLabel?.trim() || null,

      totalCost: data.totalCost ?? null,

      currency: data.currency?.trim().toUpperCase() || null,

      odometerKm: data.odometerKm ?? null,

      isFullTank: data.isFullTank ?? false,

      providerName: data.providerName?.trim() || null,

      source: data.source ?? "manual",

      occurredAt: data.occurredAt ?? new Date(),
    };

    const [createdEntry] = await this.databaseService.connection
      .insert(energyEntries)
      .values(newEntry)
      .returning();

    if (!createdEntry) {
      throw new Error("Failed to persist energy entry");
    }

    return createdEntry;
  }

  async findByIdForVehicle(
    vehicleId: string,
    entryId: string,
  ): Promise<EnergyEntry | null> {
    const [entry] = await this.databaseService.connection
      .select()
      .from(energyEntries)
      .where(
        and(
          eq(energyEntries.id, entryId),
          eq(energyEntries.vehicleId, vehicleId),
        ),
      )
      .limit(1);

    return entry ?? null;
  }

  async getLatestForVehicle(vehicleId: string): Promise<EnergyEntry | null> {
    const [entry] = await this.databaseService.connection
      .select()
      .from(energyEntries)
      .where(eq(energyEntries.vehicleId, vehicleId))
      .orderBy(desc(energyEntries.occurredAt), desc(energyEntries.createdAt))
      .limit(1);

    return entry ?? null;
  }

  async listForVehicle(
    vehicleId: string,
    query: EnergyHistoryQuery = {},
  ): Promise<EnergyEntry[]> {
    const conditions = [eq(energyEntries.vehicleId, vehicleId)];

    if (query.from) {
      conditions.push(gte(energyEntries.occurredAt, query.from));
    }

    if (query.to) {
      conditions.push(lte(energyEntries.occurredAt, query.to));
    }

    if (query.energyType) {
      conditions.push(
        eq(energyEntries.energyType, query.energyType.trim().toLowerCase()),
      );
    }

    if (query.kind) {
      conditions.push(eq(energyEntries.kind, query.kind.trim().toLowerCase()));
    }

    return this.databaseService.connection
      .select()
      .from(energyEntries)
      .where(and(...conditions))
      .orderBy(desc(energyEntries.occurredAt), desc(energyEntries.createdAt));
  }

  async listFullTankFuelEntries(vehicleId: string): Promise<EnergyEntry[]> {
    return this.databaseService.connection
      .select()
      .from(energyEntries)
      .where(
        and(
          eq(energyEntries.vehicleId, vehicleId),
          eq(energyEntries.kind, "fuel"),
          eq(energyEntries.isFullTank, true),
        ),
      )
      .orderBy(asc(energyEntries.occurredAt), asc(energyEntries.createdAt));
  }
}
