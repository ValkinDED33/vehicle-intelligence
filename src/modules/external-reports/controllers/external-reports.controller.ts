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
import { CepikReportsService } from "../services/cepik-reports.service";
import { ExternalReportsService } from "../services/external-reports.service";
import { OneAutoReportsService } from "../services/one-auto-reports.service";
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
    private readonly cepikReportsService: CepikReportsService,
    private readonly oneAutoReportsService: OneAutoReportsService,
  ) {}

  @Get("sources")
  listSources() {
    return [
      ...this.vehicleDatabasesSourcesService.listSources(),
      ...this.oneAutoReportsService.listSources(),
    ];
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

  @Post("cepik/vehicles")
  fetchCepikVehicles(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query("wojewodztwo") wojewodztwo: string,
    @Query("dataOd") dataOd: string,
    @Query("dataDo") dataDo?: string,
    @Query("typDaty") typDaty?: "1" | "2",
    @Query("tylkoZarejestrowane") tylkoZarejestrowane?: string,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
  ) {
    return this.cepikReportsService.fetchVehicles(request.userId, vehicleId, {
      wojewodztwo,
      dataOd,
      dataDo,
      typDaty,
      tylkoZarejestrowane: tylkoZarejestrowane !== "false",
      limit,
      page,
    });
  }

  @Post("cepik/vehicles/:cepikRecord")
  fetchCepikVehicleById(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Param("cepikRecord") cepikRecord: string,
  ) {
    return this.cepikReportsService.fetchVehicleByCepikId(
      request.userId,
      vehicleId,
      cepikRecord,
    );
  }

  @Get("cepik/dictionaries")
  listCepikDictionaries(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
  ) {
    return this.cepikReportsService.listDictionaries(
      request.userId,
      vehicleId,
      limit,
      page,
    );
  }

  @Get("cepik/dictionaries/:name")
  getCepikDictionary(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Param("name") name: string,
  ) {
    return this.cepikReportsService.getDictionary(
      request.userId,
      vehicleId,
      name,
    );
  }

  @Post("oneauto/sources/:source")
  fetchOneAutoSource(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Param("source") source: string,
  ) {
    return this.oneAutoReportsService.fetchSource(
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
