import { BadRequestException } from "@nestjs/common";
import type { DatabaseService } from "../../common/database/database.service";
import { buildReminderSchedule, type ReminderPreferences } from "./reminder-schedule";
import { reminders, reminderDeliveries } from "./schemas/reminder.schema";
type Transaction = Parameters<Parameters<DatabaseService["connection"]["transaction"]>[0]>[0];

export async function saveDocumentReminder(tx: Transaction, document: { id: string; vehicleId: string; title: string; expiresAt: Date | null }, preferences: ReminderPreferences) {
  if (!document.expiresAt) throw new BadRequestException("Для нагадування потрібна дата закінчення дії документа.");
  const { scheduledAt, ...input } = buildReminderSchedule({ ...preferences, title: document.title, dueDate: document.expiresAt.toISOString().slice(0, 10) });
  const [record] = await tx.insert(reminders).values({ ...input, vehicleId: document.vehicleId, documentId: document.id }).returning();
  await tx.insert(reminderDeliveries).values(scheduledAt.map(date => ({ reminderId: record.id, revision: record.revision, scheduledAt: date })));
}
