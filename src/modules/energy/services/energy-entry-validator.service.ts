import { BadRequestException, Injectable } from "@nestjs/common";

import { type CreateEnergyEntryInput } from "../energy.types";

@Injectable()
export class EnergyEntryValidatorService {
  validate(input: CreateEnergyEntryInput): void {
    if (
      input.kind === "fuel" &&
      (input.volumeLiters === undefined || input.volumeLiters <= 0)
    ) {
      throw new BadRequestException(
        "Для заправки необходимо указать количество топлива",
      );
    }

    if (
      input.kind === "charge" &&
      (input.energyKwh === undefined || input.energyKwh <= 0)
    ) {
      throw new BadRequestException(
        "Для зарядки необходимо указать количество энергии",
      );
    }

    if (input.kind === "charge" && input.isFullTank) {
      throw new BadRequestException(
        "Признак полного бака применим только к заправке топливом",
      );
    }

    if (
      input.discountPercent !== undefined &&
      (input.discountPercent < 0 || input.discountPercent > 100)
    ) {
      throw new BadRequestException("Процент скидки должен быть от 0 до 100");
    }

    if (input.discountAmount !== undefined && input.discountAmount < 0) {
      throw new BadRequestException("Сумма скидки не может быть отрицательной");
    }

    if (input.subtotalCost !== undefined && input.subtotalCost < 0) {
      throw new BadRequestException(
        "Стоимость до скидки не может быть отрицательной",
      );
    }

    if (input.totalCost !== undefined && input.totalCost < 0) {
      throw new BadRequestException(
        "Итоговая стоимость не может быть отрицательной",
      );
    }

    if (input.odometerKm !== undefined && input.odometerKm < 0) {
      throw new BadRequestException("Пробег не может быть отрицательным");
    }
  }
}
