import { Module } from "@nestjs/common";

import { GarageModule } from "../garage/garage.module";
import { MaintenanceModule } from "../maintenance/maintenance.module";
import { MileageModule } from "../mileage/mileage.module";
import { VehicleProfileModule } from "../vehicle-profile/vehicle-profile.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";

@Module({
  imports: [GarageModule, VehicleProfileModule, MileageModule, MaintenanceModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
