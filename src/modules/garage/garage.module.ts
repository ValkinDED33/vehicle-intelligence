import { Module } from "@nestjs/common";

import { GarageController } from "./controllers/garage.controller";
import { GarageDbService } from "./garage.db.service";
import { GarageService } from "./services/garage.service";

@Module({
  imports: [
  ],
  controllers: [GarageController],
  providers: [GarageDbService, GarageService],
  exports: [GarageService],
})
export class GarageModule {}
