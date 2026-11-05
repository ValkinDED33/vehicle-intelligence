import { UrgencyLevel } from "../../common/urgency/urgency.enum";
import { type MaintenanceRule } from "./schemas/maintenance-rule.schema";
import type { ReminderOffset } from "../reminders/reminder-schedule";

export interface CreateMaintenanceRuleInput {
  telegramEnabled?: boolean;
  notifyWhenDue?: boolean;
  reminderOffsets?: ReminderOffset[];
  remindAt?: string;
  timeZone?: string;
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

export interface MaintenanceRuleStatus {
  lastCompletionId?: string | null;
  rule: MaintenanceRule;

  urgency: UrgencyLevel;

  lastCompletedAt: Date | null;
  lastCompletedMileageKm: number | null;
  lastCompletedEngineHours: number | null;

  currentMileageKm: number | null;
  currentEngineHours: number | null;

  kmSinceService: number | null;
  monthsSinceService: number | null;
  engineHoursSinceService: number | null;

  kmRemaining: number | null;
  daysRemaining: number | null;
  engineHoursRemaining: number | null;
}
