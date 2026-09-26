import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { CreateMaintenanceRuleDto } from "../dto/maintenance.dto";
import { MaintenanceService } from "../services/maintenance.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("vehicles/:vehicleId/maintenance")
@UseGuards(JwtAuthGuard)
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post("rules")
  createRule(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Body() dto: CreateMaintenanceRuleDto,
  ) {
    return this.maintenanceService.createRule(request.userId, vehicleId, {
      key: dto.key,
      title: dto.title,
      source: dto.source,

      intervalKm: dto.intervalKm,
      intervalMonths: dto.intervalMonths,
      intervalEngineHours: dto.intervalEngineHours,

      warningKmBefore: dto.warningKmBefore,
      warningDaysBefore: dto.warningDaysBefore,
      warningEngineHoursBefore: dto.warningEngineHoursBefore,

      completionEventType: dto.completionEventType,
    });
  }

  @Get("rules")
  listRules(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.maintenanceService.listRules(request.userId, vehicleId);
  }

  @Delete("rules/:ruleId")
  deactivateRule(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
    @Param("ruleId") ruleId: string,
  ) {
    return this.maintenanceService.deactivateRule(
      request.userId,
      vehicleId,
      ruleId,
    );
  }

  @Get("status")
  getStatus(
    @Req() request: AuthenticatedRequest,
    @Param("vehicleId") vehicleId: string,
  ) {
    return this.maintenanceService.getStatus(request.userId, vehicleId);
  }
}
