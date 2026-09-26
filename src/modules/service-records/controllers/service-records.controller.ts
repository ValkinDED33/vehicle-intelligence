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
  CreateServiceRecordDto,
  PartHistoryQueryDto,
  ServiceRecordHistoryQueryDto,
} from "../dto/service-records.dto";
import { ServiceRecordsService } from "../services/service-records.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("vehicles/:vehicleId/service-records")
@UseGuards(JwtAuthGuard)
export class ServiceRecordsController {
  constructor(private readonly serviceRecordsService: ServiceRecordsService) {}

  @Post()
  createRecord(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Body() dto: CreateServiceRecordDto,
  ) {
    return this.serviceRecordsService.createRecord(request.userId, vehicleId, {
      expenseId: dto.expenseId,

      type: dto.type,

      title: dto.title,
      description: dto.description,

      odometerKm: dto.odometerKm,
      engineHours: dto.engineHours,

      providerName: dto.providerName,
      documentNumber: dto.documentNumber,

      totalCost: dto.totalCost,
      currency: dto.currency,

      source: dto.source,

      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,

      items: dto.items?.map((item) => ({
        itemType: item.itemType,

        name: item.name,
        description: item.description,

        brand: item.brand,
        partNumber: item.partNumber,

        quantity: item.quantity,
        unit: item.unit,

        unitCost: item.unitCost,
        totalCost: item.totalCost,
        currency: item.currency,

        warrantyMonths: item.warrantyMonths,
        warrantyKm: item.warrantyKm,
      })),
    });
  }

  @Get()
  getHistory(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query() query: ServiceRecordHistoryQueryDto,
  ) {
    return this.serviceRecordsService.getHistory(request.userId, vehicleId, {
      from: query.from ? new Date(query.from) : undefined,

      to: query.to ? new Date(query.to) : undefined,

      type: query.type,
    });
  }

  @Get("parts/history")
  findPartHistory(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query() query: PartHistoryQueryDto,
  ) {
    return this.serviceRecordsService.findPartHistory(
      request.userId,
      vehicleId,
      query.partNumber,
    );
  }

  @Get(":recordId")
  getRecord(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Param("recordId") recordId: string,
  ) {
    return this.serviceRecordsService.getRecord(
      request.userId,
      vehicleId,
      recordId,
    );
  }
}
