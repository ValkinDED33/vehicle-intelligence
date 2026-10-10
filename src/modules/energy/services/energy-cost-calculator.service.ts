import { BadRequestException, Injectable } from "@nestjs/common";

import {
  type CreateEnergyEntryInput,
  type EnergyCostCalculation,
} from "../energy.types";
import {
  roundEnergyMoney,
  roundEnergyValue,
} from "../utils/energy-number.utils";

@Injectable()
export class EnergyCostCalculatorService {
  calculate(input: CreateEnergyEntryInput): EnergyCostCalculation {
    let subtotalCost = input.subtotalCost ?? null;
    let discountPercent = input.discountPercent ?? null;
    let discountAmount = input.discountAmount ?? null;
    let totalCost = input.totalCost ?? null;

    if (subtotalCost === null && input.unitPrice !== undefined) {
      const quantity =
        input.kind === "fuel" ? input.volumeLiters : input.energyKwh;

      if (quantity !== undefined) {
        subtotalCost = roundEnergyMoney(quantity * input.unitPrice);
      }
    }

    if (
      discountAmount === null &&
      discountPercent !== null &&
      subtotalCost !== null
    ) {
      discountAmount = roundEnergyMoney(subtotalCost * (discountPercent / 100));
    }

    if (
      discountAmount === null &&
      subtotalCost !== null &&
      totalCost !== null
    ) {
      discountAmount = roundEnergyMoney(Math.max(0, subtotalCost - totalCost));
    }

    if (
      discountPercent === null &&
      discountAmount !== null &&
      subtotalCost !== null &&
      subtotalCost > 0
    ) {
      discountPercent = roundEnergyValue(
        (discountAmount / subtotalCost) * 100,
        2,
      );
    }

    if (totalCost === null && subtotalCost !== null) {
      totalCost = roundEnergyMoney(subtotalCost - (discountAmount ?? 0));
    }

    if (
      subtotalCost === null &&
      totalCost !== null &&
      discountAmount !== null
    ) {
      subtotalCost = roundEnergyMoney(totalCost + discountAmount);
    }

    if (
      subtotalCost !== null &&
      discountAmount !== null &&
      discountAmount > subtotalCost
    ) {
      throw new BadRequestException(
        "Знижка не може бути більшою за вартість до знижки",
      );
    }

    return {
      subtotalCost,
      discountPercent,
      discountAmount,
      totalCost,
    };
  }
}
