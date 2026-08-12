/**
 * Единая система уровней срочности для всей платформы.
 *
 * Все модули должны использовать эту шкалу для событий
 * и уведомлений вместо создания собственных уровней.
 */
export enum UrgencyLevel {
  NORMAL = "normal",
  ATTENTION = "attention",
  CHECK_SOON = "check_soon",
  STOP = "stop",
}

export const URGENCY_EMOJI: Readonly<Record<UrgencyLevel, string>> = {
  [UrgencyLevel.NORMAL]: "🟢",
  [UrgencyLevel.ATTENTION]: "🟡",
  [UrgencyLevel.CHECK_SOON]: "🟠",
  [UrgencyLevel.STOP]: "🔴",
};
