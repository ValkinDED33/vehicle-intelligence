import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { VinService } from "../services/vin.service";

@Controller("vin/checks")
@UseGuards(JwtAuthGuard)
export class StandaloneVinController {
  constructor(private readonly vin: VinService) {}
  @Get()
  list(@Req() request: { userId: string }) { return this.vin.getStandaloneChecks(request.userId); }
}
