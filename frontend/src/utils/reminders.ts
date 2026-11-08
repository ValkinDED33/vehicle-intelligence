import { fmtDate, fmtNumber, type ScheduledReminder } from "../api";
import { t } from "../i18n";

export function reminderDeliveryStatus(status: string): string {
  const labels: Record<string, string> = {
    pending: t("Заплановано"), claimed: t("Надсилання"), sending: t("Надсилання"),
    sent: t("Надіслано"), failed: t("Не доставлено"), uncertain: t("Доставку не підтверджено"),
    skipped: t("Пропущено"), expired: t("Строк минув"), cancelled: t("Скасовано"),
  };
  return labels[status] ?? status;
}

export function reminderCondition(reminder: ScheduledReminder): string {
  if (!reminder.maintenanceRuleId) return fmtDate(reminder.dueDate);
  return [
    reminder.targetOdometerKm != null ? t("Пробіг ТО: {0} км", { 0: fmtNumber(reminder.targetOdometerKm) }) : "",
    reminder.serviceDueDate ? fmtDate(reminder.serviceDueDate) : "",
  ].filter(Boolean).join(" · ") || t("За регламентом ТО");
}
