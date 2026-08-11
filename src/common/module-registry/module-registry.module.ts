import { Controller, Get, Global, Module } from '@nestjs/common';
import { ModuleRegistryService } from './module-registry.service';

@Controller('module-registry')
class ModuleRegistryController {
  constructor(private readonly registry: ModuleRegistryService) {}

  /** GET /module-registry — список всех подключённых модулей и их контрактов */
  @Get()
  list() {
    return this.registry.getAll();
  }
}

@Global()
@Module({
  providers: [ModuleRegistryService],
  controllers: [ModuleRegistryController],
  exports: [ModuleRegistryService],
})
export class ModuleRegistryModule {}
