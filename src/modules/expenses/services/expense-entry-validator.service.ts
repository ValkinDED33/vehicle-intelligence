import { BadRequestException, Injectable } from "@nestjs/common";

import { type CreateExpenseInput } from "../expenses.types";

@Injectable()
export class ExpenseEntryValidatorService {
  validate(input: CreateExpenseInput): void {
    const forbiddenCategories = new Set(["fuel", "charge", "energy"]);

    if (forbiddenCategories.has(input.category.trim().toLowerCase())) {
      throw new BadRequestException(
        "Заправки й заряджання записуються через Energy, а не Expenses",
      );
    }

    if (
      input.discountPercent !== undefined &&
      (input.discountPercent < 0 || input.discountPercent > 100)
    ) {
      throw new BadRequestException("Відсоток знижки має бути від 0 до 100");
    }

    if (input.totalCost !== undefined && input.totalCost < 0) {
      throw new BadRequestException("Вартість не може бути від’ємною");
    }
  }
}
