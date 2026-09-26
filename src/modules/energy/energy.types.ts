import { type EnergyEntry } from "./schemas/energy-entry.schema";

export interface CreateEnergyEntryInput {
  kind: "fuel" | "charge";
  energyType: string;

  volumeLiters?: number;
  energyKwh?: number;

  unitPrice?: number;

  subtotalCost?: number;
  discountPercent?: number;
  discountAmount?: number;
  discountLabel?: string;

  totalCost?: number;
  currency?: string;

  odometerKm?: number;

  isFullTank?: boolean;

  providerName?: string;
  source?: string;

  occurredAt?: Date;
}

export interface EnergyEntryView {
  entry: EnergyEntry;

  calculations: {
    subtotalCost: number | null;
    discountPercent: number | null;
    discountAmount: number | null;
    totalCost: number | null;
    savings: number | null;
  };
}

export interface FullToFullConsumption {
  fromEntryId: string;
  toEntryId: string;

  fromOdometerKm: number;
  toOdometerKm: number;

  distanceKm: number;
  fuelAddedLiters: number;
  consumptionLitersPer100Km: number;

  totalCost: number | null;
  costPer100Km: number | null;
  costPerKm: number | null;

  currency: string | null;

  tankCapacityLiters: number | null;
  tankRefillPercent: number | null;
}

export interface MonthlyEnergyMoneySummary {
  currency: string;

  subtotalCost: number;
  discountAmount: number;
  totalCost: number;
}

export interface MonthlyEnergySummary {
  year: number;
  month: number;

  entriesCount: number;

  fuelLiters: number;
  energyKwh: number;

  fullTankRefuels: number;

  money: MonthlyEnergyMoneySummary[];

  odometerDistanceKm: number | null;

  averageFuelConsumptionLitersPer100Km: number | null;
  averageEnergyConsumptionKwhPer100Km: number | null;

  tankCapacityLiters: number | null;

  message: string;
}

export interface EnergyCostCalculation {
  subtotalCost: number | null;
  discountPercent: number | null;
  discountAmount: number | null;
  totalCost: number | null;
}
