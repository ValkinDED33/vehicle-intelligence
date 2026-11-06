import { Module } from "@nestjs/common";
import { VinAccessController } from "./vin-access.controller";
import { VinAccessService } from "./vin-access.service";

@Module({ controllers: [VinAccessController], providers: [VinAccessService], exports: [VinAccessService] })
export class VinAccessModule {}
