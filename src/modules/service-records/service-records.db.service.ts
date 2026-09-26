import { Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import {
  type NewServiceRecordItem,
  type ServiceRecordItem,
  serviceRecordItems,
} from "./schemas/service-record-item.schema";
import {
  type NewServiceRecord,
  type ServiceRecord,
  serviceRecords,
} from "./schemas/service-record.schema";

export interface CreateServiceRecordItemData {
  itemType: string;

  name: string;
  description?: string;

  brand?: string;
  partNumber?: string;

  quantity?: string;
  unit?: string;

  unitCost?: string;
  totalCost?: string;
  currency?: string;

  warrantyMonths?: number;
  warrantyKm?: number;
}

export interface CreateServiceRecordData {
  vehicleId: string;

  expenseId?: string;

  type: string;

  title: string;
  description?: string;

  odometerKm?: number;
  engineHours?: string;

  providerName?: string;
  documentNumber?: string;

  totalCost?: string;
  currency?: string;

  source?: string;
  occurredAt?: Date;

  items?: CreateServiceRecordItemData[];
}

export interface ServiceRecordHistoryQuery {
  from?: Date;
  to?: Date;
  type?: string;
}

export interface ServiceRecordWithItems {
  record: ServiceRecord;
  items: ServiceRecordItem[];
}

@Injectable()
export class ServiceRecordsDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createRecord(
    data: CreateServiceRecordData,
  ): Promise<ServiceRecordWithItems> {
    return this.databaseService.connection.transaction(async (tx) => {
      const newRecord: NewServiceRecord = {
        vehicleId: data.vehicleId,

        expenseId: data.expenseId ?? null,

        type: data.type.trim().toLowerCase(),

        title: data.title.trim(),

        description: data.description?.trim() || null,

        odometerKm: data.odometerKm ?? null,

        engineHours: data.engineHours ?? null,

        providerName: data.providerName?.trim() || null,

        documentNumber: data.documentNumber?.trim() || null,

        totalCost: data.totalCost ?? null,

        currency: data.currency?.trim().toUpperCase() || null,

        source: data.source ?? "manual",

        occurredAt: data.occurredAt ?? new Date(),
      };

      const [record] = await tx
        .insert(serviceRecords)
        .values(newRecord)
        .returning();

      if (!record) {
        throw new Error("Failed to persist service record");
      }

      const itemsData = data.items ?? [];

      if (itemsData.length === 0) {
        return {
          record,
          items: [],
        };
      }

      const newItems: NewServiceRecordItem[] = itemsData.map((item) => ({
        serviceRecordId: record.id,

        itemType: item.itemType.trim().toLowerCase(),

        name: item.name.trim(),

        description: item.description?.trim() || null,

        brand: item.brand?.trim() || null,

        partNumber: item.partNumber?.trim() || null,

        quantity: item.quantity ?? null,

        unit: item.unit?.trim().toLowerCase() || null,

        unitCost: item.unitCost ?? null,

        totalCost: item.totalCost ?? null,

        currency: item.currency?.trim().toUpperCase() || null,

        warrantyMonths: item.warrantyMonths ?? null,

        warrantyKm: item.warrantyKm ?? null,
      }));

      const createdItems = await tx
        .insert(serviceRecordItems)
        .values(newItems)
        .returning();

      if (createdItems.length !== newItems.length) {
        throw new Error("Failed to persist all service record items");
      }

      return {
        record,
        items: createdItems,
      };
    });
  }

  async findByIdForVehicle(
    vehicleId: string,
    recordId: string,
  ): Promise<ServiceRecordWithItems | null> {
    const [record] = await this.databaseService.connection
      .select()
      .from(serviceRecords)
      .where(
        and(
          eq(serviceRecords.id, recordId),
          eq(serviceRecords.vehicleId, vehicleId),
        ),
      )
      .limit(1);

    if (!record) {
      return null;
    }

    const items = await this.databaseService.connection
      .select()
      .from(serviceRecordItems)
      .where(eq(serviceRecordItems.serviceRecordId, record.id));

    return {
      record,
      items,
    };
  }

  async listForVehicle(
    vehicleId: string,
    query: ServiceRecordHistoryQuery = {},
  ): Promise<ServiceRecord[]> {
    const conditions = [eq(serviceRecords.vehicleId, vehicleId)];

    if (query.from) {
      conditions.push(gte(serviceRecords.occurredAt, query.from));
    }

    if (query.to) {
      conditions.push(lte(serviceRecords.occurredAt, query.to));
    }

    if (query.type) {
      conditions.push(eq(serviceRecords.type, query.type.trim().toLowerCase()));
    }

    return this.databaseService.connection
      .select()
      .from(serviceRecords)
      .where(and(...conditions))
      .orderBy(desc(serviceRecords.occurredAt), desc(serviceRecords.createdAt));
  }

  async listItemsForRecord(
    serviceRecordId: string,
  ): Promise<ServiceRecordItem[]> {
    return this.databaseService.connection
      .select()
      .from(serviceRecordItems)
      .where(eq(serviceRecordItems.serviceRecordId, serviceRecordId));
  }

  async findItemsByPartNumber(
    vehicleId: string,
    partNumber: string,
  ): Promise<
    Array<{
      record: ServiceRecord;
      item: ServiceRecordItem;
    }>
  > {
    const rows = await this.databaseService.connection
      .select({
        record: serviceRecords,
        item: serviceRecordItems,
      })
      .from(serviceRecordItems)
      .innerJoin(
        serviceRecords,
        eq(serviceRecordItems.serviceRecordId, serviceRecords.id),
      )
      .where(
        and(
          eq(serviceRecords.vehicleId, vehicleId),
          eq(serviceRecordItems.partNumber, partNumber.trim()),
        ),
      )
      .orderBy(desc(serviceRecords.occurredAt));

    return rows;
  }
}
