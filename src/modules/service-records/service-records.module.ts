import { Module } from "@nestjs/common";

import { GarageModule } from "../garage/garage.module";
import { VehicleHistoryModule } from "../vehicle-history/vehicle-history.module";

import { ServiceRecordsController } from "./controllers/service-records.controller";
import { ServiceRecordsDbService } from "./service-records.db.service";
import { ServiceRecordItemPreparerService } from "./services/service-record-item-preparer.service";
import { ServiceRecordValidatorService } from "./services/service-record-validator.service";
import { ServiceRecordsService } from "./services/service-records.service";

@Module({
  imports: [
    GarageModule,
    VehicleHistoryModule,

  ],

  controllers: [ServiceRecordsController],

  providers: [
    ServiceRecordsDbService,
    ServiceRecordValidatorService,
    ServiceRecordItemPreparerService,
    ServiceRecordsService,
  ],

  exports: [ServiceRecordsService],
})
export class ServiceRecordsModule {}
