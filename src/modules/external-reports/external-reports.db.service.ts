import { Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import {
  type NewVehicleExternalReport,
  type VehicleExternalReport,
  vehicleExternalReports,
} from "./schemas/vehicle-external-report.schema";

export interface CreateVehicleExternalReportData {
  vehicleId: string;
  provider: string;
  reportType: string;
  vin?: string;
  status: string;
  rawPayload: Record<string, unknown>;
  fetchedAt?: Date;
}

@Injectable()
export class ExternalReportsDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createReport(
    data: CreateVehicleExternalReportData,
  ): Promise<VehicleExternalReport> {
    const newReport: NewVehicleExternalReport = {
      vehicleId: data.vehicleId,
      provider: data.provider,
      reportType: data.reportType,
      vin: data.vin ?? null,
      status: data.status,
      rawPayload: data.rawPayload,
      fetchedAt: data.fetchedAt ?? new Date(),
    };

    const [createdReport] = await this.databaseService.connection
      .insert(vehicleExternalReports)
      .values(newReport)
      .returning();

    if (!createdReport) {
      throw new Error("Failed to persist vehicle external report");
    }

    return createdReport;
  }

  async getLatest(
    vehicleId: string,
    provider: string,
    reportType: string,
  ): Promise<VehicleExternalReport | null> {
    const [report] = await this.databaseService.connection
      .select()
      .from(vehicleExternalReports)
      .where(
        and(
          eq(vehicleExternalReports.vehicleId, vehicleId),
          eq(vehicleExternalReports.provider, provider),
          eq(vehicleExternalReports.reportType, reportType),
        ),
      )
      .orderBy(desc(vehicleExternalReports.fetchedAt))
      .limit(1);

    return report ?? null;
  }

  async listForVehicle(
    vehicleId: string,
    reportType?: string,
  ): Promise<VehicleExternalReport[]> {
    const conditions = [eq(vehicleExternalReports.vehicleId, vehicleId)];

    if (reportType) {
      conditions.push(eq(vehicleExternalReports.reportType, reportType));
    }

    return this.databaseService.connection
      .select()
      .from(vehicleExternalReports)
      .where(and(...conditions))
      .orderBy(desc(vehicleExternalReports.fetchedAt));
  }
}
