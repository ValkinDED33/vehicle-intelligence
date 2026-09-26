import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { CreateVehicleProfileDto } from "../dto/create-vehicle-profile.dto";
import { VehicleProfileService } from "../services/vehicle-profile.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("vehicles/:vehicleId/profile")
@UseGuards(JwtAuthGuard)
export class VehicleProfileController {
  constructor(private readonly vehicleProfileService: VehicleProfileService) {}

  @Get("current")
  getCurrentProfile(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.vehicleProfileService.getCurrentProfile(
      request.userId,
      vehicleId,
    );
  }

  @Get("history")
  getProfileHistory(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.vehicleProfileService.getProfileHistory(
      request.userId,
      vehicleId,
    );
  }

  @Post()
  createProfileVersion(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Body() dto: CreateVehicleProfileDto,
  ) {
    return this.vehicleProfileService.createProfileVersion(
      request.userId,
      vehicleId,
      dto,
    );
  }
}
