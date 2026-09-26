import { Injectable } from "@nestjs/common";

import { UrgencyLevel } from "../../../common/urgency/urgency.enum";
import { type MaintenanceRuleStatus } from "../maintenance.types";
import { type MaintenanceRule } from "../schemas/maintenance-rule.schema";

export interface CalculateMaintenanceStatusInput {
  rule: MaintenanceRule;

  lastCompletedAt: Date | null;
  lastCompletedMileageKm: number | null;
  lastCompletedEngineHours: number | null;

  currentMileageKm: number | null;
  currentEngineHours: number | null;

  hasCompletionHistory: boolean;
}

@Injectable()
export class MaintenanceStatusCalculatorService {
  calculate(input: CalculateMaintenanceStatusInput): MaintenanceRuleStatus {
    const {
      rule,
      lastCompletedAt,
      lastCompletedMileageKm,
      lastCompletedEngineHours,
      currentMileageKm,
      currentEngineHours,
      hasCompletionHistory,
    } = input;

    const kmSinceService =
      currentMileageKm !== null && lastCompletedMileageKm !== null
        ? Math.max(0, currentMileageKm - lastCompletedMileageKm)
        : null;

    const engineHoursSinceService =
      currentEngineHours !== null && lastCompletedEngineHours !== null
        ? Math.max(0, currentEngineHours - lastCompletedEngineHours)
        : null;

    const monthsSinceService = lastCompletedAt
      ? this.monthsBetween(lastCompletedAt, new Date())
      : null;

    const kmRemaining =
      rule.intervalKm !== null && kmSinceService !== null
        ? rule.intervalKm - kmSinceService
        : null;

    const daysRemaining =
      rule.intervalMonths !== null && lastCompletedAt !== null
        ? this.daysUntil(
            this.addMonths(lastCompletedAt, rule.intervalMonths),
            new Date(),
          )
        : null;

    const engineHoursRemaining =
      rule.intervalEngineHours !== null && engineHoursSinceService !== null
        ? rule.intervalEngineHours - engineHoursSinceService
        : null;

    const urgency = this.calculateUrgency({
      rule,
      kmRemaining,
      daysRemaining,
      engineHoursRemaining,
      hasCompletionHistory,
    });

    return {
      rule,
      urgency,

      lastCompletedAt,
      lastCompletedMileageKm,
      lastCompletedEngineHours,

      currentMileageKm,
      currentEngineHours,

      kmSinceService,
      monthsSinceService,
      engineHoursSinceService,

      kmRemaining,
      daysRemaining,
      engineHoursRemaining,
    };
  }

  private calculateUrgency(input: {
    rule: MaintenanceRule;
    kmRemaining: number | null;
    daysRemaining: number | null;
    engineHoursRemaining: number | null;
    hasCompletionHistory: boolean;
  }): UrgencyLevel {
    const {
      rule,
      kmRemaining,
      daysRemaining,
      engineHoursRemaining,
      hasCompletionHistory,
    } = input;

    if (!hasCompletionHistory) {
      return UrgencyLevel.ATTENTION;
    }

    const overdue =
      (kmRemaining !== null && kmRemaining <= 0) ||
      (daysRemaining !== null && daysRemaining <= 0) ||
      (engineHoursRemaining !== null && engineHoursRemaining <= 0);

    if (overdue) {
      return UrgencyLevel.CHECK_SOON;
    }

    const approaching =
      (kmRemaining !== null &&
        rule.warningKmBefore !== null &&
        kmRemaining <= rule.warningKmBefore) ||
      (daysRemaining !== null &&
        rule.warningDaysBefore !== null &&
        daysRemaining <= rule.warningDaysBefore) ||
      (engineHoursRemaining !== null &&
        rule.warningEngineHoursBefore !== null &&
        engineHoursRemaining <= rule.warningEngineHoursBefore);

    if (approaching) {
      return UrgencyLevel.ATTENTION;
    }

    return UrgencyLevel.NORMAL;
  }

  private monthsBetween(from: Date, to: Date): number {
    const years = to.getUTCFullYear() - from.getUTCFullYear();
    const months = to.getUTCMonth() - from.getUTCMonth();

    return years * 12 + months;
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);

    result.setUTCMonth(result.getUTCMonth() + months);

    return result;
  }

  private daysUntil(target: Date, now: Date): number {
    const differenceMs = target.getTime() - now.getTime();

    return Math.ceil(differenceMs / (24 * 60 * 60 * 1000));
  }
}
