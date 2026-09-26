import { Injectable } from "@nestjs/common";

import { VehicleProfileService } from "../../vehicle-profile/services/vehicle-profile.service";
import { EnergyDbService } from "../energy.db.service";
import { type FullToFullConsumption } from "../energy.types";
import {
  parseEnergyDecimal,
  roundEnergyMoney,
  roundEnergyValue,
} from "../utils/energy-number.utils";

@Injectable()
export class EnergyConsumptionService {
  constructor(
    private readonly energyDbService: EnergyDbService,
    private readonly vehicleProfileService: VehicleProfileService,
  ) {}

  async calculateLatestFullToFull(
    ownerId: string,
    vehicleId: string,
  ): Promise<FullToFullConsumption | null> {
    const entries = await this.energyDbService.listForVehicle(vehicleId, {
      kind: "fuel",
    });

    const chronologicalEntries = [...entries].reverse();

    const fullTankIndexes: number[] = [];

    chronologicalEntries.forEach((entry, index) => {
      if (entry.isFullTank && entry.odometerKm !== null) {
        fullTankIndexes.push(index);
      }
    });

    if (fullTankIndexes.length < 2) {
      return null;
    }

    const endIndex = fullTankIndexes[fullTankIndexes.length - 1];
    const startIndex = fullTankIndexes[fullTankIndexes.length - 2];

    const startEntry = chronologicalEntries[startIndex];
    const endEntry = chronologicalEntries[endIndex];

    if (startEntry.odometerKm === null || endEntry.odometerKm === null) {
      return null;
    }

    const distanceKm = endEntry.odometerKm - startEntry.odometerKm;

    if (distanceKm <= 0) {
      return null;
    }

    const intervalEntries = chronologicalEntries.slice(
      startIndex + 1,
      endIndex + 1,
    );

    const fuelAddedLiters = roundEnergyValue(
      intervalEntries.reduce(
        (sum, entry) => sum + parseEnergyDecimal(entry.volumeLiters),
        0,
      ),
      3,
    );

    if (fuelAddedLiters <= 0) {
      return null;
    }

    const consumptionLitersPer100Km = roundEnergyValue(
      (fuelAddedLiters / distanceKm) * 100,
      2,
    );

    const currencies = new Set(
      intervalEntries
        .map((entry) => entry.currency)
        .filter((currency): currency is string => Boolean(currency)),
    );

    let totalCost: number | null = null;
    let currency: string | null = null;

    if (currencies.size === 1) {
      currency = Array.from(currencies)[0];

      totalCost = roundEnergyMoney(
        intervalEntries.reduce(
          (sum, entry) => sum + parseEnergyDecimal(entry.totalCost),
          0,
        ),
      );
    }

    const costPerKm =
      totalCost !== null ? roundEnergyValue(totalCost / distanceKm, 3) : null;

    const costPer100Km =
      totalCost !== null
        ? roundEnergyMoney((totalCost / distanceKm) * 100)
        : null;

    const profile = await this.vehicleProfileService.getCurrentProfile(
      ownerId,
      vehicleId,
    );

    const tankCapacityLiters = profile?.fuelTankCapacityLiters ?? null;

    const tankRefillPercent =
      tankCapacityLiters && tankCapacityLiters > 0
        ? roundEnergyValue(
            (parseEnergyDecimal(endEntry.volumeLiters) / tankCapacityLiters) *
              100,
            1,
          )
        : null;

    return {
      fromEntryId: startEntry.id,
      toEntryId: endEntry.id,

      fromOdometerKm: startEntry.odometerKm,
      toOdometerKm: endEntry.odometerKm,

      distanceKm,

      fuelAddedLiters,
      consumptionLitersPer100Km,

      totalCost,
      costPer100Km,
      costPerKm,

      currency,

      tankCapacityLiters,
      tankRefillPercent,
    };
  }
}
