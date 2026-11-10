import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { IsString, Matches } from "class-validator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { VehicleArtworkService } from "./vehicle-artwork.service";

export class EnsureArtworkDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) fingerprint!: string;
}
@Controller("vehicles/:vehicleId/artwork")
@UseGuards(JwtAuthGuard)
export class VehicleArtworkController {
  constructor(private readonly artwork: VehicleArtworkService) {}
  @Get() @Header("Cache-Control", "private, no-store")
  current(@Req() req: { userId: string }, @Param("vehicleId", ParseUUIDPipe) id: string) { return this.artwork.current(req.userId, id); }
  @Post() @Header("Cache-Control", "private, no-store")
  ensure(@Req() req: { userId: string }, @Param("vehicleId", ParseUUIDPipe) id: string, @Body() dto: EnsureArtworkDto) { return this.artwork.ensure(req.userId, id, dto.fingerprint); }
}
