import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Markup, Telegraf, type Context } from "telegraf";
import type { Update } from "telegraf/types";

import { AssistantService } from "../assistant/assistant.service";
import { DocumentsService } from "../documents/services/documents.service";
import { EnergyService } from "../energy/services/energy.service";
import { ExpensesService } from "../expenses/services/expenses.service";
import { GarageService } from "../garage/services/garage.service";
import { type Vehicle } from "../garage/schemas/vehicle.schema";
import { AuthService } from "../identity/services/auth.service";
import { type User } from "../identity/schemas/user.schema";
import { MileageService } from "../mileage/services/mileage.service";
import { ServiceRecordsService } from "../service-records/services/service-records.service";
import { VinService } from "../vin/services/vin.service";

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;
const ODOMETER_REGEX = /(?:пробіг|одометр|mileage)\D*(\d[\d\s]{2,8})/i;

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private bot?: Telegraf;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly assistantService: AssistantService,
    private readonly documentsService: DocumentsService,
    private readonly energyService: EnergyService,
    private readonly expensesService: ExpensesService,
    private readonly garageService: GarageService,
    private readonly mileageService: MileageService,
    private readonly serviceRecordsService: ServiceRecordsService,
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
        description: "Запустити IA-CARS",
      },
      {
        command: "vin",
        description: "Перевірити автомобіль за VIN",
      },
      {
        command: "garage",
        description: "Показати гараж",
      },
      {
        command: "addcar",
        description: "Додати авто за VIN",
      },
      {
        command: "mileage",
        description: "Записати пробіг",
      },
      {
        command: "expense",
        description: "Записати витрату",
      },
      {
        command: "fuel",
        description: "Записати заправку",
      },
      {
        command: "charge",
        description: "Записати заряджання",
      },
      {
        command: "service",
        description: "Записати сервіс",
      },
      {
        command: "document",
        description: "Додати документ",
      },
      {
        command: "ask",
        description: "Поставити запитання CARA",
      },
      {
        command: "website",
        description: "Відкрити IA-CARS",
      },
      {
        command: "help",
        description: "Допомога",
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
          "Розумна перевірка автомобіля за VIN і єдиний цифровий профіль авто.",
          "",
          "Команди:",
          "/garage — показати автомобілі",
          "/addcar VIN [назва] — додати авто",
          "/mileage 123456 — записати пробіг",
          "/expense 120 PLN мийка — записати витрату",
          "/fuel 45 l 280 PLN 123456 — заправка",
          "/charge 42 kWh 90 PLN — зарядка",
          "/service заміна масла 450 PLN — сервіс",
          "/document insurance OC 2027-10-06 — документ",
          "/vin VIN — перевірити VIN без додавання",
          "/ask запитання — спитати CARA про авто",
          "/website — відкрити IA-CARS",
          "/help — допомога",
        ].join("\n"),
        this.websiteButton,
      );
    });

    this.bot.command("help", async (ctx) => {
      await ctx.reply(
        [
          "CARA в Telegram працює з тими самими даними, що й сайт:",
          "",
          "/garage — список авто",
          "/addcar WBA12345678901234 BMW — додати авто",
          "/mileage 123456 — записати пробіг, якщо авто одне",
          "/mileage 123456 2 — записати пробіг для авто №2",
          "/expense 120 PLN мийка 2 — витрата для авто №2",
          "/fuel 45 l 280 PLN 123456 — заправка",
          "/charge 42 kWh 90 PLN — зарядка",
          "/service заміна масла 450 PLN — сервісний запис",
          "/document insurance OC 2027-10-06 — документ із датою завершення",
          "/ask що потрібно обслужити? — запитання асистенту",
          "/vin WBA12345678901234 — швидка VIN-перевірка",
          "",
          "Можна писати й звичайним текстом: «пробіг 123456», «що перевірити перед поїздкою?».",
        ].join("\n"),
        this.websiteButton,
      );
    });

    this.bot.command("website", async (ctx) => {
      await ctx.reply("🚗 Відкрити IA-CARS:", this.websiteButton);
    });

    this.bot.command("garage", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;

      const vehicles = await this.garageService.getVehicles(user.id);
      await ctx.reply(this.buildGarageMessage(vehicles), this.websiteButton);
    });

    this.bot.command("addcar", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;

      const text = ctx.message.text.replace(/^\/addcar(?:@\w+)?/i, "").trim();
      const [vinCandidate, ...nicknameParts] = text.split(/\s+/);
      const vin = vinCandidate?.trim().toUpperCase();

      if (!vin || !VIN_REGEX.test(vin)) {
        await ctx.reply(
          "Надішліть VIN після команди.\n\nПриклад:\n/addcar WBA12345678901234 BMW 320d",
        );
        return;
      }

      const vehicle = await this.garageService.createVehicle(user.id, {
        vin,
        nickname: nicknameParts.join(" ").trim() || undefined,
      });

      if (this.vinLookupEnabled) {
        try {
          await this.vinService.decodeVehicleVin(user.id, vehicle.id);
        } catch (error) {
          this.logger.warn(
            `Telegram addcar VIN decode failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      const updated = await this.garageService.getVehicle(user.id, vehicle.id);

      await ctx.reply(
        [
          "✅ Автомобіль додано в гараж.",
          "",
          this.formatVehicle(updated, 1),
          "",
          "Тепер можна писати: «пробіг 123456» або ставити запитання про авто.",
        ].join("\n"),
        this.websiteButton,
      );
    });

    this.bot.command("mileage", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;

      await this.handleMileageMessage(
        ctx,
        user,
        ctx.message.text.replace(/^\/mileage(?:@\w+)?/i, "").trim(),
      );
    });

    this.bot.command("expense", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;

      await this.handleExpenseMessage(
        ctx,
        user,
        ctx.message.text.replace(/^\/expense(?:@\w+)?/i, "").trim(),
      );
    });

    this.bot.command("fuel", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;

      await this.handleEnergyMessage(
        ctx,
        user,
        "fuel",
        ctx.message.text.replace(/^\/fuel(?:@\w+)?/i, "").trim(),
      );
    });

    this.bot.command("charge", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;

      await this.handleEnergyMessage(
        ctx,
        user,
        "charge",
        ctx.message.text.replace(/^\/charge(?:@\w+)?/i, "").trim(),
      );
    });

    this.bot.command("service", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;

      await this.handleServiceMessage(
        ctx,
        user,
        ctx.message.text.replace(/^\/service(?:@\w+)?/i, "").trim(),
      );
    });

    this.bot.command("document", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;

      await this.handleDocumentMessage(
        ctx,
        user,
        ctx.message.text.replace(/^\/document(?:@\w+)?/i, "").trim(),
      );
    });

    this.bot.command("ask", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;

      const question = ctx.message.text.replace(/^\/ask(?:@\w+)?/i, "").trim();

      if (!question) {
        await ctx.reply("Напишіть запитання після команди.\n\nПриклад:\n/ask що перевірити перед далекою поїздкою?");
        return;
      }

      await this.answerQuestion(ctx, user, question);
    });

    this.bot.command("vin", async (ctx) => {
      const vin = ctx.message.text
        .replace(/^\/vin(?:@\w+)?/i, "")
        .trim()
        .toUpperCase();

      if (!vin) {
        await ctx.reply(
          "Надішліть VIN після команди.\n\nПриклад:\n/vin WBA12345678901234",
        );
        return;
      }

      if (!VIN_REGEX.test(vin)) {
        await ctx.reply(
          "❌ VIN має містити рівно 17 символів. Літери I, O та Q не використовуються.",
        );
        return;
      }

      if (!this.vinLookupEnabled) {
        await ctx.reply(
          [
            `✅ VIN розпізнано: ${vin}`,
            "",
            "Реальні запити до VIN-провайдера поки вимкнено.",
            "Увімкнемо їх після перевірки Telegram-інтеграції.",
          ].join("\n"),
          this.websiteButton,
        );

        return;
      }

      await ctx.reply(`🔎 Перевіряю VIN ${vin}…`);

      try {
        const result = await this.vinService.decodeStandaloneVin(vin);

        const response = [
          "✅ IA-CARS знайшов дані",
          "",
          `VIN: ${vin}`,
          result.make ? `Марка: ${result.make}` : null,
          result.model ? `Модель: ${result.model}` : null,
          result.modelYear ? `Рік: ${result.modelYear}` : null,
          result.engineCode ? `Двигун: ${result.engineCode}` : null,
          result.displacementCc ? `Об’єм: ${result.displacementCc} см³` : null,
          result.powerHp ? `Потужність: ${result.powerHp} к.с.` : null,
          result.fuelType ? `Пальне: ${result.fuelType}` : null,
          result.transmissionType ? `КПП: ${result.transmissionType}` : null,
          result.driveType ? `Привід: ${result.driveType}` : null,
          "",
          "Повний профіль автомобіля — в IA-CARS.",
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
          "❌ Не вдалося отримати дані за цим VIN. Спробуйте пізніше або відкрийте IA-CARS.",
          this.websiteButton,
        );
      }
    });

    this.bot.on("text", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;

      const text = ctx.message.text.trim();
      const vin = text.toUpperCase();

      if (VIN_REGEX.test(vin)) {
        await this.replyWithVinDecode(ctx, vin);
        return;
      }

      if (ODOMETER_REGEX.test(text)) {
        await this.handleMileageMessage(ctx, user, text);
        return;
      }

      await this.answerQuestion(ctx, user, text);
    });
  }

  private async getTelegramUser(ctx: Context): Promise<User | null> {
    if (!ctx.from) {
      await ctx.reply("Не бачу Telegram-профіль. Спробуйте відкрити чат заново.");
      return null;
    }

    return this.authService.upsertTelegramUser({
      id: ctx.from.id,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      username: ctx.from.username,
      languageCode: ctx.from.language_code,
    });
  }

  private async handleMileageMessage(
    ctx: Context,
    user: User,
    text: string,
  ): Promise<void> {
    const parsed = this.parseMileage(text);

    if (!parsed) {
      await ctx.reply(
        "Не зрозумів пробіг. Приклад: /mileage 123456 або «пробіг 123456».",
      );
      return;
    }

    const vehicles = await this.garageService.getVehicles(user.id);
    const vehicle = this.resolveVehicle(vehicles, parsed.vehicleIndex);

    if (!vehicle) {
      await ctx.reply(this.buildChooseVehicleMessage(vehicles), this.websiteButton);
      return;
    }

    const reading = await this.mileageService.recordReading(user.id, vehicle.id, {
      odometerKm: parsed.odometerKm,
      source: "telegram",
      confidence: 1,
    });

    await ctx.reply(
      [
        "✅ Пробіг записано.",
        "",
        `${this.vehicleTitle(vehicle)}: ${reading.odometerKm.toLocaleString("uk-UA")} км`,
        `Дата: ${reading.recordedAt.toLocaleDateString("uk-UA")}`,
      ].join("\n"),
      this.websiteButton,
    );
  }

  private async handleExpenseMessage(
    ctx: Context,
    user: User,
    text: string,
  ): Promise<void> {
    const parsed = this.parseExpense(text);

    if (!parsed) {
      await ctx.reply(
        "Не зрозумів витрату. Приклад: /expense 120 PLN мийка або /expense 450 PLN страхування 2",
      );
      return;
    }

    const vehicle = await this.requireVehicleForTelegram(
      ctx,
      user,
      parsed.vehicleIndex,
    );
    if (!vehicle) return;

    try {
      const result = await this.expensesService.createExpense(
        user.id,
        vehicle.id,
        {
          category: parsed.category,
          title: parsed.title,
          totalCost: parsed.totalCost,
          currency: parsed.currency,
          source: "telegram",
        },
      );

      await ctx.reply(
        [
          "✅ Витрату записано.",
          "",
          `${this.vehicleTitle(vehicle)}: ${result.expense.title}`,
          `${result.calculations.totalCost.toLocaleString("uk-UA", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ${result.expense.currency}`,
        ].join("\n"),
        this.websiteButton,
      );
    } catch (error) {
      await ctx.reply(this.humanError(error, "Не вдалося записати витрату."));
    }
  }

  private async handleEnergyMessage(
    ctx: Context,
    user: User,
    kind: "fuel" | "charge",
    text: string,
  ): Promise<void> {
    const parsed = this.parseEnergy(kind, text);

    if (!parsed) {
      await ctx.reply(
        kind === "fuel"
          ? "Не зрозумів заправку. Приклад: /fuel 45 l 280 PLN 123456"
          : "Не зрозумів заряджання. Приклад: /charge 42 kWh 90 PLN 123456",
      );
      return;
    }

    const vehicle = await this.requireVehicleForTelegram(
      ctx,
      user,
      parsed.vehicleIndex,
    );
    if (!vehicle) return;

    try {
      const result = await this.energyService.createEntry(user.id, vehicle.id, {
        kind,
        energyType: kind === "fuel" ? "fuel" : "electric",
        volumeLiters: parsed.volumeLiters,
        energyKwh: parsed.energyKwh,
        totalCost: parsed.totalCost,
        currency: parsed.currency,
        odometerKm: parsed.odometerKm,
        isFullTank: kind === "fuel",
        source: "telegram",
      });

      await ctx.reply(
        [
          kind === "fuel" ? "✅ Заправку записано." : "✅ Заряджання записано.",
          "",
          `${this.vehicleTitle(vehicle)}: ${
            parsed.volumeLiters
              ? `${parsed.volumeLiters} л`
              : `${parsed.energyKwh} кВт·ч`
          }`,
          result.calculations.totalCost !== null && result.entry.currency
            ? `${result.calculations.totalCost.toLocaleString("uk-UA", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} ${result.entry.currency}`
            : null,
          parsed.odometerKm ? `Пробіг: ${parsed.odometerKm} км` : null,
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
        this.websiteButton,
      );
    } catch (error) {
      await ctx.reply(
        this.humanError(
          error,
          kind === "fuel"
            ? "Не вдалося записати заправку."
            : "Не вдалося записати заряджання.",
        ),
      );
    }
  }

  private async handleServiceMessage(
    ctx: Context,
    user: User,
    text: string,
  ): Promise<void> {
    const parsed = this.parseService(text);

    if (!parsed) {
      await ctx.reply(
        "Не зрозумів сервіс. Приклад: /service заміна масла 450 PLN 123456",
      );
      return;
    }

    const vehicle = await this.requireVehicleForTelegram(
      ctx,
      user,
      parsed.vehicleIndex,
    );
    if (!vehicle) return;

    try {
      const result = await this.serviceRecordsService.createRecord(
        user.id,
        vehicle.id,
        {
          type: parsed.type,
          title: parsed.title,
          totalCost: parsed.totalCost,
          currency: parsed.currency,
          odometerKm: parsed.odometerKm,
          source: "telegram",
        },
      );

      await ctx.reply(
        [
          "✅ Сервісний запис додано.",
          "",
          `${this.vehicleTitle(vehicle)}: ${result.record.title}`,
          result.record.totalCost && result.record.currency
            ? `${result.record.totalCost} ${result.record.currency}`
            : null,
          parsed.odometerKm ? `Пробіг: ${parsed.odometerKm} км` : null,
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
        this.websiteButton,
      );
    } catch (error) {
      await ctx.reply(this.humanError(error, "Не вдалося додати сервіс."));
    }
  }

  private async handleDocumentMessage(
    ctx: Context,
    user: User,
    text: string,
  ): Promise<void> {
    const parsed = this.parseDocument(text);

    if (!parsed) {
      await ctx.reply(
        "Не зрозумів документ. Приклад: /document insurance OC 2027-10-06",
      );
      return;
    }

    const vehicle = await this.requireVehicleForTelegram(
      ctx,
      user,
      parsed.vehicleIndex,
    );
    if (!vehicle) return;

    try {
      const result = await this.documentsService.createDocument(
        user.id,
        vehicle.id,
        {
          type: parsed.type,
          title: parsed.title,
          expiresAt: parsed.expiresAt,
          source: "telegram",
        },
      );

      await ctx.reply(
        [
          "✅ Документ додано.",
          "",
          `${this.vehicleTitle(vehicle)}: ${result.document.title}`,
          result.document.expiresAt
            ? `Діє до: ${result.document.expiresAt.toLocaleDateString("uk-UA")}`
            : null,
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
        this.websiteButton,
      );
    } catch (error) {
      await ctx.reply(this.humanError(error, "Не вдалося додати документ."));
    }
  }

  private async answerQuestion(
    ctx: Context,
    user: User,
    text: string,
  ): Promise<void> {
    const vehicles = await this.garageService.getVehicles(user.id);
    const { question, vehicleIndex } = this.extractVehicleIndex(text);
    const vehicle = this.resolveVehicle(vehicles, vehicleIndex);

    if (!vehicle) {
      await ctx.reply(this.buildChooseVehicleMessage(vehicles), this.websiteButton);
      return;
    }

    await ctx.reply("Думаю за даними автомобіля...");

    const response = await this.assistantService.chat({
      ownerId: user.id,
      vehicleId: vehicle.id,
      message: question,
    });

    await ctx.reply(this.telegramSafeText(response.answer), this.websiteButton);
  }

  private async replyWithVinDecode(ctx: Context, vin: string): Promise<void> {
    if (!this.vinLookupEnabled) {
      await ctx.reply(
        [
          `✅ VIN розпізнано: ${vin}`,
          "",
          "Реальні запити до VIN-провайдера поки вимкнено.",
          "Додати авто можна командою /addcar VIN.",
        ].join("\n"),
        this.websiteButton,
      );

      return;
    }

    await ctx.reply(`🔎 Перевіряю VIN ${vin}...`);

    const result = await this.vinService.decodeStandaloneVin(vin);

    await ctx.reply(
      this.telegramSafeText(
        [
          "✅ IA-CARS знайшов дані",
          "",
          `VIN: ${vin}`,
          result.make ? `Марка: ${result.make}` : null,
          result.model ? `Модель: ${result.model}` : null,
          result.modelYear ? `Рік: ${result.modelYear}` : null,
          result.engineCode ? `Двигун: ${result.engineCode}` : null,
          result.displacementCc ? `Об’єм: ${result.displacementCc} см³` : null,
          result.powerHp ? `Потужність: ${result.powerHp} к.с.` : null,
          result.fuelType ? `Пальне: ${result.fuelType}` : null,
          result.transmissionType ? `КПП: ${result.transmissionType}` : null,
          result.driveType ? `Привід: ${result.driveType}` : null,
          "",
          "Щоб зберегти авто: /addcar " + vin,
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
      ),
      this.websiteButton,
    );
  }

  private parseMileage(
    text: string,
  ): { odometerKm: number; vehicleIndex?: number } | null {
    const match =
      text.match(/^(\d[\d\s]{2,8})(?:\s*(?:км|km))?(?:\s+#?(\d+))?$/i) ??
      text.match(
        /(?:пробіг|одометр|mileage)\D*(\d[\d\s]{2,8})(?:\s*(?:км|km))?(?:\s+#?(\d+))?/i,
      );

    if (!match) return null;

    const odometerKm = Number(match[1].replace(/\s+/g, ""));
    const vehicleIndex = match[2] ? Number(match[2]) : undefined;

    if (!Number.isInteger(odometerKm) || odometerKm <= 0) return null;

    return {
      odometerKm,
      vehicleIndex:
        vehicleIndex && Number.isInteger(vehicleIndex) ? vehicleIndex : undefined,
    };
  }

  private parseExpense(
    text: string,
  ): {
    totalCost: number;
    currency: string;
    title: string;
    category: string;
    vehicleIndex?: number;
  } | null {
    const { text: cleanText, vehicleIndex } = this.extractTrailingVehicleIndex(
      text,
    );
    const match = cleanText.match(
      /^\s*(\d+(?:[.,]\d{1,2})?)\s*([A-Za-z]{3})\s+(.+?)\s*$/i,
    );

    if (!match) return null;

    const totalCost = this.parseNumber(match[1]);
    const currency = match[2].toUpperCase();
    const title = match[3].trim();

    if (!totalCost || !title) return null;

    return {
      totalCost,
      currency,
      title,
      category: this.inferExpenseCategory(title),
      vehicleIndex,
    };
  }

  private parseEnergy(
    kind: "fuel" | "charge",
    text: string,
  ): {
    volumeLiters?: number;
    energyKwh?: number;
    totalCost?: number;
    currency?: string;
    odometerKm?: number;
    vehicleIndex?: number;
  } | null {
    const { text: withoutVehicleIndex, vehicleIndex } =
      this.extractTrailingVehicleIndex(text);

    const volumePattern =
      kind === "fuel"
        ? /(\d+(?:[.,]\d{1,3})?)\s*(?:l|л|литр(?:а|ов)?)/i
        : /(\d+(?:[.,]\d{1,3})?)\s*(?:kwh|квт(?:\s*[·.]?\s*ч)?)/i;
    const volumeMatch = withoutVehicleIndex.match(volumePattern);

    if (!volumeMatch) return null;

    const moneyMatch = withoutVehicleIndex.match(
      /(\d+(?:[.,]\d{1,2})?)\s*([A-Za-z]{3})/i,
    );
    const odometerMatch = withoutVehicleIndex.match(
      /(?:^|\s)(\d{4,8})(?:\s*(?:км|km))?(?:\s|$)/i,
    );

    const amount = this.parseNumber(volumeMatch[1]);
    if (!amount) return null;

    return {
      volumeLiters: kind === "fuel" ? amount : undefined,
      energyKwh: kind === "charge" ? amount : undefined,
      totalCost: moneyMatch ? this.parseNumber(moneyMatch[1]) : undefined,
      currency: moneyMatch?.[2]?.toUpperCase(),
      odometerKm: odometerMatch ? Number(odometerMatch[1]) : undefined,
      vehicleIndex,
    };
  }

  private parseService(
    text: string,
  ): {
    title: string;
    type:
      | "maintenance"
      | "repair"
      | "diagnostic"
      | "inspection"
      | "replacement"
      | "upgrade"
      | "other";
    totalCost?: number;
    currency?: string;
    odometerKm?: number;
    vehicleIndex?: number;
  } | null {
    const { text: withoutVehicleIndex, vehicleIndex } =
      this.extractTrailingVehicleIndex(text);
    const moneyMatch = withoutVehicleIndex.match(
      /(\d+(?:[.,]\d{1,2})?)\s*([A-Za-z]{3})/i,
    );
    const odometerMatch = withoutVehicleIndex.match(
      /(?:^|\s)(\d{4,8})(?:\s*(?:км|km))?(?:\s|$)/i,
    );

    const title = withoutVehicleIndex
      .replace(/\d+(?:[.,]\d{1,2})?\s*[A-Za-z]{3}/i, "")
      .replace(/(?:^|\s)\d{4,8}(?:\s*(?:км|km))?(?:\s|$)/i, " ")
      .trim();

    if (!title) return null;

    return {
      title,
      type: this.inferServiceType(title),
      totalCost: moneyMatch ? this.parseNumber(moneyMatch[1]) : undefined,
      currency: moneyMatch?.[2]?.toUpperCase(),
      odometerKm: odometerMatch ? Number(odometerMatch[1]) : undefined,
      vehicleIndex,
    };
  }

  private parseDocument(
    text: string,
  ): {
    type: string;
    title: string;
    expiresAt?: Date;
    vehicleIndex?: number;
  } | null {
    const { text: withoutVehicleIndex, vehicleIndex } =
      this.extractTrailingVehicleIndex(text);
    const dateMatch = withoutVehicleIndex.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    const withoutDate = dateMatch
      ? withoutVehicleIndex.replace(dateMatch[0], "").trim()
      : withoutVehicleIndex.trim();
    const [typeCandidate, ...titleParts] = withoutDate.split(/\s+/);

    if (!typeCandidate) return null;

    const expiresAt = dateMatch ? new Date(`${dateMatch[1]}T00:00:00Z`) : undefined;

    if (expiresAt && Number.isNaN(expiresAt.getTime())) return null;

    return {
      type: typeCandidate.toLowerCase(),
      title: titleParts.join(" ").trim() || typeCandidate,
      expiresAt,
      vehicleIndex,
    };
  }

  private extractVehicleIndex(text: string): {
    question: string;
    vehicleIndex?: number;
  } {
    const match = text.match(/^\s*#?(\d+)[:.)\s]+(.+)$/s);

    if (!match) {
      return { question: text };
    }

    return {
      vehicleIndex: Number(match[1]),
      question: match[2].trim(),
    };
  }

  private resolveVehicle(
    vehicles: Vehicle[],
    vehicleIndex?: number,
  ): Vehicle | null {
    const activeVehicles = vehicles.filter((vehicle) => !vehicle.isArchived);

    if (activeVehicles.length === 0) return null;

    if (vehicleIndex !== undefined) {
      return activeVehicles[vehicleIndex - 1] ?? null;
    }

    return activeVehicles.length === 1 ? activeVehicles[0] : null;
  }

  private async requireVehicleForTelegram(
    ctx: Context,
    user: User,
    vehicleIndex?: number,
  ): Promise<Vehicle | null> {
    const vehicles = await this.garageService.getVehicles(user.id);
    const vehicle = this.resolveVehicle(vehicles, vehicleIndex);

    if (!vehicle) {
      await ctx.reply(this.buildChooseVehicleMessage(vehicles), this.websiteButton);
      return null;
    }

    return vehicle;
  }

  private extractTrailingVehicleIndex(text: string): {
    text: string;
    vehicleIndex?: number;
  } {
    const match = text.trim().match(/^(.*?)(?:\s+#?(\d{1,2}))?$/s);
    const vehicleIndex = match?.[2] ? Number(match[2]) : undefined;

    return {
      text: match?.[1]?.trim() || text.trim(),
      vehicleIndex,
    };
  }

  private parseNumber(value: string): number | undefined {
    const number = Number(value.replace(",", "."));
    return Number.isFinite(number) && number > 0 ? number : undefined;
  }

  private inferExpenseCategory(title: string): string {
    const text = title.toLowerCase();

    if (/страх|oc|ac|insurance/.test(text)) return "insurance";
    if (/мойк|wash|clean/.test(text)) return "wash";
    if (/парков|parking/.test(text)) return "parking";
    if (/штраф|fine|ticket/.test(text)) return "fine";
    if (/шина|резин|tire|tyre/.test(text)) return "tires";
    if (/налог|tax/.test(text)) return "tax";

    return "other";
  }

  private inferServiceType(
    title: string,
  ):
    | "maintenance"
    | "repair"
    | "diagnostic"
    | "inspection"
    | "replacement"
    | "upgrade"
    | "other" {
    const text = title.toLowerCase();

    if (/діагност|diagnostic/.test(text)) return "diagnostic";
    if (/огляд|inspection|техогляд|то\b/.test(text)) return "inspection";
    if (/замін|replace|масл|filter|фільтр/.test(text)) return "replacement";
    if (/ремонт|repair|fix/.test(text)) return "repair";
    if (/upgrade|тюнінг|покращ/.test(text)) return "upgrade";

    return "maintenance";
  }

  private humanError(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return `❌ ${fallback}\n${error.message}`;
    }

    return `❌ ${fallback}`;
  }

  private buildGarageMessage(vehicles: Vehicle[]): string {
    const activeVehicles = vehicles.filter((vehicle) => !vehicle.isArchived);

    if (activeVehicles.length === 0) {
      return [
        "У гаражі поки немає автомобілів.",
        "",
        "Додати можна так:",
        "/addcar WBA12345678901234 BMW 320d",
      ].join("\n");
    }

    return [
      "Ваш гараж:",
      "",
      ...activeVehicles.map((vehicle, index) =>
        this.formatVehicle(vehicle, index + 1),
      ),
      "",
      "Якщо авто кілька, вказуйте номер: /mileage 123456 2 або #2 що перевірити?",
    ].join("\n");
  }

  private buildChooseVehicleMessage(vehicles: Vehicle[]): string {
    const activeVehicles = vehicles.filter((vehicle) => !vehicle.isArchived);

    if (activeVehicles.length === 0) {
      return [
        "Спочатку додайте автомобіль.",
        "",
        "Приклад:",
        "/addcar WBA12345678901234 BMW 320d",
      ].join("\n");
    }

    return [
      "Уточніть автомобіль номером:",
      "",
      ...activeVehicles.map((vehicle, index) =>
        this.formatVehicle(vehicle, index + 1),
      ),
      "",
      "Приклади:",
      "/mileage 123456 2",
      "#2 що перевірити перед поїздкою?",
    ].join("\n");
  }

  private formatVehicle(vehicle: Vehicle, index: number): string {
    const vin = vehicle.vin ? `VIN ${vehicle.vin}` : "VIN не вказано";
    const plate = vehicle.licensePlate ? `, ${vehicle.licensePlate}` : "";

    return `${index}. ${this.vehicleTitle(vehicle)} — ${vin}${plate}`;
  }

  private vehicleTitle(vehicle: Vehicle): string {
    return (
      [vehicle.nickname, vehicle.make, vehicle.model, vehicle.modelYear]
        .filter(Boolean)
        .join(" ") || "Автомобіль"
    );
  }

  private telegramSafeText(text: string): string {
    const trimmed = text.trim();

    if (trimmed.length <= 3900) {
      return trimmed;
    }

    return `${trimmed.slice(0, 3890)}...`;
  }

  private get websiteButton() {
    return Markup.inlineKeyboard([
      [Markup.button.webApp("🚗 Відкрити IA-CARS", this.webAppUrl)],
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
