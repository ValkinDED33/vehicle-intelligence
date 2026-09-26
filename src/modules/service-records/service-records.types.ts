export interface CreateServiceRecordItemInput {
  itemType: "work" | "part" | "fluid" | "consumable" | "diagnostic" | "other";

  name: string;
  description?: string;

  brand?: string;
  partNumber?: string;

  quantity?: number;
  unit?: string;

  unitCost?: number;
  totalCost?: number;
  currency?: string;

  warrantyMonths?: number;
  warrantyKm?: number;
}

export interface CreateServiceRecordInput {
  /**
   * Пока expenseId принимаем только как ссылку
   * на уже существующий Expense.
   *
   * Автоматическое создание Expense вместе
   * с ServiceRecord добавим отдельно через
   * orchestration / Unit of Work.
   */
  expenseId?: string;

  type:
    | "maintenance"
    | "repair"
    | "diagnostic"
    | "inspection"
    | "replacement"
    | "upgrade"
    | "other";

  title: string;
  description?: string;

  odometerKm?: number;
  engineHours?: number;

  providerName?: string;
  documentNumber?: string;

  totalCost?: number;
  currency?: string;

  source?: string;
  occurredAt?: Date;

  items?: CreateServiceRecordItemInput[];
}
