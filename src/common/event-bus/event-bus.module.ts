import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventBusService } from './event-bus.service';

/**
 * Global — чтобы любой модуль мог инжектировать EventBusService,
 * не импортируя этот модуль вручную в каждом месте.
 */
@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventBusModule {}
