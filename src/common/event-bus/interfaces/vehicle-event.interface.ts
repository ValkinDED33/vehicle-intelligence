/**
 * Единый формат платформенного события.
 *
 * Событие может относиться к конкретному автомобилю,
 * но не каждое платформенное событие обязано иметь vehicleId.
 */
export type EventOrigin = "telegram" | "web" | "ocr" | "ai-inferred" | "system";

export interface VehicleEvent<TPayload = Record<string, unknown>> {
  eventId: string;

  /**
   * ID автомобиля, если событие относится к конкретному автомобилю.
   */
  vehicleId?: string;

  /**
   * ID модуля, который опубликовал событие.
   */
  sourceModule: string;

  /**
   * Тип события.
   *
   * Примеры:
   * "fuel.refill"
   * "service.oil_change"
   * "document.attached"
   */
  type: string;

  /**
   * Когда событие фактически произошло.
   */
  occurredAt: Date;

  /**
   * Пробег автомобиля на момент события, если известен.
   */
  mileageKm?: number;

  /**
   * Данные конкретного события.
   */
  payload: TPayload;

  /**
   * Уверенность источника в данных.
   *
   * Ожидаемый диапазон: 0..1.
   * Для ручных/системных данных обычно 1.
   * OCR/AI могут иметь значение ниже 1.
   */
  confidence: number;

  /**
   * Откуда пришли исходные данные.
   */
  origin: EventOrigin;

  /**
   * Идентификаторы или ссылки на связанные вложения.
   */
  attachments?: string[];
}
