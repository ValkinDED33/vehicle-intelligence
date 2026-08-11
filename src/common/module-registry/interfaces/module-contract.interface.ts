import { UrgencyLevel } from '../../urgency/urgency.enum';

/**
 * Контракт, который ОБЯЗАН описать каждый модуль при регистрации (ТЗ, п. 3.1).
 * Это то, что позволяет добавлять модули (obd-module, parking-module, ...)
 * без переписывания vin/service/documents и т.д.
 */
export interface ModuleCommand {
  name: string;
  description: string;
}

export interface ModuleEventSpec {
  /** Тип события, например "fuel.refill" */
  type: string;
  direction: 'publishes' | 'subscribes';
  description: string;
}

export interface ModuleAiTool {
  name: string;
  description: string;
}

export interface ModuleNotification {
  type: string;
  urgencyLevels: UrgencyLevel[];
  description: string;
}

export interface ModuleUiSlot {
  slot: string;
  description: string;
}

export interface ModuleTelegramAction {
  command: string;
  description: string;
}

export interface ModulePermission {
  scope: string;
  access: 'read' | 'write' | 'read-write';
}

export interface ModuleContract {
  id: string;
  version: string;
  description: string;
  commands: ModuleCommand[];
  events: ModuleEventSpec[];
  data: string[];
  aiTools: ModuleAiTool[];
  notifications: ModuleNotification[];
  uiSlots: ModuleUiSlot[];
  telegramActions: ModuleTelegramAction[];
  permissions: ModulePermission[];
}
