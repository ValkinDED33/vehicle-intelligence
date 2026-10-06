import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Update } from "telegraf/types";

import { TelegramService } from "./telegram.service";

@Controller("telegram")
@SkipThrottle()
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post("webhook")
  @HttpCode(200)
  webhook(
    @Headers("x-telegram-bot-api-secret-token")
    secret: string | undefined,
    @Body() update: Update,
  ): { ok: true } {
    if (!this.telegramService.isValidSecret(secret)) {
      throw new UnauthorizedException("Invalid Telegram webhook secret");
    }

    this.telegramService.processUpdate(update);

    return { ok: true };
  }
}
