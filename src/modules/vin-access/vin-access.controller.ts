import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { VinAccessService } from "./vin-access.service";

@Controller("vin-access")
@UseGuards(JwtAuthGuard)
export class VinAccessController {
  constructor(private readonly access: VinAccessService) {}
  @Get()
  status(@Req() request: { userId: string }) { return this.access.status(request.userId); }
}
