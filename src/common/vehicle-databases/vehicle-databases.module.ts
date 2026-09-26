import { HttpModule } from "@nestjs/axios";
import { Global, Module } from "@nestjs/common";

import { VehicleDatabasesClientService } from "./vehicle-databases-client.service";

@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 30_000,
      maxRedirects: 3,
    }),
  ],
  providers: [VehicleDatabasesClientService],
  exports: [VehicleDatabasesClientService],
})
export class VehicleDatabasesModule {}
