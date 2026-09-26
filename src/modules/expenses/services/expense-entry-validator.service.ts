import { BadRequestException, Injectable } from "@nestjs/common";

import { type CreateExpenseInput } from "../expenses.types";

@Injectable()
export class ExpenseEntryValidatorService {
  validate(input: CreateExpenseInput): void {
    const forbiddenCategories = new Set(["fuel", "charge", "energy"]);

    if (forbiddenCategories.has(input.category.trim().toLowerCase())) {
      throw new BadRequestException(
        "Заправки и зарядки записываются через Energy, а не Expenses",
      );
    }

    if (
      input.discountPercent !== undefined &&
      (input.discountPercent < 0 || input.discountPercent > 100)
    ) {
      throw new BadRequestException("Процент скидки должен быть от 0 до 100");
    }

    if (input.totalCost !== undefined && input.totalCost < 0) {
      throw new BadRequestException("Стоимость не может быть отрицательной");
    }
  }
}
