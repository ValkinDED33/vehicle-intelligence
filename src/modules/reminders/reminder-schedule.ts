import { BadRequestException } from "@nestjs/common";
import { DateTime, IANAZone } from "luxon";

export interface ReminderOffset { amount: number; unit: "days" | "weeks" | "months" }
export interface ReminderPreferences {
  remindAt?: string;
  timeZone?: string;
  offsets?: ReminderOffset[];
}
export interface ReminderInput extends ReminderPreferences { title: string; dueDate: string }
export const DEFAULT_OFFSETS: ReminderOffset[] = [{ amount: 1, unit: "months" }, { amount: 1, unit: "weeks" }];

export function buildReminderSchedule(input: ReminderInput, now = new Date()) {
  const timeZone = input.timeZone ?? "Europe/Warsaw";
  const remindAt = input.remindAt ?? "09:00";
  const title = input.title?.trim();
  const offsets = input.offsets ?? DEFAULT_OFFSETS;
  const fail = () => new BadRequestException("Перевірте дату, час, часовий пояс і строки нагадування.");
  if (!title || title.length > 180 || /[\u0000-\u001f]/.test(title)
    || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(remindAt)
    || !IANAZone.isValidZone(timeZone) || !Array.isArray(offsets) || offsets.length < 1 || offsets.length > 10) throw fail();
  const event = DateTime.fromISO(`${input.dueDate}T${remindAt}`, { zone: timeZone });
  // Reject nonexistent local times during a daylight-saving jump, rather than silently moving them.
  if (!event.isValid || event.toISODate() !== input.dueDate || event.toFormat("HH:mm") !== remindAt
    || event.getPossibleOffsets().length > 1
    || event.year < 2000 || event.year > 2100 || event.endOf("day").toMillis() <= now.getTime()) throw fail();
  const dates = new Map<number, Date>();
  const seen = new Set<string>();
  for (const offset of offsets) {
    if (!offset || Object.keys(offset).some(key => !["amount", "unit"].includes(key))
      || !["days", "weeks", "months"].includes(offset.unit) || !Number.isInteger(offset.amount)
      || offset.amount < 0 || offset.amount > ({ days: 3650, weeks: 520, months: 120 }[offset.unit] ?? 0)) throw fail();
    const key = `${offset.amount}:${offset.unit}`;
    if (seen.has(key)) throw fail();
    seen.add(key);
    const date = event.minus({ [offset.unit]: offset.amount });
    if (date.toFormat("HH:mm") !== remindAt || date.getPossibleOffsets().length > 1) throw fail();
    if (date.toMillis() > now.getTime()) dates.set(date.toMillis(), date.toJSDate());
  }
  const scheduledAt = [...dates.values()].sort((a, b) => a.getTime() - b.getTime());
  if (!scheduledAt.length) throw new BadRequestException("Усі вибрані строки вже минули. Виберіть майбутній час нагадування.");
  return { title, dueDate: input.dueDate, remindAt, timeZone, offsets: offsets.map(offset => ({ ...offset })), scheduledAt };
}

export function numericReminderDate(message: string): string | undefined {
  const iso = message.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = message.match(/\b(\d{1,2})[.\/\\-](\d{1,2})[.\/\\-](\d{4}|\d{2})\b/);
  if (!local) return undefined;
  return `${local[3].length === 2 ? "20" : ""}${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
}
