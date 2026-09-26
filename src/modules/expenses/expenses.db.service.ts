import { Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import {
  type Expense,
  type NewExpense,
  expenses,
} from "./schemas/expense.schema";

export interface CreateExpenseData {
  vehicleId: string;

  category: string;
  subcategory?: string;

  title: string;
  description?: string;

  subtotalCost?: string;

  discountPercent?: string;
  discountAmount?: string;
  discountLabel?: string;

  totalCost: string;
  currency: string;

  odometerKm?: number;

  providerName?: string;
  documentNumber?: string;

  source?: string;

  occurredAt?: Date;
}

export interface ExpenseHistoryQuery {
  from?: Date;
  to?: Date;
  category?: string;
}

@Injectable()
export class ExpensesDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createExpense(data: CreateExpenseData): Promise<Expense> {
    const newExpense: NewExpense = {
      vehicleId: data.vehicleId,

      category: data.category.trim().toLowerCase(),

      subcategory: data.subcategory?.trim().toLowerCase() || null,

      title: data.title.trim(),

      description: data.description?.trim() || null,

      subtotalCost: data.subtotalCost ?? null,

      discountPercent: data.discountPercent ?? null,

      discountAmount: data.discountAmount ?? null,

      discountLabel: data.discountLabel?.trim() || null,

      totalCost: data.totalCost,

      currency: data.currency.trim().toUpperCase(),

      odometerKm: data.odometerKm ?? null,

      providerName: data.providerName?.trim() || null,

      documentNumber: data.documentNumber?.trim() || null,

      source: data.source ?? "manual",

      occurredAt: data.occurredAt ?? new Date(),
    };

    const [createdExpense] = await this.databaseService.connection
      .insert(expenses)
      .values(newExpense)
      .returning();

    if (!createdExpense) {
      throw new Error("Failed to persist expense");
    }

    return createdExpense;
  }

  async findByIdForVehicle(
    vehicleId: string,
    expenseId: string,
  ): Promise<Expense | null> {
    const [expense] = await this.databaseService.connection
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.vehicleId, vehicleId)))
      .limit(1);

    return expense ?? null;
  }

  async listForVehicle(
    vehicleId: string,
    query: ExpenseHistoryQuery = {},
  ): Promise<Expense[]> {
    const conditions = [eq(expenses.vehicleId, vehicleId)];

    if (query.from) {
      conditions.push(gte(expenses.occurredAt, query.from));
    }

    if (query.to) {
      conditions.push(lte(expenses.occurredAt, query.to));
    }

    if (query.category) {
      conditions.push(
        eq(expenses.category, query.category.trim().toLowerCase()),
      );
    }

    return this.databaseService.connection
      .select()
      .from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.occurredAt), desc(expenses.createdAt));
  }
}
