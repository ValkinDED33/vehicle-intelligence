/**
 * Единая система уровней срочности для всей платформы (ТЗ, п. 4.12).
 * Любой модуль обязан использовать эту шкалу для событий/уведомлений,
 * а не изобретать свою.
 */
export enum UrgencyLevel {
  NORMAL = 'normal', // 🟢 нормально
  ATTENTION = 'attention', // 🟡 обратить внимание
  CHECK_SOON = 'check_soon', // 🟠 желательно проверить в ближайшее время
  STOP = 'stop', // 🔴 прекратить эксплуатацию / обратиться за помощью
}

export const URGENCY_EMOJI: Record<UrgencyLevel, string> = {
  [UrgencyLevel.NORMAL]: '🟢',
  [UrgencyLevel.ATTENTION]: '🟡',
  [UrgencyLevel.CHECK_SOON]: '🟠',
  [UrgencyLevel.STOP]: '🔴',
};
