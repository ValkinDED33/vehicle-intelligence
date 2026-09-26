import { createHash } from "crypto";

/**
 * vehicle_history_events.eventId is a unique UUID column and recordEvent
 * dedupes by it — hashing a stable seed into UUID shape gives idempotent
 * writes for external sources that have no ids of their own.
 */
export function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
