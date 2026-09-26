import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import {
  type MaintenanceRule,
  type NewMaintenanceRule,
  maintenanceRules,
} from "./schemas/maintenance-rule.schema";

export interface CreateMaintenanceRuleData {
  vehicleId: string;
  key: string;
  title: string;
  source?: string;

  intervalKm?: number;
  intervalMonths?: number;
  intervalEngineHours?: number;

  warningKmBefore?: number;
  warningDaysBefore?: number;
  warningEngineHoursBefore?: number;

  completionEventType: string;
}

@Injectable()
export class MaintenanceDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createRule(data: CreateMaintenanceRuleData): Promise<MaintenanceRule> {
    const newRule: NewMaintenanceRule = {
      vehicleId: data.vehicleId,
      key: data.key.trim(),
      title: data.title.trim(),
      source: data.source ?? "manual",

      intervalKm: data.intervalKm ?? null,
      intervalMonths: data.intervalMonths ?? null,
      intervalEngineHours: data.intervalEngineHours ?? null,

      warningKmBefore: data.warningKmBefore ?? null,
      warningDaysBefore: data.warningDaysBefore ?? null,
      warningEngineHoursBefore: data.warningEngineHoursBefore ?? null,

      completionEventType: data.completionEventType.trim(),

      isActive: true,
    };

    const [createdRule] = await this.databaseService.connection
      .insert(maintenanceRules)
      .values(newRule)
      .returning();

    if (!createdRule) {
      throw new Error("Failed to create maintenance rule");
    }

    return createdRule;
  }

  async findRule(
    vehicleId: string,
    ruleId: string,
  ): Promise<MaintenanceRule | null> {
    const [rule] = await this.databaseService.connection
      .select()
      .from(maintenanceRules)
      .where(
        and(
          eq(maintenanceRules.id, ruleId),
          eq(maintenanceRules.vehicleId, vehicleId),
        ),
      )
      .limit(1);

    return rule ?? null;
  }

  async listActiveRules(vehicleId: string): Promise<MaintenanceRule[]> {
    return this.databaseService.connection
      .select()
      .from(maintenanceRules)
      .where(
        and(
          eq(maintenanceRules.vehicleId, vehicleId),
          eq(maintenanceRules.isActive, true),
        ),
      );
  }

  async deactivateRule(
    vehicleId: string,
    ruleId: string,
  ): Promise<MaintenanceRule | null> {
    const [rule] = await this.databaseService.connection
      .update(maintenanceRules)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(maintenanceRules.id, ruleId),
          eq(maintenanceRules.vehicleId, vehicleId),
        ),
      )
      .returning();

    return rule ?? null;
  }
}
