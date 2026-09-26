import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import {
  CreateExpenseDto,
  ExpenseHistoryQueryDto,
  MonthlyCostOfOwnershipQueryDto,
} from "../dto/expenses.dto";
import { ExpensesService } from "../services/expenses.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("vehicles/:vehicleId/expenses")
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  createExpense(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.createExpense(request.userId, vehicleId, {
      category: dto.category,
      subcategory: dto.subcategory,

      title: dto.title,
      description: dto.description,

      subtotalCost: dto.subtotalCost,

      discountPercent: dto.discountPercent,
      discountAmount: dto.discountAmount,
      discountLabel: dto.discountLabel,

      totalCost: dto.totalCost,
      currency: dto.currency,

      odometerKm: dto.odometerKm,

      providerName: dto.providerName,
      documentNumber: dto.documentNumber,

      source: dto.source,

      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
    });
  }

  @Get()
  getHistory(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query() query: ExpenseHistoryQueryDto,
  ) {
    return this.expensesService.getHistory(request.userId, vehicleId, {
      from: query.from ? new Date(query.from) : undefined,

      to: query.to ? new Date(query.to) : undefined,

      category: query.category,
    });
  }

  @Get("monthly-summary")
  getMonthlyCostOfOwnership(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query() query: MonthlyCostOfOwnershipQueryDto,
  ) {
    return this.expensesService.getMonthlyCostOfOwnership(
      request.userId,
      vehicleId,
      query.year,
      query.month,
    );
  }
}
