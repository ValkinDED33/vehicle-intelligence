import type { MemoryReference } from "../assistant/assistant-memory.types";
export type BotLanguage = "uk" | "pl" | "en";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export const ACTION_NAMES = [
  "mileage", "expense", "energy", "service", "document", "maintenance",
  "profile", "add_vehicle", "update_vehicle", "archive_vehicle", "restore_vehicle",
  "delete_document", "deactivate_maintenance",
  "request_report",
  "reminder", "update_reminder", "cancel_reminder", "complete_reminder",
  "update_maintenance",
] as const;

export type ActionName = typeof ACTION_NAMES[number];

export interface BotAction {
  operation: ActionName;
  vehicleId?: string;
  input: Record<string, unknown>;
  expectedVin?: string;
  expectedReminderRevision?: number;
}

export interface ConversationState {
  history: ConversationMessage[];
  selectedVehicleId?: string;
  pending?: { id: string; action: BotAction; expiresAt: number; memory?: MemoryReference };
  pendingVin?: { id: string; vin: string; expiresAt: number };
  awaitingVehicleFor?: string;
  processedUpdates: number[];
  lastEffect?: { id: string; operation: string; status: "started" | "completed" | "uncertain"; at: number };
}

export type ConversationCheckpoint = () => Promise<void>;

export function botLanguage(value: string | null | undefined): BotLanguage {
  return value === "pl" || value === "en" ? value : "uk";
}

export function botText(language: BotLanguage, uk: string, pl: string, en: string): string {
  return language === "pl" ? pl : language === "en" ? en : uk;
}

export function interruptedEffectText(language: BotLanguage): string {
  return botText(language,
    "Попередній запит перервався. Перевірте записи на сайті перед повторенням: дія могла вже виконатися.",
    "Poprzednie żądanie zostało przerwane. Przed ponowieniem sprawdź wpisy na stronie: operacja mogła już zostać wykonana.",
    "The previous request was interrupted. Check the website records before trying again: the action may already have completed.");
}
