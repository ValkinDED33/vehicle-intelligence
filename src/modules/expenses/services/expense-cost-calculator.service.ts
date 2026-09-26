import { BadRequestException, Injectable } from "@nestjs/common";

import {
  type CreateExpenseInput,
  type ExpenseCostCalculation,
} from "../expenses.types";
import {
  roundExpenseMoney,
  roundExpenseValue,
} from "../utils/expense-number.utils";

@Injectable()
export class ExpenseCostCalculatorService {
  calculate(input: CreateExpenseInput): ExpenseCostCalculation {
    let subtotalCost = input.subtotalCost ?? null;
    let discountPercent = input.discountPercent ?? null;
    let discountAmount = input.discountAmount ?? null;
    let totalCost = input.totalCost ?? null;

    if (
      discountAmount === null &&
      discountPercent !== null &&
      subtotalCost !== null
    ) {
      discountAmount = roundExpenseMoney(
        subtotalCost * (discountPercent / 100),
      );
    }

    if (
      discountAmount === null &&
      subtotalCost !== null &&
      totalCost !== null
    ) {
      discountAmount = roundExpenseMoney(Math.max(0, subtotalCost - totalCost));
    }

    if (
      discountPercent === null &&
      discountAmount !== null &&
      subtotalCost !== null &&
      subtotalCost > 0
    ) {
      discountPercent = roundExpenseValue(
        (discountAmount / subtotalCost) * 100,
        2,
      );
    }

    if (totalCost === null && subtotalCost !== null) {
      totalCost = roundExpenseMoney(subtotalCost - (discountAmount ?? 0));
    }

    if (
      subtotalCost === null &&
      totalCost !== null &&
      discountAmount !== null
    ) {
      subtotalCost = roundExpenseMoney(totalCost + discountAmount);
    }

    if (totalCost === null) {
      throw new BadRequestException(
        "Необходимо указать итоговую стоимость или стоимость до скидки",
      );
    }

    if (
      subtotalCost !== null &&
      discountAmount !== null &&
      discountAmount > subtotalCost
    ) {
      throw new BadRequestException(
        "Скидка не может превышать стоимость до скидки",
      );
    }

    return {
      subtotalCost,
      discountPercent,
      discountAmount,
      totalCost: roundExpenseMoney(totalCost),
    };
  }
}
