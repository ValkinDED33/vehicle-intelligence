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
  CreateMileageReadingDto,
  MileageHistoryQueryDto,
} from "../dto/mileage.dto";
import { MileageService } from "../services/mileage.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("vehicles/:vehicleId/mileage")
@UseGuards(JwtAuthGuard)
export class MileageController {
  constructor(private readonly mileageService: MileageService) {}

  @Post()
  recordReading(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Body() dto: CreateMileageReadingDto,
  ) {
    return this.mileageService.recordReading(request.userId, vehicleId, {
      odometerKm: dto.odometerKm,
      engineHours: dto.engineHours,
      source: dto.source,
      confidence: dto.confidence,
      recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : undefined,
    });
  }

  @Get("latest")
  getLatestReading(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.mileageService.getLatestReading(request.userId, vehicleId);
  }

  @Get("history")
  getHistory(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query() query: MileageHistoryQueryDto,
  ) {
    return this.mileageService.getHistory(request.userId, vehicleId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }

  @Get("stale")
  isStale(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.mileageService.isStale(request.userId, vehicleId);
  }
}
