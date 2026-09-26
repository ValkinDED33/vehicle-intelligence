import { Module } from "@nestjs/common";

import { ObjectStorageModule } from "../object-storage/object-storage.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [ObjectStorageModule],

  controllers: [HealthController],
})
export class HealthModule {}
