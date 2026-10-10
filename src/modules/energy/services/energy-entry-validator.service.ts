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
        "Для заправки потрібно вказати кількість пального",
      );
    }

    if (
      input.kind === "charge" &&
      (input.energyKwh === undefined || input.energyKwh <= 0)
    ) {
      throw new BadRequestException(
        "Для заряджання потрібно вказати кількість енергії",
      );
    }

    if (input.kind === "charge" && input.isFullTank) {
      throw new BadRequestException(
        "Ознака повного бака застосовується тільки до заправки пальним",
      );
    }

    if (
      input.discountPercent !== undefined &&
      (input.discountPercent < 0 || input.discountPercent > 100)
    ) {
      throw new BadRequestException("Відсоток знижки має бути від 0 до 100");
    }

    if (input.discountAmount !== undefined && input.discountAmount < 0) {
      throw new BadRequestException("Сума знижки не може бути від’ємною");
    }

    if (input.subtotalCost !== undefined && input.subtotalCost < 0) {
      throw new BadRequestException(
        "Вартість до знижки не може бути від’ємною",
      );
    }

    if (input.totalCost !== undefined && input.totalCost < 0) {
      throw new BadRequestException(
        "Підсумкова вартість не може бути від’ємною",
      );
    }

    if (input.odometerKm !== undefined && input.odometerKm < 0) {
      throw new BadRequestException("Пробіг не може бути від’ємним");
    }
  }
}
