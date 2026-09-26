import { Injectable } from "@nestjs/common";

import { type CostOfOwnershipCurrencySummary } from "../expenses.types";

@Injectable()
export class CostOfOwnershipMessageBuilderService {
  build(
    distanceKm: number | null,
    currencies: CostOfOwnershipCurrencySummary[],
  ): string {
    if (currencies.length === 0) {
      return "За выбранный месяц расходов не зафиксировано.";
    }

    const parts: string[] = [];

    if (distanceKm !== null) {
      parts.push(
        `По сохранённым показаниям пробега автомобиль прошёл примерно ${distanceKm} км.`,
      );
    }

    for (const summary of currencies) {
      parts.push(
        `Общие расходы составили ${summary.totalCost.toFixed(2)} ${summary.currency}.`,
      );

      if (summary.energyCost > 0) {
        parts.push(
          `Из них на топливо и зарядку ушло ${summary.energyCost.toFixed(2)} ${summary.currency}.`,
        );
      }

      if (summary.expenseCost > 0) {
        parts.push(
          `Остальные расходы составили ${summary.expenseCost.toFixed(2)} ${summary.currency}.`,
        );
      }

      if (summary.totalDiscountSavings > 0) {
        parts.push(
          `Скидками сэкономлено ${summary.totalDiscountSavings.toFixed(2)} ${summary.currency}.`,
        );
      }

      if (summary.costPer100Km !== null) {
        parts.push(
          `Полная стоимость эксплуатации по зафиксированным расходам — примерно ${summary.costPer100Km.toFixed(2)} ${summary.currency} на 100 км.`,
        );
      }
    }

    if (distanceKm === null) {
      parts.push(
        "Для расчёта стоимости километра пока недостаточно показаний пробега за этот месяц.",
      );
    }

    return parts.join(" ");
  }
}
