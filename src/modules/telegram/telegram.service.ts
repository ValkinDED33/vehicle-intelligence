import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Markup, Telegraf } from "telegraf";
import type { Update } from "telegraf/types";

import { VinService } from "../vin/services/vin.service";

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private bot?: Telegraf;

  constructor(
    private readonly configService: ConfigService,
    private readonly vinService: VinService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.token || !this.webhookUrl || !this.webhookSecret) {
      this.logger.warn(
        "Telegram disabled: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET are required",
      );

      return;
    }

    this.bot = new Telegraf(this.token);

    this.registerHandlers();

    this.bot.catch((error) => {
      this.logger.error(
        `Telegram error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    await this.bot.telegram.setMyCommands([
      {
        command: "start",
        description: "Запустить IA-CARS",
      },
      {
        command: "vin",
        description: "Проверить автомобиль по VIN",
      },
      {
        command: "website",
        description: "Открыть IA-CARS",
      },
      {
        command: "help",
        description: "Помощь",
      },
    ]);

    await this.bot.telegram.setWebhook(this.webhookUrl, {
      secret_token: this.webhookSecret,
      allowed_updates: ["message"],
    });

    this.logger.log(`Telegram webhook connected: ${this.webhookUrl}`);
  }

  processUpdate(update: Update): void {
    if (!this.bot) {
      this.logger.warn("Telegram bot is not initialized");
      return;
    }

    void this.bot.handleUpdate(update);
  }

  isValidSecret(secret: string | undefined): boolean {
    return Boolean(
      secret && this.webhookSecret && secret === this.webhookSecret,
    );
  }

  private registerHandlers(): void {
    if (!this.bot) return;

    this.bot.start(async (ctx) => {
      await ctx.reply(
        [
          "🚗 IA-CARS · Vehicle Intelligence",
          "",
          "Умная проверка автомобиля по VIN и единый цифровой профиль машины.",
          "",
          "Команды:",
          "/vin VIN — проверить VIN",
          "/website — открыть IA-CARS",
          "/help — помощь",
        ].join("\n"),
        this.websiteButton,
      );
    });

    this.bot.command("help", async (ctx) => {
      await ctx.reply(
        [
          "🔎 Проверка автомобиля по VIN",
          "",
          "Использование:",
          "/vin WBA12345678901234",
          "",
          "VIN должен содержать 17 символов.",
        ].join("\n"),
        this.websiteButton,
      );
    });

    this.bot.command("website", async (ctx) => {
      await ctx.reply("🚗 Открыть IA-CARS:", this.websiteButton);
    });

    this.bot.command("vin", async (ctx) => {
      const vin = ctx.message.text
        .replace(/^\/vin(?:@\w+)?/i, "")
        .trim()
        .toUpperCase();

      if (!vin) {
        await ctx.reply(
          "Отправь VIN после команды.\n\nПример:\n/vin WBA12345678901234",
        );
        return;
      }

      if (!VIN_REGEX.test(vin)) {
        await ctx.reply(
          "❌ VIN должен содержать ровно 17 символов. Буквы I, O и Q не используются.",
        );
        return;
      }

      if (!this.vinLookupEnabled) {
        await ctx.reply(
          [
            `✅ VIN распознан: ${vin}`,
            "",
            "Реальные запросы к VIN-провайдеру пока выключены.",
            "Мы включим их после проверки Telegram-интеграции.",
          ].join("\n"),
          this.websiteButton,
        );

        return;
      }

      await ctx.reply(`🔎 Проверяю VIN ${vin}…`);

      try {
        const result = await this.vinService.decodeStandaloneVin(vin);

        const response = [
          "✅ IA-CARS нашёл данные",
          "",
          `VIN: ${vin}`,
          result.make ? `Марка: ${result.make}` : null,
          result.model ? `Модель: ${result.model}` : null,
          result.modelYear ? `Год: ${result.modelYear}` : null,
          result.engineCode ? `Двигатель: ${result.engineCode}` : null,
          result.displacementCc ? `Объём: ${result.displacementCc} см³` : null,
          result.powerHp ? `Мощность: ${result.powerHp} л.с.` : null,
          result.fuelType ? `Топливо: ${result.fuelType}` : null,
          result.transmissionType ? `КПП: ${result.transmissionType}` : null,
          result.driveType ? `Привод: ${result.driveType}` : null,
          "",
          "Полный профиль автомобиля — в IA-CARS.",
        ]
          .filter((line): line is string => line !== null)
          .join("\n");

        await ctx.reply(response, this.websiteButton);
      } catch (error) {
        this.logger.warn(
          `Telegram VIN lookup failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        await ctx.reply(
          "❌ Не удалось получить данные по этому VIN. Попробуй позже или открой IA-CARS.",
          this.websiteButton,
        );
      }
    });

    this.bot.on("text", async (ctx) => {
      await ctx.reply(
        "Используй /vin для проверки VIN или /help для списка команд.",
        this.websiteButton,
      );
    });
  }

  private get websiteButton() {
    return Markup.inlineKeyboard([
      [Markup.button.url("🚗 Открыть IA-CARS", this.webAppUrl)],
    ]);
  }

  private get token(): string {
    return this.configService.get<string>("TELEGRAM_BOT_TOKEN")?.trim() ?? "";
  }

  private get webhookSecret(): string {
    return (
      this.configService.get<string>("TELEGRAM_WEBHOOK_SECRET")?.trim() ?? ""
    );
  }

  private get webhookUrl(): string {
    return this.configService.get<string>("TELEGRAM_WEBHOOK_URL")?.trim() ?? "";
  }

  private get webAppUrl(): string {
    return (
      this.configService.get<string>("TELEGRAM_WEB_APP_URL")?.trim() ||
      "https://vehicle-intelligence-nu.vercel.app"
    );
  }

  private get vinLookupEnabled(): boolean {
    return (
      this.configService
        .get<string>("TELEGRAM_VIN_LOOKUP_ENABLED")
        ?.trim()
        .toLowerCase() === "true"
    );
  }
}
