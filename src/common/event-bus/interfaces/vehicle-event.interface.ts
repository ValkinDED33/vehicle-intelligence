/**
 * Единый формат события для всей платформы (ТЗ, п. 3.2).
 * Любой модуль публикует и подписывается на события ТОЛЬКО в этом формате.
 */
export type EventOrigin = 'telegram' | 'web' | 'ocr' | 'ai-inferred' | 'system';

export interface VehicleEvent<TPayload = Record<string, unknown>> {
  eventId: string;
  vehicleId: string;
  sourceModule: string;
  /** Например: "fuel.refill", "service.oil_change", "document.attached" */
  type: string;
  occurredAt: Date;
  mileageKm?: number;
  payload: TPayload;
  /** 0..1 — насколько источник уверен в данных (OCR/AI могут быть <1) */
  confidence: number;
  origin: EventOrigin;
  attachments?: string[];
}
