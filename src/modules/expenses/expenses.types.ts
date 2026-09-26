import { type Expense } from "./schemas/expense.schema";

export interface CreateExpenseInput {
  category: string;
  subcategory?: string;

  title: string;
  description?: string;

  subtotalCost?: number;

  discountPercent?: number;
  discountAmount?: number;
  discountLabel?: string;

  totalCost?: number;

  currency: string;

  odometerKm?: number;

  providerName?: string;
  documentNumber?: string;

  source?: string;

  occurredAt?: Date;
}

export interface ExpenseView {
  expense: Expense;

  calculations: {
    subtotalCost: number | null;
    discountPercent: number | null;
    discountAmount: number | null;
    totalCost: number;
    savings: number | null;
  };
}

export interface ExpenseCostCalculation {
  subtotalCost: number | null;
  discountPercent: number | null;
  discountAmount: number | null;
  totalCost: number;
}

export interface CostOfOwnershipCategorySummary {
  category: string;
  totalCost: number;
}

export interface CostOfOwnershipCurrencySummary {
  currency: string;

  expenseCost: number;
  energyCost: number;
  totalCost: number;

  expenseDiscountSavings: number;
  energyDiscountSavings: number;
  totalDiscountSavings: number;

  categories: CostOfOwnershipCategorySummary[];

  costPerKm: number | null;
  costPer100Km: number | null;
}

export interface MonthlyCostOfOwnershipSummary {
  year: number;
  month: number;

  distanceKm: number | null;

  currencies: CostOfOwnershipCurrencySummary[];

  message: string;
}
