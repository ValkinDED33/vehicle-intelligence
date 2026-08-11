import { Global, Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { DatabaseService } from "../database/database.service";

@Global()
@Module({
  imports: [],
  controllers: [HealthController],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class HealthModule {}
