import { Injectable, Logger } from "@nestjs/common";

import { ModuleContract } from "./interfaces/module-contract.interface";

@Injectable()
export class ModuleRegistryService {
  private readonly logger = new Logger(ModuleRegistryService.name);
  private readonly registry = new Map<string, ModuleContract>();

  register(contract: ModuleContract): void {
    if (this.registry.has(contract.id)) {
      throw new Error(`Module "${contract.id}" is already registered`);
    }

    this.registry.set(contract.id, contract);

    this.logger.log(`Registered module: ${contract.id} (v${contract.version})`);
  }

  get(id: string): ModuleContract | undefined {
    return this.registry.get(id);
  }

  getAll(): ModuleContract[] {
    return Array.from(this.registry.values());
  }

  has(id: string): boolean {
    return this.registry.has(id);
  }
}
