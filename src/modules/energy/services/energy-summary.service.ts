import { BadRequestException, Injectable } from "@nestjs/common";

import { MileageService } from "../../mileage/services/mileage.service";
import { VehicleProfileService } from "../../vehicle-profile/services/vehicle-profile.service";
import { EnergyDbService } from "../energy.db.service";
import {
  type MonthlyEnergyMoneySummary,
  type MonthlyEnergySummary,
} from "../energy.types";
import {
  parseEnergyDecimal,
  roundEnergyMoney,
  roundEnergyValue,
} from "../utils/energy-number.utils";

@Injectable()
export class EnergySummaryService {
  constructor(
    private readonly energyDbService: EnergyDbService,
    private readonly mileageService: MileageService,
    private readonly vehicleProfileService: VehicleProfileService,
  ) {}

  async getMonthlySummary(
    ownerId: string,
    vehicleId: string,
    year: number,
    month: number,
  ): Promise<MonthlyEnergySummary> {
    if (month < 1 || month > 12) {
      throw new BadRequestException("Месяц должен быть от 1 до 12");
    }

    const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const entries = await this.energyDbService.listForVehicle(vehicleId, {
      from,
      to,
    });

    const fuelLiters = roundEnergyValue(
      entries.reduce(
        (sum, entry) => sum + parseEnergyDecimal(entry.volumeLiters),
        0,
      ),
      3,
    );

    const energyKwh = roundEnergyValue(
      entries.reduce(
        (sum, entry) => sum + parseEnergyDecimal(entry.energyKwh),
        0,
      ),
      3,
    );

    const fullTankRefuels = entries.filter(
      (entry) => entry.kind === "fuel" && entry.isFullTank,
    ).length;

    const money = this.buildMoneySummary(entries);

    const mileageHistory = await this.mileageService.getHistory(
      ownerId,
      vehicleId,
      { from, to },
    );

    const chronologicalMileage = [...mileageHistory].reverse();

    let odometerDistanceKm: number | null = null;

    if (chronologicalMileage.length >= 2) {
      const first = chronologicalMileage[0];
      const last = chronologicalMileage[chronologicalMileage.length - 1];
      const calculatedDistance = last.odometerKm - first.odometerKm;

      if (calculatedDistance >= 0) {
        odometerDistanceKm = calculatedDistance;
      }
    }

    const averageFuelConsumption =
      odometerDistanceKm !== null && odometerDistanceKm > 0 && fuelLiters > 0
        ? roundEnergyValue((fuelLiters / odometerDistanceKm) * 100, 2)
        : null;

    const averageEnergyConsumption =
      odometerDistanceKm !== null && odometerDistanceKm > 0 && energyKwh > 0
        ? roundEnergyValue((energyKwh / odometerDistanceKm) * 100, 2)
        : null;

    const profile = await this.vehicleProfileService.getCurrentProfile(
      ownerId,
      vehicleId,
    );

    const tankCapacityLiters = profile?.fuelTankCapacityLiters ?? null;

    return {
      year,
      month,
      entriesCount: entries.length,
      fuelLiters,
      energyKwh,
      fullTankRefuels,
      money,
      odometerDistanceKm,
      averageFuelConsumptionLitersPer100Km: averageFuelConsumption,
      averageEnergyConsumptionKwhPer100Km: averageEnergyConsumption,
      tankCapacityLiters,
      message: this.buildMessage({
        entriesCount: entries.length,
        fuelLiters,
        energyKwh,
        odometerDistanceKm,
        averageFuelConsumption,
        averageEnergyConsumption,
        money,
      }),
    };
  }

  private buildMoneySummary(
    entries: Awaited<ReturnType<EnergyDbService["listForVehicle"]>>,
  ): MonthlyEnergyMoneySummary[] {
    const moneyMap = new Map<string, MonthlyEnergyMoneySummary>();

    for (const entry of entries) {
      if (!entry.currency) {
        continue;
      }

      const current = moneyMap.get(entry.currency) ?? {
        currency: entry.currency,
        subtotalCost: 0,
        discountAmount: 0,
        totalCost: 0,
      };

      current.subtotalCost += parseEnergyDecimal(entry.subtotalCost);
      current.discountAmount += parseEnergyDecimal(entry.discountAmount);
      current.totalCost += parseEnergyDecimal(entry.totalCost);

      moneyMap.set(entry.currency, current);
    }

    return Array.from(moneyMap.values()).map((item) => ({
      currency: item.currency,
      subtotalCost: roundEnergyMoney(item.subtotalCost),
      discountAmount: roundEnergyMoney(item.discountAmount),
      totalCost: roundEnergyMoney(item.totalCost),
    }));
  }

  private buildMessage(input: {
    entriesCount: number;
    fuelLiters: number;
    energyKwh: number;
    odometerDistanceKm: number | null;
    averageFuelConsumption: number | null;
    averageEnergyConsumption: number | null;
    money: MonthlyEnergyMoneySummary[];
  }): string {
    if (input.entriesCount === 0) {
      return "За выбранный месяц заправок или зарядок не зафиксировано.";
    }

    const parts: string[] = [];

    if (input.odometerDistanceKm !== null) {
      parts.push(
        `За период по сохранённым показаниям пробега автомобиль прошёл примерно ${input.odometerDistanceKm} км.`,
      );
    }

    if (input.fuelLiters > 0) {
      parts.push(`Заправлено ${input.fuelLiters} л топлива.`);
    }

    if (input.energyKwh > 0) {
      parts.push(`Получено ${input.energyKwh} кВт⋅ч энергии.`);
    }

    if (input.averageFuelConsumption !== null) {
      parts.push(
        `Ориентировочный расход по данным месяца — ${input.averageFuelConsumption} л/100 км.`,
      );
    }

    if (input.averageEnergyConsumption !== null) {
      parts.push(
        `Ориентировочный расход энергии — ${input.averageEnergyConsumption} кВт⋅ч/100 км.`,
      );
    }

    for (const money of input.money) {
      parts.push(`Потрачено ${money.totalCost.toFixed(2)} ${money.currency}.`);

      if (money.discountAmount > 0) {
        parts.push(
          `За счёт скидок сэкономлено ${money.discountAmount.toFixed(2)} ${money.currency}.`,
        );
      }
    }

    if (input.odometerDistanceKm === null) {
      parts.push(
        "Для точного расчёта стоимости и расхода на 100 км пока недостаточно показаний пробега за этот период.",
      );
    }

    return parts.join(" ");
  }
}
