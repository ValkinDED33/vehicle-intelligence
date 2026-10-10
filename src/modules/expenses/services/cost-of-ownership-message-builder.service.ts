import { Injectable } from "@nestjs/common";

import { type CostOfOwnershipCurrencySummary } from "../expenses.types";

@Injectable()
export class CostOfOwnershipMessageBuilderService {
  build(
    distanceKm: number | null,
    currencies: CostOfOwnershipCurrencySummary[],
  ): string {
    if (currencies.length === 0) {
      return "За вибраний місяць витрат не зафіксовано.";
    }

    const parts: string[] = [];

    if (distanceKm !== null) {
      parts.push(
        `За збереженими показаннями пробігу автомобіль проїхав приблизно ${distanceKm} км.`,
      );
    }

    for (const summary of currencies) {
      parts.push(
        `Загальні витрати склали ${summary.totalCost.toFixed(2)} ${summary.currency}.`,
      );

      if (summary.energyCost > 0) {
        parts.push(
          `З них на пальне й заряджання пішло ${summary.energyCost.toFixed(2)} ${summary.currency}.`,
        );
      }

      if (summary.expenseCost > 0) {
        parts.push(
          `Інші витрати склали ${summary.expenseCost.toFixed(2)} ${summary.currency}.`,
        );
      }

      if (summary.totalDiscountSavings > 0) {
        parts.push(
          `Знижками зекономлено ${summary.totalDiscountSavings.toFixed(2)} ${summary.currency}.`,
        );
      }

      if (summary.costPer100Km !== null) {
        parts.push(
          `Повна вартість експлуатації за зафіксованими витратами — приблизно ${summary.costPer100Km.toFixed(2)} ${summary.currency} на 100 км.`,
        );
      }
    }

    if (distanceKm === null) {
      parts.push(
        "Для розрахунку вартості кілометра поки недостатньо показань пробігу за цей місяць.",
      );
    }

    return parts.join(" ");
  }
}
