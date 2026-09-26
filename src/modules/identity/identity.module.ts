import { Module } from "@nestjs/common";

import { AuthController } from "./controllers/auth.controller";
import { IdentityDbService } from "./identity.db.service";
import { AuthService } from "./services/auth.service";

@Module({
  imports: [
  ],
  controllers: [AuthController],
  providers: [IdentityDbService, AuthService],
  exports: [AuthService],
})
export class IdentityModule {}
