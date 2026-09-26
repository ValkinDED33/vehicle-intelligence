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
  CreateEnergyEntryDto,
  EnergyHistoryQueryDto,
  MonthlyEnergySummaryQueryDto,
} from "../dto/energy.dto";
import { EnergyService } from "../services/energy.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("vehicles/:vehicleId/energy")
@UseGuards(JwtAuthGuard)
export class EnergyController {
  constructor(private readonly energyService: EnergyService) {}

  @Post()
  createEntry(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Body() dto: CreateEnergyEntryDto,
  ) {
    return this.energyService.createEntry(request.userId, vehicleId, {
      kind: dto.kind,
      energyType: dto.energyType,

      volumeLiters: dto.volumeLiters,
      energyKwh: dto.energyKwh,

      unitPrice: dto.unitPrice,

      subtotalCost: dto.subtotalCost,
      discountPercent: dto.discountPercent,
      discountAmount: dto.discountAmount,
      discountLabel: dto.discountLabel,

      totalCost: dto.totalCost,
      currency: dto.currency,

      odometerKm: dto.odometerKm,

      isFullTank: dto.isFullTank,

      providerName: dto.providerName,
      source: dto.source,

      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
    });
  }

  @Get()
  getHistory(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query() query: EnergyHistoryQueryDto,
  ) {
    return this.energyService.getHistory(request.userId, vehicleId, {
      from: query.from ? new Date(query.from) : undefined,

      to: query.to ? new Date(query.to) : undefined,

      energyType: query.energyType,
      kind: query.kind,

      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get("latest")
  getLatest(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.energyService.getLatest(request.userId, vehicleId);
  }

  @Get("full-to-full")
  getLatestFullToFullConsumption(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.energyService.calculateLatestFullToFullConsumption(
      request.userId,
      vehicleId,
    );
  }

  @Get("monthly-summary")
  getMonthlySummary(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query() query: MonthlyEnergySummaryQueryDto,
  ) {
    return this.energyService.getMonthlySummary(
      request.userId,
      vehicleId,
      query.year,
      query.month,
    );
  }
}
