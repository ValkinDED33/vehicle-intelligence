export type NormalizedOrigin =
  | "telegram"
  | "web"
  | "ocr"
  | "ai-inferred"
  | "system";

export interface NormalizedProfileFacts {
  engineCode?: string;
  engineFamily?: string;
  displacementCc?: number;
  fuelType?: string;
  powerKw?: number;
  powerHp?: number;
  transmissionType?: string;
  driveType?: string;
}

export interface NormalizedIdentityFacts {
  make?: string;
  model?: string;
  modelYear?: string;
}

export interface NormalizedHistoryEvent {
  /** Event type stored in vehicle_history_events, e.g. "external.auction_sale". */
  type: string;
  origin: NormalizedOrigin;
  /** Stable id within the source payload — used to build an idempotent eventId. */
  eventIdSuffix: string;
  occurredAt?: Date;
  mileageKm?: number;
  confidence?: number;
  payload: Record<string, unknown>;
}

export interface NormalizedMileageReading {
  odometerKm: number;
  recordedAt?: Date;
  /** 0..1 — external sources are less trustworthy than manual input. */
  confidence: number;
  /** Human-readable provenance, e.g. "auction lot 12345". */
  sourceLabel: string;
}

export interface NormalizedSourceFacts {
  profile?: NormalizedProfileFacts;
  identity?: NormalizedIdentityFacts;
  historyEvents: NormalizedHistoryEvent[];
  mileageReadings: NormalizedMileageReading[];
}

export interface SourceNormalizer {
  /** Catalog key from source-catalog.ts this normalizer handles. */
  readonly sourceKey: string;
  /** rawPayload may be an array for sources like auction / stolen-check. */
  normalize(rawPayload: unknown, vin: string): NormalizedSourceFacts;
}

export function emptyFacts(): NormalizedSourceFacts {
  return { historyEvents: [], mileageReadings: [] };
}
