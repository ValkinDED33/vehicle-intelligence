import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { VinService } from "../services/vin.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("vehicles/:vehicleId/vin")
@UseGuards(JwtAuthGuard)
export class VinController {
  constructor(private readonly vinService: VinService) {}

  @Post("decode")
  decodeVehicleVin(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.vinService.decodeVehicleVin(request.userId, vehicleId);
  }

  @Get("latest")
  getLatestDecode(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.vinService.getLatestDecode(request.userId, vehicleId);
  }

  @Get("history")
  getDecodeHistory(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.vinService.getDecodeHistory(request.userId, vehicleId);
  }
}
