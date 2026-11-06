import { fmtDate, fmtNumber, type ScheduledReminder } from "../api";
import { t } from "../i18n";

export function reminderCondition(reminder: ScheduledReminder): string {
  if (!reminder.maintenanceRuleId) return fmtDate(reminder.dueDate);
  return [
    reminder.targetOdometerKm != null ? t("Пробіг ТО: {0} км", { 0: fmtNumber(reminder.targetOdometerKm) }) : "",
    reminder.serviceDueDate ? fmtDate(reminder.serviceDueDate) : "",
  ].filter(Boolean).join(" · ") || t("За регламентом ТО");
}
