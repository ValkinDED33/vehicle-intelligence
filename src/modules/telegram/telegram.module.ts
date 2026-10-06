import { Module } from "@nestjs/common";

import { VinModule } from "../vin/vin.module";

import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";

@Module({
  imports: [VinModule],
  controllers: [TelegramController],
  providers: [TelegramService],
})
export class TelegramModule {}
