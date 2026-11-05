import { BadRequestException } from "@nestjs/common";
import { buildReminderSchedule } from "../reminders/reminder-schedule";
import type { CreateMaintenanceRuleInput } from "./maintenance.types";

export function validateMaintenanceRule(input: CreateMaintenanceRuleInput) {
  if (!/^[a-z][a-z0-9_]{0,79}$/.test(input.key) || !input.title.trim() || input.title.length > 160
    || !input.intervalKm && !input.intervalMonths && !input.intervalEngineHours) throw new BadRequestException("Укажіть роботу та інтервал обслуговування.");
  for (const value of [input.intervalKm, input.intervalMonths, input.intervalEngineHours, input.warningKmBefore, input.warningDaysBefore, input.warningEngineHoursBefore]) {
    if (value != null && (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)) throw new BadRequestException("Некоректний інтервал обслуговування.");
  }
  if ([input.intervalKm, input.intervalMonths, input.intervalEngineHours].some(value => value != null && value < 1)
    || input.intervalMonths != null && input.intervalMonths > 1200
    || input.intervalKm && input.warningKmBefore != null && input.warningKmBefore > input.intervalKm) throw new BadRequestException("Некоректний інтервал обслуговування.");
  if (input.telegramEnabled) {
    if (input.notifyWhenDue === false && input.reminderOffsets?.some(offset => offset.amount === 0)) throw new BadRequestException("Узгодьте сповіщення в день обслуговування зі строками нагадування.");
    buildReminderSchedule({ title: input.title, dueDate: "2099-12-31", offsets: input.reminderOffsets?.length ? input.reminderOffsets : undefined,
      remindAt: input.remindAt, timeZone: input.timeZone }, new Date("2000-01-01T00:00:00Z"));
  }
}
