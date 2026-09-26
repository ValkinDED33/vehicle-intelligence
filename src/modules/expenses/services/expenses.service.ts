import { Injectable } from "@nestjs/common";

import { GarageService } from "../../garage/services/garage.service";
import { VehicleHistoryService } from "../../vehicle-history/services/vehicle-history.service";
import {
  ExpensesDbService,
  type ExpenseHistoryQuery,
} from "../expenses.db.service";
import {
  type CreateExpenseInput,
  type ExpenseView,
  type MonthlyCostOfOwnershipSummary,
} from "../expenses.types";
import { type Expense } from "../schemas/expense.schema";
import { toExpenseDecimalString } from "../utils/expense-number.utils";

import { CostOfOwnershipService } from "./cost-of-ownership.service";
import { ExpenseCostCalculatorService } from "./expense-cost-calculator.service";
import { ExpenseEntryValidatorService } from "./expense-entry-validator.service";

@Injectable()
export class ExpensesService {
  constructor(
    private readonly garageService: GarageService,
    private readonly expensesDbService: ExpensesDbService,
    private readonly vehicleHistoryService: VehicleHistoryService,
    private readonly validator: ExpenseEntryValidatorService,
    private readonly costCalculator: ExpenseCostCalculatorService,
    private readonly costOfOwnershipService: CostOfOwnershipService,
  ) {}

  async createExpense(
    ownerId: string,
    vehicleId: string,
    input: CreateExpenseInput,
  ): Promise<ExpenseView> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    this.validator.validate(input);

    const calculated = this.costCalculator.calculate(input);

    const expense = await this.expensesDbService.createExpense({
      vehicleId,
      category: input.category,
      subcategory: input.subcategory,
      title: input.title,
      description: input.description,

      subtotalCost:
        calculated.subtotalCost !== null
          ? toExpenseDecimalString(calculated.subtotalCost, 2)
          : undefined,

      discountPercent:
        calculated.discountPercent !== null
          ? toExpenseDecimalString(calculated.discountPercent, 2)
          : undefined,

      discountAmount:
        calculated.discountAmount !== null
          ? toExpenseDecimalString(calculated.discountAmount, 2)
          : undefined,

      discountLabel: input.discountLabel,

      totalCost: toExpenseDecimalString(calculated.totalCost, 2),

      currency: input.currency,
      odometerKm: input.odometerKm,

      providerName: input.providerName,
      documentNumber: input.documentNumber,

      source: input.source ?? "manual",
      occurredAt: input.occurredAt,
    });

    await this.vehicleHistoryService.recordEvent(ownerId, vehicleId, {
      type: "expense.recorded",
      sourceModule: "expenses",
      origin: this.mapSourceToOrigin(input.source ?? "manual"),
      mileageKm: input.odometerKm,
      confidence: 1,
      occurredAt: input.occurredAt ?? new Date(),
      payload: {
        expenseId: expense.id,
        category: input.category,
        subcategory: input.subcategory ?? null,
        title: input.title,
        subtotalCost: calculated.subtotalCost,
        discountPercent: calculated.discountPercent,
        discountAmount: calculated.discountAmount,
        discountLabel: input.discountLabel ?? null,
        totalCost: calculated.totalCost,
        currency: input.currency.toUpperCase(),
        providerName: input.providerName ?? null,
        documentNumber: input.documentNumber ?? null,
      },
    });

    return {
      expense,
      calculations: {
        subtotalCost: calculated.subtotalCost,
        discountPercent: calculated.discountPercent,
        discountAmount: calculated.discountAmount,
        totalCost: calculated.totalCost,
        savings: calculated.discountAmount,
      },
    };
  }

  async getHistory(
    ownerId: string,
    vehicleId: string,
    query: ExpenseHistoryQuery = {},
  ): Promise<Expense[]> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.expensesDbService.listForVehicle(vehicleId, query);
  }

  async getMonthlyCostOfOwnership(
    ownerId: string,
    vehicleId: string,
    year: number,
    month: number,
  ): Promise<MonthlyCostOfOwnershipSummary> {
    await this.garageService.getVehicle(ownerId, vehicleId);

    return this.costOfOwnershipService.getMonthly(
      ownerId,
      vehicleId,
      year,
      month,
    );
  }

  private mapSourceToOrigin(
    source: string,
  ): "telegram" | "web" | "ocr" | "ai-inferred" | "system" {
    switch (source) {
      case "telegram":
        return "telegram";

      case "receipt":
      case "ocr":
        return "ocr";

      case "ai":
      case "ai-inferred":
        return "ai-inferred";

      case "integration":
      case "system":
        return "system";

      case "manual":
      case "web":
      default:
        return "web";
    }
  }
}
