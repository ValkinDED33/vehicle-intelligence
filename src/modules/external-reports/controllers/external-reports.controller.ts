import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { ExternalReportsService } from "../services/external-reports.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("vehicles/:vehicleId/external-reports")
@UseGuards(JwtAuthGuard)
export class ExternalReportsController {
  constructor(
    private readonly externalReportsService: ExternalReportsService,
  ) {}

  @Post("vehicle-history")
  fetchVehicleHistory(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.externalReportsService.fetchVehicleHistory(
      request.userId,
      vehicleId,
    );
  }

  @Get("vehicle-history")
  getLatestVehicleHistory(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.externalReportsService.getLatestVehicleHistory(
      request.userId,
      vehicleId,
    );
  }

  @Get()
  getReports(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query("type") type?: string,
  ) {
    return this.externalReportsService.getReports(
      request.userId,
      vehicleId,
      type,
    );
  }
}
