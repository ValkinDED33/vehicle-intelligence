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
import { VehicleDatabasesSourcesService } from "../services/vehicle-databases-sources.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("vehicles/:vehicleId/external-reports")
@UseGuards(JwtAuthGuard)
export class ExternalReportsController {
  constructor(
    private readonly externalReportsService: ExternalReportsService,
    private readonly vehicleDatabasesSourcesService: VehicleDatabasesSourcesService,
  ) {}

  @Get("sources")
  listSources() {
    return this.vehicleDatabasesSourcesService.listSources();
  }

  @Post("sources")
  fetchAllSources(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.vehicleDatabasesSourcesService.fetchAllSources(
      request.userId,
      vehicleId,
    );
  }

  @Post("sources/:source")
  fetchSource(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Param("source") source: string,
  ) {
    return this.vehicleDatabasesSourcesService.fetchSource(
      request.userId,
      vehicleId,
      source,
    );
  }

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
