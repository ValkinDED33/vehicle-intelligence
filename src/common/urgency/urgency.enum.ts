/** Shared urgency levels for events and notifications across all modules. */
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
