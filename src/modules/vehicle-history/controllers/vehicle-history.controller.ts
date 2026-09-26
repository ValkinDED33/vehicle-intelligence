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
  CreateVehicleHistoryEventDto,
  VehicleHistoryQueryDto,
} from "../dto/vehicle-history.dto";
import { VehicleHistoryService } from "../services/vehicle-history.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("vehicles/:vehicleId/history")
@UseGuards(JwtAuthGuard)
export class VehicleHistoryController {
  constructor(private readonly vehicleHistoryService: VehicleHistoryService) {}

  @Get()
  getHistory(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query() query: VehicleHistoryQueryDto,
  ) {
    return this.vehicleHistoryService.getHistory(request.userId, vehicleId, {
      type: query.type,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get("latest")
  getLatestEvent(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query("type") type?: string,
  ) {
    return this.vehicleHistoryService.getLatestEvent(
      request.userId,
      vehicleId,
      type,
    );
  }

  @Post()
  recordEvent(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Body() dto: CreateVehicleHistoryEventDto,
  ) {
    return this.vehicleHistoryService.recordEvent(request.userId, vehicleId, {
      type: dto.type,
      sourceModule: dto.sourceModule,
      origin: dto.origin,
      mileageKm: dto.mileageKm,
      confidence: dto.confidence,
      payload: dto.payload,
      attachments: dto.attachments,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      eventId: dto.eventId,
    });
  }
}
