import { Injectable, NotFoundException } from "@nestjs/common";

import { GarageService } from "../../garage/services/garage.service";
import { MileageService } from "../../mileage/services/mileage.service";
import { VehicleHistoryService } from "../../vehicle-history/services/vehicle-history.service";
import { MaintenanceDbService } from "../maintenance.db.service";
import {
  type CreateMaintenanceRuleInput,
  type MaintenanceRuleStatus,
} from "../maintenance.types";
import { type MaintenanceRule } from "../schemas/maintenance-rule.schema";

import { MaintenanceStatusCalculatorService } from "./maintenance-status-calculator.service";

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly garageService: GarageService,
    private readonly maintenanceDbService: MaintenanceDbService,
    private readonly mileageService: MileageService,
    private readonly vehicleHistoryService: VehicleHistoryService,
    private readonly statusCalculator: MaintenanceStatusCalculatorService,
  ) {}

  async createRule(
    ownerId: string,
    vehicleId: string,
    input: CreateMaintenanceRuleInput,
  ): Promise<MaintenanceRule> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.maintenanceDbService.createRule({
      vehicleId,
      ...input,
    });
  }

  async listRules(
    ownerId: string,
    vehicleId: string,
  ): Promise<MaintenanceRule[]> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.maintenanceDbService.listActiveRules(vehicleId);
  }

  async deactivateRule(
    ownerId: string,
    vehicleId: string,
    ruleId: string,
  ): Promise<MaintenanceRule> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    const rule = await this.maintenanceDbService.deactivateRule(
      vehicleId,
      ruleId,
    );

    if (!rule) {
      throw new NotFoundException("Регламент обслуживания не найден");
    }

    return rule;
  }

  async getStatus(
    ownerId: string,
    vehicleId: string,
  ): Promise<MaintenanceRuleStatus[]> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    const [rules, latestMileage] = await Promise.all([
      this.maintenanceDbService.listActiveRules(vehicleId),
      this.mileageService.getLatestReading(ownerId, vehicleId),
    ]);

    const currentMileageKm = latestMileage?.odometerKm ?? null;
    const currentEngineHours = latestMileage?.engineHours ?? null;

    return Promise.all(
      rules.map(async (rule) => {
        const lastCompletionEvent =
          await this.vehicleHistoryService.getLatestEvent(
            ownerId,
            vehicleId,
            rule.completionEventType,
          );

        return this.statusCalculator.calculate({
          rule,

          lastCompletedAt: lastCompletionEvent?.occurredAt ?? null,

          lastCompletedMileageKm: lastCompletionEvent?.mileageKm ?? null,

          lastCompletedEngineHours: this.extractEngineHours(
            lastCompletionEvent?.payload,
          ),

          currentMileageKm,
          currentEngineHours,

          hasCompletionHistory: lastCompletionEvent !== null,
        });
      }),
    );
  }

  private extractEngineHours(
    payload: Record<string, unknown> | undefined,
  ): number | null {
    if (!payload) {
      return null;
    }

    const value = payload.engineHours;

    return typeof value === "number" ? value : null;
  }
}
