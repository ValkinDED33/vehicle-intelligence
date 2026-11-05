import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ServiceRecordsDbService } from "../../service-records/service-records.db.service";
import { validateMaintenanceRule } from "../maintenance-rule-validation";

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
    private readonly serviceRecords: ServiceRecordsDbService,
  ) {}

  async createRule(
    ownerId: string,
    vehicleId: string,
    input: CreateMaintenanceRuleInput,
  ): Promise<MaintenanceRule> {
    await this.garageService.getVehicle(ownerId, vehicleId);
    validateMaintenanceRule(input);

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

  async updateRule(ownerId: string, vehicleId: string, id: string, input: CreateMaintenanceRuleInput) {
    await this.garageService.getVehicle(ownerId, vehicleId);
    validateMaintenanceRule(input);
    const rule = await this.maintenanceDbService.updateRule(vehicleId, id, input);
    if (!rule) throw new NotFoundException("Регламент обслуговування не знайдено");
    return rule;
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
      throw new NotFoundException("Регламент обслуговування не знайдено");
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
        const [service, lastCompletionEvent] = await Promise.all([
          this.serviceRecords.latestForMaintenance(vehicleId, rule.key),
          rule.completionEventType === "service.completed" ? Promise.resolve(null) : this.vehicleHistoryService.getLatestEvent(
            ownerId,
            vehicleId,
            rule.completionEventType,
          ),
        ]);
        const useService = !!service && (!lastCompletionEvent || service.occurredAt >= lastCompletionEvent.occurredAt);
        const completedAt = useService ? service!.occurredAt : lastCompletionEvent?.occurredAt ?? null;

        return { ...this.statusCalculator.calculate({
          rule,

          lastCompletedAt: completedAt,

          lastCompletedMileageKm: useService ? service!.odometerKm : lastCompletionEvent?.mileageKm ?? null,

          lastCompletedEngineHours: useService ? service!.engineHours === null ? null : Number(service!.engineHours) : this.extractEngineHours(
            lastCompletionEvent?.payload,
          ),

          currentMileageKm,
          currentEngineHours,

          hasCompletionHistory: completedAt !== null,
        }), lastCompletionId: useService ? `service:${service!.id}` : lastCompletionEvent ? `event:${lastCompletionEvent.id}` : null };
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
