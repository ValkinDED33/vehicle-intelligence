import { Module } from "@nestjs/common";

import { ExternalReportsDbService } from "./external-reports.db.service";

@Module({
  providers: [ExternalReportsDbService],
  exports: [ExternalReportsDbService],
})
export class ExternalReportsModule {}
