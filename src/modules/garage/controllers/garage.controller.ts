import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { CreateVehicleDto } from "../dto/create-vehicle.dto";
import { GarageQueryDto } from "../dto/garage-query.dto";
import { UpdateVehicleDto } from "../dto/update-vehicle.dto";
import { GarageService } from "../services/garage.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("garage/vehicles")
@UseGuards(JwtAuthGuard)
export class GarageController {
  constructor(private readonly garageService: GarageService) {}

  @Get()
  getVehicles(
    @Req() request: AuthenticatedRequest,
    @Query() query: GarageQueryDto,
  ) {
    return this.garageService.getVehicles(
      request.userId,
      query.includeArchived ?? false,
    );
  }

  @Get(":id")
  getVehicle(
    @Req() request: AuthenticatedRequest,
    @Param("id") vehicleId: string,
  ) {
    return this.garageService.getVehicle(request.userId, vehicleId);
  }

  @Post()
  createVehicle(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateVehicleDto,
  ) {
    return this.garageService.createVehicle(request.userId, dto);
  }

  @Patch(":id")
  updateVehicle(
    @Req() request: AuthenticatedRequest,
    @Param("id") vehicleId: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.garageService.updateVehicle(request.userId, vehicleId, dto);
  }

  @Patch(":id/archive")
  archiveVehicle(
    @Req() request: AuthenticatedRequest,
    @Param("id") vehicleId: string,
  ) {
    return this.garageService.archiveVehicle(request.userId, vehicleId);
  }

  @Patch(":id/restore")
  restoreVehicle(
    @Req() request: AuthenticatedRequest,
    @Param("id") vehicleId: string,
  ) {
    return this.garageService.restoreVehicle(request.userId, vehicleId);
  }
}
