import { BadRequestException, Injectable } from "@nestjs/common";

import { EnergyService } from "../../energy/services/energy.service";
import { MileageService } from "../../mileage/services/mileage.service";
import { ExpensesDbService } from "../expenses.db.service";
import {
  type CostOfOwnershipCurrencySummary,
  type MonthlyCostOfOwnershipSummary,
} from "../expenses.types";
import {
  parseExpenseDecimal,
  roundExpenseMoney,
  roundExpenseValue,
} from "../utils/expense-number.utils";

import { CostOfOwnershipMessageBuilderService } from "./cost-of-ownership-message-builder.service";

@Injectable()
export class CostOfOwnershipService {
  constructor(
    private readonly expensesDbService: ExpensesDbService,
    private readonly energyService: EnergyService,
    private readonly mileageService: MileageService,
    private readonly messageBuilder: CostOfOwnershipMessageBuilderService,
  ) {}

  async getMonthly(
    ownerId: string,
    vehicleId: string,
    year: number,
    month: number,
  ): Promise<MonthlyCostOfOwnershipSummary> {
    if (month < 1 || month > 12) {
      throw new BadRequestException("Месяц должен быть от 1 до 12");
    }

    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));

    const [expenses, energySummary, mileageHistory] = await Promise.all([
      this.expensesDbService.listForVehicle(vehicleId, { from, to }),
      this.energyService.getMonthlySummary(ownerId, vehicleId, year, month),
      this.mileageService.getHistory(ownerId, vehicleId, { from, to }),
    ]);

    const chronologicalMileage = [...mileageHistory].reverse();

    let distanceKm: number | null = null;

    if (chronologicalMileage.length >= 2) {
      const first = chronologicalMileage[0];
      const last = chronologicalMileage[chronologicalMileage.length - 1];
      const calculatedDistance = last.odometerKm - first.odometerKm;

      if (calculatedDistance >= 0) {
        distanceKm = calculatedDistance;
      }
    }

    const currencyMap = new Map<string, CostOfOwnershipCurrencySummary>();

    for (const expense of expenses) {
      const summary = this.getOrCreateCurrencySummary(
        currencyMap,
        expense.currency,
      );

      const totalCost = parseExpenseDecimal(expense.totalCost);
      const discountAmount = parseExpenseDecimal(expense.discountAmount);

      summary.expenseCost += totalCost;
      summary.expenseDiscountSavings += discountAmount;

      const existingCategory = summary.categories.find(
        (item) => item.category === expense.category,
      );

      if (existingCategory) {
        existingCategory.totalCost += totalCost;
      } else {
        summary.categories.push({
          category: expense.category,
          totalCost,
        });
      }
    }

    for (const energyMoney of energySummary.money) {
      const summary = this.getOrCreateCurrencySummary(
        currencyMap,
        energyMoney.currency,
      );

      summary.energyCost += energyMoney.totalCost;
      summary.energyDiscountSavings += energyMoney.discountAmount;

      const existingEnergyCategory = summary.categories.find(
        (item) => item.category === "energy",
      );

      if (existingEnergyCategory) {
        existingEnergyCategory.totalCost += energyMoney.totalCost;
      } else {
        summary.categories.push({
          category: "energy",
          totalCost: energyMoney.totalCost,
        });
      }
    }

    const currencies = Array.from(currencyMap.values()).map((summary) => {
      summary.expenseCost = roundExpenseMoney(summary.expenseCost);
      summary.energyCost = roundExpenseMoney(summary.energyCost);

      summary.totalCost = roundExpenseMoney(
        summary.expenseCost + summary.energyCost,
      );

      summary.expenseDiscountSavings = roundExpenseMoney(
        summary.expenseDiscountSavings,
      );

      summary.energyDiscountSavings = roundExpenseMoney(
        summary.energyDiscountSavings,
      );

      summary.totalDiscountSavings = roundExpenseMoney(
        summary.expenseDiscountSavings + summary.energyDiscountSavings,
      );

      summary.categories = summary.categories
        .map((item) => ({
          category: item.category,
          totalCost: roundExpenseMoney(item.totalCost),
        }))
        .sort((a, b) => b.totalCost - a.totalCost);

      summary.costPerKm =
        distanceKm !== null && distanceKm > 0
          ? roundExpenseValue(summary.totalCost / distanceKm, 3)
          : null;

      summary.costPer100Km =
        distanceKm !== null && distanceKm > 0
          ? roundExpenseMoney((summary.totalCost / distanceKm) * 100)
          : null;

      return summary;
    });

    return {
      year,
      month,
      distanceKm,
      currencies,
      message: this.messageBuilder.build(distanceKm, currencies),
    };
  }

  private getOrCreateCurrencySummary(
    map: Map<string, CostOfOwnershipCurrencySummary>,
    currency: string,
  ): CostOfOwnershipCurrencySummary {
    const existing = map.get(currency);

    if (existing) {
      return existing;
    }

    const created: CostOfOwnershipCurrencySummary = {
      currency,
      expenseCost: 0,
      energyCost: 0,
      totalCost: 0,
      expenseDiscountSavings: 0,
      energyDiscountSavings: 0,
      totalDiscountSavings: 0,
      categories: [],
      costPerKm: null,
      costPer100Km: null,
    };

    map.set(currency, created);

    return created;
  }
}
