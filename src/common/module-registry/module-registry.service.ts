import { Injectable, Logger } from '@nestjs/common';
import { ModuleContract } from './interfaces/module-contract.interface';

/**
 * Реестр всех подключённых модулей платформы.
 * Каждый модуль регистрирует себя один раз при старте (см. пример в vin.module.ts).
 */
@Injectable()
export class ModuleRegistryService {
  private readonly logger = new Logger(ModuleRegistryService.name);
  private readonly registry = new Map<string, ModuleContract>();

  register(contract: ModuleContract): void {
    if (this.registry.has(contract.id)) {
      this.logger.warn(`Модуль "${contract.id}" уже зарегистрирован — перезаписываю контракт`);
    }
    this.registry.set(contract.id, contract);
    this.logger.log(`Зарегистрирован модуль: ${contract.id} (v${contract.version})`);
  }

  get(id: string): ModuleContract | undefined {
    return this.registry.get(id);
  }

  getAll(): ModuleContract[] {
    return Array.from(this.registry.values());
  }
}
