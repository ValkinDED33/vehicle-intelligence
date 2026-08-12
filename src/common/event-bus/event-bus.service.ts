import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { randomUUID } from "crypto";

import { VehicleEvent } from "./interfaces/vehicle-event.interface";

/**
 * Общая шина доменных/платформенных событий.
 *
 * Используется там, где событие действительно помогает развязать модули:
 * один модуль публикует факт, а другие могут на него реагировать независимо.
 *
 * Event Bus не должен заменять все синхронные application-service вызовы.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(private readonly emitter: EventEmitter2) {}

  publish<TPayload = Record<string, unknown>>(
    event: Omit<VehicleEvent<TPayload>, "eventId" | "occurredAt"> &
      Partial<Pick<VehicleEvent<TPayload>, "occurredAt">>,
  ): VehicleEvent<TPayload> {
    const fullEvent: VehicleEvent<TPayload> = {
      ...event,
      eventId: randomUUID(),
      occurredAt: event.occurredAt ?? new Date(),
    };

    this.logger.debug(
      `event=${fullEvent.type} vehicle=${fullEvent.vehicleId} source=${fullEvent.sourceModule}`,
    );

    this.emitter.emit(fullEvent.type, fullEvent);
    this.emitter.emit("vehicle.event.any", fullEvent);

    return fullEvent;
  }

  on<TPayload = Record<string, unknown>>(
    eventType: string,
    handler: (event: VehicleEvent<TPayload>) => void,
  ): void {
    this.emitter.on(eventType, handler);
  }
}
