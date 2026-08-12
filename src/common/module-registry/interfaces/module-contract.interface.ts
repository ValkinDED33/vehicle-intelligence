import { UrgencyLevel } from "../../urgency/urgency.enum";

/**
 * Контракт, который должен описывать каждый модуль при регистрации.
 *
 * Благодаря этому новые модули могут подключаться к платформе
 * без жёсткой зависимости остальных частей системы от их реализации.
 */
export interface ModuleCommand {
  name: string;
  description: string;
}

export interface ModuleEventSpec {
  /**
   * Тип события, например: "fuel.refill"
   */
  type: string;

  direction: "publishes" | "subscribes";
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
  access: "read" | "write" | "read-write";
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
