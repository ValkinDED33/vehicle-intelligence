import { BadRequestException, HttpException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
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
import { TelegramSessionService } from "./telegram-session.service";
import { botFieldValue, splitTelegramText, TelegramConversationService } from "./telegram-conversation.service";
import { botLanguage, botText, interruptedEffectText, type BotLanguage, type ConversationCheckpoint, type ConversationState } from "./telegram-conversation.types";
import { RemindersService } from "../reminders/reminders.service";
import { DateTime } from "luxon";
import { AssistantMemoryService } from "../assistant/assistant-memory.service";
import { randomBytes } from "crypto";
import { vinConsentText, vinErrorText } from "./telegram-vin-text";

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;
type TelegramCallOptions = NonNullable<Parameters<Telegraf["telegram"]["callApi"]>[2]>;
function setupRequestOptions(): TelegramCallOptions {
  // node-fetch accepts native signals; Telegraf still declares the older abort-controller type.
  return { signal: AbortSignal.timeout(8_000) as unknown as TelegramCallOptions["signal"] };
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot?: Telegraf;
  private setupRetry?: ReturnType<typeof setTimeout>;
  private setupAttempts = 0;
  private stopping = false;
  private readonly sessions = new WeakMap<Context, ConversationState>();
  private readonly authenticatedUsers = new WeakMap<Context, User>();
  private readonly checkpoints = new WeakMap<Context, ConversationCheckpoint>();

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
    private readonly sessionService: TelegramSessionService,
    private readonly conversationService: TelegramConversationService,
    private readonly remindersService: RemindersService,
    private readonly memory: AssistantMemoryService,
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

    this.bot.catch(async (error, ctx) => {
      this.logger.error(
        `Telegram error: ${
          error instanceof Error ? error.name : "UnknownError"
        }`,
      );
      if (ctx.chat?.type === "private") {
        await ctx.reply(this.text(ctx, "Не вдалося обробити повідомлення. Спробуйте ще раз трохи пізніше.", "Nie udało się przetworzyć wiadomości. Spróbuj ponownie później.", "I couldn't process your message. Please try again shortly.")).catch(() => undefined);
      }
    });

    await this.setupTelegram();
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.setupRetry) clearTimeout(this.setupRetry);
    this.setupRetry = undefined;
  }

  private async setupTelegram(): Promise<void> {
    if (!this.bot || this.stopping || this.setupAttempts >= 3) return;
    if (this.setupRetry) clearTimeout(this.setupRetry);
    this.setupRetry = undefined;
    this.setupAttempts++;
    try {
      // Register incoming updates before the optional command menus. Never discard queued updates.
      await this.bot.telegram.callApi("setWebhook", {
        url: this.webhookUrl, secret_token: this.webhookSecret,
        allowed_updates: ["message", "callback_query"], drop_pending_updates: false,
      }, setupRequestOptions());
      await this.registerCommands();
      this.logger.log(`Telegram webhook connected: ${this.webhookUrl}`);
    } catch {
      // Transport errors can contain the bot token in their URL; never log or rethrow them.
      if (this.stopping) return;
      if (this.setupAttempts >= 3) {
        this.logger.warn("Telegram setup unavailable after 3 attempts; API remains running. Check the bot configuration and restart after recovery.");
        return;
      }
      this.logger.warn("Telegram setup unavailable; API remains running and setup will retry shortly.");
      this.setupRetry = setTimeout(() => { void this.setupTelegram(); }, this.setupAttempts * 30_000);
      this.setupRetry.unref();
    }
  }

  private async registerCommands(): Promise<void> {
    const bot = this.bot;
    if (!bot) return;
    const commands = [
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
      { command: "vehicle", description: "Вибрати автомобіль" },
      { command: "confirm", description: "Підтвердити дію" },
      { command: "cancel", description: "Скасувати дію" },
      { command: "language", description: "Українська / Polski / English" },
      { command: "reminders", description: "Мої нагадування" },
      { command: "forget", description: "Очистити спільну історію цього чату" },
    ];
    await bot.telegram.callApi("setMyCommands", { commands }, setupRequestOptions());
    const descriptions: Record<string, [string, string]> = {
      start: ["Uruchom CARA", "Start CARA"], vin: ["Sprawdź VIN", "Check a VIN"],
      garage: ["Pokaż garaż", "Show your garage"], addcar: ["Dodaj auto po VIN", "Add a car by VIN"],
      mileage: ["Zapisz przebieg", "Record mileage"], expense: ["Zapisz wydatek", "Record an expense"],
      fuel: ["Zapisz tankowanie", "Record a fuel entry"], charge: ["Zapisz ładowanie", "Record charging"],
      service: ["Dodaj wpis serwisowy", "Add a service record"], document: ["Dodaj dokument", "Add a document"],
      ask: ["Zapytaj CARA", "Ask CARA"], website: ["Otwórz CARA", "Open CARA"], help: ["Pomoc", "Help"],
      vehicle: ["Wybierz auto", "Choose a car"], confirm: ["Potwierdź operację", "Confirm an action"],
      cancel: ["Anuluj operację", "Cancel an action"], language: ["Українська / Polski / English", "Українська / Polski / English"],
      reminders: ["Moje przypomnienia", "My reminders"],
      forget: ["Wyczyść wspólną historię tego czatu", "Clear this chat's shared history"],
    };
    for (const [index, language_code] of ["pl", "en"].entries()) {
      await bot.telegram.callApi("setMyCommands", {
        commands: commands.map(({ command }) => ({ command, description: descriptions[command][index] })), language_code,
      }, setupRequestOptions());
    }
  }

  async processUpdate(update: Update): Promise<void> {
    if (!this.bot) {
      this.logger.warn("Telegram bot is not initialized");
      throw new ServiceUnavailableException("Telegram is not initialized");
    }
    if (!update || !Number.isSafeInteger(update.update_id)) throw new BadRequestException("Invalid Telegram update");
    await this.bot.handleUpdate(update);
  }

  isValidSecret(secret: string | undefined): boolean {
    return Boolean(
      secret && this.webhookSecret && secret === this.webhookSecret,
    );
  }

  private registerHandlers(): void {
    if (!this.bot) return;

    this.bot.use(async (ctx, next) => {
      if (ctx.chat?.type !== "private" || !ctx.from || ctx.from.is_bot) return;
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => undefined);
      const incomingText = ctx.message && "text" in ctx.message ? ctx.message.text : "";
      const link = incomingText.match(/^\/start(?:@\w+)?\s+link_([A-Za-z0-9_-]{32})$/);
      let user: User | null;
      try {
        user = link ? await this.authService.linkTelegram(link[1], {
          id: ctx.from.id, username: ctx.from.username,
        }) : await this.getTelegramUser(ctx);
      } catch (error) {
        const language = botLanguage(ctx.from.language_code);
        const publicMessage = error instanceof HttpException && error.getStatus() === 409
          ? botText(language, "Telegram або акаунт уже має іншу прив’язку чи дані. Автоматичне об’єднання недоступне.", "Telegram lub konto ma już inne powiązanie albo dane. Automatyczne łączenie nie jest dostępne.", "Telegram or the account already has another link or saved data. Automatic merging is not available.")
          : botText(language, "Не вдалося під’єднати Telegram. Створіть нове посилання в налаштуваннях сайту.", "Nie udało się połączyć Telegrama. Utwórz nowy link w ustawieniach strony.", "Telegram could not be linked. Create a new link in the website settings.");
        await ctx.reply(publicMessage);
        return;
      }
      if (!user) return;
      this.authenticatedUsers.set(ctx, user);
      await this.sessionService.run(user.id, ctx.update.update_id, async (state, checkpoint) => {
        const previousEffectId = state.lastEffect?.id;
        this.sessions.set(ctx, state);
        this.checkpoints.set(ctx, checkpoint);
        const message = ctx.message && "text" in ctx.message ? ctx.message.text.trim() : "";
        if (message.length > 2000) {
          await ctx.reply(botText(botLanguage(user.language), "Скоротіть повідомлення до 2000 символів.", "Skróć wiadomość do 2000 znaków.", "Please keep your message under 2000 characters."));
          return;
        }
        // Conversation messages live in shared memory; never copy setup tokens or commands into it.
        state.history = [];
        if (message) {
          delete state.pendingVin;
          if (/^\/(?!confirm\b|cancel\b)/.test(message)) {
            delete state.pending;
            delete state.awaitingVehicleFor;
          }
        }
        try {
          if (/^\/(?:addcar|mileage|expense|fuel|charge|service|document|vin)(?:@\w+)?(?:\s|$)/i.test(message)) await checkpoint();
          await next();
        } catch (error) {
          this.logger.warn(`Telegram handler failed: ${error instanceof Error ? error.name : "UnknownError"}`);
          const language = botLanguage(user.language);
          const vinError = vinErrorText(error, language);
          if (vinError) { await ctx.reply(vinError, this.websiteButton(ctx)); return; }
          if (state.lastEffect?.status === "uncertain" && state.lastEffect.id !== previousEffectId) {
            await ctx.reply(interruptedEffectText(language));
            return;
          }
          if (error && typeof error === "object" && "status" in error && error.status === 429) {
            await ctx.reply(botText(language,
              "Досягнуто ліміту AI-запитів. Спробуйте ще раз за хвилину. Команди /garage та /mileage залишаються доступними.",
              "Osiągnięto limit zapytań AI. Spróbuj ponownie za minutę. Komendy /garage i /mileage są nadal dostępne.",
              "The AI request limit has been reached. Please try again in a minute. Commands such as /garage and /mileage are still available."));
            return;
          }
          const validation = error instanceof HttpException && error.getStatus() >= 400 && error.getStatus() < 500;
          if (error instanceof HttpException && error.getStatus() === 409) {
            await ctx.reply(botText(language,
              "Історія чату змінилася або помічник уже обробляє інший запит. Спробуйте ще раз за мить.",
              "Historia czatu uległa zmianie lub asystent obsługuje już inne zapytanie. Spróbuj ponownie za chwilę.",
              "The chat history changed or the assistant is handling another request. Please try again in a moment."));
            return;
          }
          await ctx.reply(botText(language,
            validation ? "Перевірте дані: значення некоректне або запис недоступний. Уточніть запит і спробуйте ще раз." : "Не вдалося завершити запит. Спробуйте ще раз трохи пізніше.",
            validation ? "Sprawdź dane: wartość jest nieprawidłowa lub wpis jest niedostępny. Doprecyzuj prośbę i spróbuj ponownie." : "Nie udało się wykonać prośby. Spróbuj ponownie później.",
            validation ? "Please check the values or record access, clarify your request, and try again." : "I couldn't complete your request. Please try again shortly."));
        }
      });
    });

    this.bot.action(/^vin-(confirm|cancel):([a-f0-9]{16})$/, async (ctx) => {
      const user = await this.getTelegramUser(ctx), state = this.sessions.get(ctx);
      const pending = state?.pendingVin;
      if (!user || !state || !pending || pending.id !== ctx.match[2] || pending.expiresAt < Date.now()) {
        await ctx.reply(this.text(ctx, "Запит застарів. Надішліть VIN ще раз.", "Zapytanie wygasło. Wyślij VIN ponownie.", "This request has expired. Send the VIN again."));
        return;
      }
      delete state.pendingVin;
      await this.checkpoints.get(ctx)?.();
      if (ctx.match[1] === "cancel") { await ctx.reply(this.text(ctx, "Скасовано.", "Anulowano.", "Cancelled.")); return; }
      const result = await this.vinService.decodeStandaloneVin(user.id, pending.vin);
      await ctx.reply(this.vinResult(ctx, pending.vin, result) + "\n\n" + this.text(ctx,
        "Результат збережено в розділі «Звіти» на сайті.",
        "Wynik zapisano w sekcji „Raporty” na stronie.",
        "The result is saved in Reports on the website."), this.websiteButton(ctx));
    });
    this.bot.action(/^(confirm|cancel):([a-f0-9]{16})$/, async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      const state = this.sessions.get(ctx);
      if (!user || !state) return;
      if (ctx.match[1] === "confirm") {
        await this.conversationService.confirm(ctx, user, state, ctx.match[2], this.checkpoints.get(ctx));
      } else if (state.pending?.id === ctx.match[2]) {
        await this.conversationService.handle(ctx, user, state, "/cancel");
      }
    });
    this.bot.command(["confirm", "cancel"], async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      const state = this.sessions.get(ctx);
      if (user && state) await this.conversationService.handle(ctx, user, state, ctx.message.text.replace(/@\w+/, ""), this.checkpoints.get(ctx));
    });
    this.bot.command("vehicle", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      const state = this.sessions.get(ctx);
      if (!user || !state) return;
      const index = ctx.message.text.replace(/^\/vehicle(?:@\w+)?\s*/i, "");
      if (!/^\d+$/.test(index)) {
        await ctx.reply(this.buildGarageMessage(await this.garageService.getVehicles(user.id), botLanguage(user.language)));
        return;
      }
      await this.conversationService.handle(ctx, user, state, `#${index}`);
    });
    this.bot.command("language", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;
      const language = ctx.message.text.replace(/^\/language(?:@\w+)?\s*/i, "").trim();
      if (!["uk", "pl", "en"].includes(language)) {
        await ctx.reply("/language uk · Українська\n/language pl · Polski\n/language en · English");
        return;
      }
      await this.authService.updateProfile(user.id, { language });
      await ctx.reply(botText(botLanguage(language), "Мову збережено: українська.", "Zapisano język: polski.", "Language saved: English."));
    });

    this.bot.command("forget", async ctx => {
      const user = await this.getTelegramUser(ctx);
      const state = this.sessions.get(ctx);
      if (!user || !state) return;
      const cars = (await this.garageService.getVehicles(user.id)).filter(car => !car.isArchived);
      const vehicleId = cars.find(car => car.id === state.selectedVehicleId)?.id ?? (cars.length === 1 ? cars[0].id : undefined);
      await this.memory.clear({ ownerId: user.id, vehicleId, language: botLanguage(user.language) });
      state.history = []; delete state.pending; delete state.awaitingVehicleFor;
      await ctx.reply(botText(botLanguage(user.language),
        "Спільну історію цього чату на сайті й у Telegram очищено. Записи автомобіля та нагадування збережено.",
        "Wspólna historia tego czatu na stronie i w Telegramie została wyczyszczona. Wpisy auta i przypomnienia zostały zachowane.",
        "This chat's shared history on the website and in Telegram has been cleared. Vehicle records and reminders were kept."));
    });

    this.bot.command("reminders", async ctx => {
      const user = await this.getTelegramUser(ctx);
      const state = this.sessions.get(ctx);
      if (!user || !state) return;
      const vehicles = (await this.garageService.getVehicles(user.id)).filter(vehicle => !vehicle.isArchived);
      const vehicle = vehicles.find(vehicle => vehicle.id === state.selectedVehicleId) ?? (vehicles.length === 1 ? vehicles[0] : undefined);
      if (!vehicle) { await ctx.reply(this.buildGarageMessage(vehicles, botLanguage(user.language))); return; }
      const result = await this.remindersService.list(user.id, vehicle.id);
      const language = botLanguage(user.language);
      const active = result.reminders.filter(reminder => reminder.status === "active");
      const lines = active.slice(0, 20).map((reminder, index) => {
        const next = reminder.deliveries.find(delivery => delivery.status === "pending" || delivery.status === "sending");
        const problem = reminder.deliveries.some(delivery => delivery.status === "failed" || delivery.status === "uncertain");
        return `${index + 1}. ${reminder.title} · ${reminder.dueDate.split("-").reverse().join(".")}`
          + (next ? `\n${DateTime.fromJSDate(next.scheduledAt, { zone: reminder.timeZone }).toFormat("dd.MM.yyyy HH:mm")} · ${reminder.timeZone}` : "")
          + (problem ? "\n" + botText(language, "Є непідтверджена доставка. Перевірте статус на сайті.", "Nie potwierdzono dostarczenia jednego z powiadomień. Sprawdź status na stronie.", "A notification was not confirmed delivered. Check its status on the website.") : "");
      });
      const text = [botText(language, "Нагадування", "Przypomnienia", "Reminders"), this.vehicleTitle(vehicle),
        ...lines, !active.length ? botText(language, "Активних нагадувань немає.", "Brak aktywnych przypomnień.", "No active reminders.") : "",
        !result.deliveryEnabled ? botText(language, "Автоматичне надсилання ще не ввімкнено на сервері.", "Automatyczna wysyłka nie jest jeszcze włączona na serwerze.", "Automatic delivery is not yet enabled on the server.") : "",
      ].filter(Boolean).join("\n\n");
      for (const chunk of splitTelegramText(text)) await ctx.reply(chunk);
    });

    this.bot.start(async (ctx) => {
      if (/\slink_/.test(ctx.message.text)) {
        const user = await this.getTelegramUser(ctx);
        await ctx.reply(botText(botLanguage(user?.language), "Telegram під’єднано до вашого акаунта сайту. Гараж і записи тепер спільні. /garage", "Telegram połączono z Twoim kontem na stronie. Garaż i wpisy są teraz wspólne. /garage", "Telegram is linked to your website account. Your garage and records are now shared. /garage"));
        return;
      }
      const user = await this.getTelegramUser(ctx);
      await ctx.reply(this.helpText(botLanguage(user?.language)), this.websiteButton(ctx));
    });

    this.bot.command("help", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      await ctx.reply(this.helpText(botLanguage(user?.language)), this.websiteButton(ctx));
    });

    this.bot.command("website", async (ctx) => {
      await ctx.reply(this.text(ctx, "Відкрити CARA:", "Otwórz CARA:", "Open CARA:"), this.websiteButton(ctx));
    });

    this.bot.command("garage", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;

      const vehicles = await this.garageService.getVehicles(user.id);
      await ctx.reply(this.buildGarageMessage(vehicles, botLanguage(user.language)), this.websiteButton(ctx));
    });

    this.bot.command("addcar", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;

      const text = ctx.message.text.replace(/^\/addcar(?:@\w+)?/i, "").trim();
      const [vinCandidate, ...nicknameParts] = text.split(/\s+/);
      const vin = vinCandidate?.trim().toUpperCase();

      if (!vin || !VIN_REGEX.test(vin)) {
        await ctx.reply(
          this.text(ctx, "Укажіть VIN після команди. Наприклад:\n/addcar WBA12345678901234 BMW 320d", "Podaj VIN po komendzie. Na przykład:\n/addcar WBA12345678901234 BMW 320d", "Enter the VIN after the command, for example:\n/addcar WBA12345678901234 BMW 320d"),
        );
        return;
      }

      const existing = (await this.garageService.getVehicles(user.id, true)).find((vehicle) => vehicle.vin?.toUpperCase() === vin);
      if (existing) {
        await ctx.reply(this.text(ctx, "Це авто вже є в гаражі. Відкрийте /garage, щоб вибрати його.", "To auto jest już w garażu. Wybierz je przez /garage.", "This car is already in your garage. Select it with /garage."));
        return;
      }
      const vehicle = await this.garageService.createVehicle(user.id, {
        vin,
        nickname: nicknameParts.join(" ").trim() || undefined,
      });

      const updated = await this.garageService.getVehicle(user.id, vehicle.id);

      await ctx.reply(
        [
          this.text(ctx, "Автомобіль додано в гараж.", "Dodano auto do garażu.", "The car has been added to your garage."),
          "",
          this.formatVehicle(updated, 1, botLanguage(user.language)),
          "",
          this.text(ctx, "Можна записати пробіг командою /mileage 123456 або поставити запитання про авто.", "Zapisz przebieg komendą /mileage 123456 lub zapytaj o auto.", "Record mileage with /mileage 123456 or ask a question about the car."),
        ].join("\n"),
        this.websiteButton(ctx),
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
        await ctx.reply(this.text(ctx, "Напишіть запитання після /ask або звичайним повідомленням.", "Napisz pytanie po /ask lub wyślij je jako zwykłą wiadomość.", "Write your question after /ask or send it as a normal message."));
        return;
      }

      await this.answerQuestion(ctx, user, question);
    });

    this.bot.command("vin", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      if (!user) return;
      const vin = ctx.message.text
        .replace(/^\/vin(?:@\w+)?/i, "")
        .trim()
        .toUpperCase();

      if (!vin) {
        await ctx.reply(
          this.text(ctx, "Укажіть VIN після команди. Наприклад:\n/vin WBA12345678901234", "Podaj VIN po komendzie. Na przykład:\n/vin WBA12345678901234", "Enter the VIN after the command, for example:\n/vin WBA12345678901234"),
        );
        return;
      }

      if (!VIN_REGEX.test(vin)) {
        await ctx.reply(
          this.text(ctx, "VIN має містити рівно 17 символів без літер I, O та Q.", "VIN musi mieć dokładnie 17 znaków, bez liter I, O i Q.", "A VIN must contain exactly 17 characters, excluding I, O and Q."),
        );
        return;
      }

      if (!this.vinLookupEnabled) {
        await ctx.reply(
          [
            `VIN: ${vin}`,
            "",
            this.text(ctx, "Перевірку у VIN-провайдера вимкнено. Дані автомобіля не перевірено.", "Sprawdzanie u dostawcy VIN jest wyłączone. Dane auta nie zostały zweryfikowane.", "VIN provider lookups are disabled. The vehicle details have not been verified."),
          ].join("\n"),
          this.websiteButton(ctx),
        );

        return;
      }

      await this.replyWithVinDecode(ctx, vin);
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

      if (text.startsWith("/")) {
        await ctx.reply(botText(botLanguage(user.language), "Такої команди немає. Опишіть прохання звичайним текстом або відкрийте /help.", "Nie ma takiej komendy. Opisz prośbę własnymi słowami lub otwórz /help.", "Unknown command. Describe your request in plain language or open /help."));
        return;
      }

      await this.answerQuestion(ctx, user, text);
    });
    this.bot.on("message", async (ctx) => {
      const user = await this.getTelegramUser(ctx);
      await ctx.reply(botText(botLanguage(user?.language),
        "Поки можу обробляти текстові повідомлення. Файл документа можна завантажити на сайті.",
        "Na razie obsługuję wiadomości tekstowe. Plik dokumentu możesz przesłać na stronie.",
        "I currently handle text messages. You can upload document files on the website."), this.websiteButton(ctx));
    });
  }

  private helpText(language: "uk" | "pl" | "en"): string {
    const help = botText(language,
      "Вітаю! Я CARA. Запитайте про авто або опишіть, що потрібно записати. Наприклад: «Коли наступне ТО?» або «Запиши мийку за 80 PLN». Перед збереженням покажу дані для підтвердження.\n\n/garage — ваші авто\n/vehicle 2 — вибрати авто\n/language uk, pl, en — мова\n/cancel — скасувати дію\n/website — відкрити сайт\n\nЩоб бачити гараж із сайту, під’єднайте Telegram у налаштуваннях сайту.",
      "Cześć! Jestem CARA. Zapytaj o auto lub opisz, co chcesz zapisać. Na przykład: „Kiedy następny serwis?” lub „Zapisz myjnię za 80 PLN”. Przed zapisem pokażę dane do potwierdzenia.\n\n/garage — Twoje auta\n/vehicle 2 — wybierz auto\n/language uk, pl, en — język\n/cancel — anuluj operację\n/website — otwórz stronę\n\nAby widzieć garaż ze strony, połącz Telegram w ustawieniach strony.",
      "Hi! I'm CARA. Ask about your car or describe what you want to record, for example: 'When is the next service?' or 'Record a car wash for 80 PLN'. I'll show the details for confirmation before saving.\n\n/garage — your cars\n/vehicle 2 — choose a car\n/language uk, pl, en — language\n/cancel — cancel an action\n/website — open the website\n\nTo use your website garage, link Telegram in the website settings.");
    return help + "\n\n" + botText(language,
      "/forget - очистити спільну історію цього чату на сайті й у Telegram; записи авто та нагадування залишаться.",
      "/forget - wyczyść wspólną historię tego czatu na stronie i w Telegramie; wpisy auta i przypomnienia zostaną zachowane.",
      "/forget - clear this chat's shared history on the website and in Telegram; vehicle records and reminders will be kept.");
  }

  private async getTelegramUser(ctx: Context): Promise<User | null> {
    const cached = this.authenticatedUsers.get(ctx);
    if (cached) return cached;
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
        this.text(ctx, "Укажіть пробіг числом. Наприклад: /mileage 123456.", "Podaj przebieg jako liczbę. Na przykład: /mileage 123456.", "Enter the mileage as a number, for example: /mileage 123456."),
      );
      return;
    }

    const vehicle = await this.requireVehicleForTelegram(ctx, user, parsed.vehicleIndex);
    if (!vehicle) return;

    const reading = await this.mileageService.recordReading(user.id, vehicle.id, {
      odometerKm: parsed.odometerKm,
      source: "telegram",
      confidence: 1,
    });

    await ctx.reply(
      [
        this.text(ctx, "Пробіг записано.", "Zapisano przebieg.", "Mileage recorded."),
        "",
        `${this.vehicleTitle(vehicle)}: ${reading.odometerKm.toLocaleString(this.locale(ctx))} ${this.text(ctx, "км", "km", "km")}`,
        this.text(ctx, "Дата: ", "Data: ", "Date: ") + reading.recordedAt.toLocaleDateString(this.locale(ctx)),
      ].join("\n"),
      this.websiteButton(ctx),
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
        this.text(ctx, "Укажіть суму, валюту й назву. Наприклад: /expense 120 PLN мийка", "Podaj kwotę, walutę i nazwę. Na przykład: /expense 120 PLN myjnia", "Enter the amount, currency and title, for example: /expense 120 PLN car wash"),
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
          this.text(ctx, "Витрату записано.", "Zapisano wydatek.", "Expense recorded."),
          "",
          `${this.vehicleTitle(vehicle)}: ${result.expense.title}`,
          `${result.calculations.totalCost.toLocaleString(this.locale(ctx), {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ${result.expense.currency}`,
        ].join("\n"),
        this.websiteButton(ctx),
      );
    } catch (error) {
      await ctx.reply(this.text(ctx, "Не вдалося записати витрату. Перевірте дані й спробуйте ще раз.", "Nie udało się zapisać wydatku. Sprawdź dane i spróbuj ponownie.", "The expense could not be saved. Check the details and try again."));
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
        this.text(ctx, "Перевірте формат. Приклад: ", "Sprawdź format. Przykład: ", "Check the format, for example: ") +
          (kind === "fuel" ? "/fuel 45 l 280 PLN 123456" : "/charge 42 kWh 90 PLN 123456"),
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
        energyType: kind === "fuel" ? "unspecified" : "electricity",
        volumeLiters: parsed.volumeLiters,
        energyKwh: parsed.energyKwh,
        totalCost: parsed.totalCost,
        currency: parsed.currency,
        odometerKm: parsed.odometerKm,
        isFullTank: kind === "fuel" && parsed.isFullTank,
        source: "telegram",
      });

      await ctx.reply(
        [
          kind === "fuel" ? this.text(ctx, "Заправку записано.", "Zapisano tankowanie.", "Fuel entry recorded.")
            : this.text(ctx, "Заряджання записано.", "Zapisano ładowanie.", "Charging entry recorded."),
          "",
          `${this.vehicleTitle(vehicle)}: ${
            parsed.volumeLiters
              ? `${parsed.volumeLiters} ${this.text(ctx, "л", "l", "l")}`
              : `${parsed.energyKwh} ${this.text(ctx, "кВт·год", "kWh", "kWh")}`
          }`,
          result.calculations.totalCost !== null && result.entry.currency
            ? `${result.calculations.totalCost.toLocaleString(this.locale(ctx), {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} ${result.entry.currency}`
            : null,
          parsed.odometerKm !== undefined ? this.text(ctx, "Пробіг: ", "Przebieg: ", "Mileage: ") + `${parsed.odometerKm} ${this.text(ctx, "км", "km", "km")}` : null,
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
        this.websiteButton(ctx),
      );
    } catch (error) {
      await ctx.reply(
        this.text(ctx, "Не вдалося зберегти запис. Перевірте дані й спробуйте ще раз.", "Nie udało się zapisać wpisu. Sprawdź dane i spróbuj ponownie.", "The entry could not be saved. Check the details and try again."),
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
        this.text(ctx, "Укажіть роботи, суму й пробіг. Наприклад: /service заміна оливи 450 PLN 123456", "Podaj prace, kwotę i przebieg. Na przykład: /service wymiana oleju 450 PLN 123456", "Enter the work, amount and mileage, for example: /service oil change 450 PLN 123456"),
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
          this.text(ctx, "Сервісний запис додано.", "Dodano wpis serwisowy.", "Service record added."),
          "",
          `${this.vehicleTitle(vehicle)}: ${result.record.title}`,
          result.record.totalCost && result.record.currency
            ? `${result.record.totalCost} ${result.record.currency}`
            : null,
          parsed.odometerKm !== undefined ? this.text(ctx, "Пробіг: ", "Przebieg: ", "Mileage: ") + `${parsed.odometerKm} ${this.text(ctx, "км", "km", "km")}` : null,
          parsed.totalCost !== undefined ? this.text(ctx, "Вартість сервісу довідкова. Для фінансового обліку додайте окрему витрату.", "Koszt serwisu jest informacyjny. Do rozliczeń dodaj osobny wydatek.", "The service cost is informational. Add a separate expense to include it in spending totals.") : null,
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
        this.websiteButton(ctx),
      );
    } catch (error) {
      await ctx.reply(this.text(ctx, "Не вдалося додати сервісний запис. Перевірте дані й спробуйте ще раз.", "Nie udało się dodać wpisu serwisowego. Sprawdź dane i spróbuj ponownie.", "The service record could not be added. Check the details and try again."));
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
        this.text(ctx, "Перевірте формат. Наприклад: /document insurance OC 2027-10-06", "Sprawdź format. Na przykład: /document insurance OC 2027-10-06", "Check the format, for example: /document insurance OC 2027-10-06"),
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
          this.text(ctx, "Документ додано.", "Dodano dokument.", "Document added."),
          "",
          `${this.vehicleTitle(vehicle)}: ${result.document.title}`,
          result.document.expiresAt
            ? this.text(ctx, "Діє до: ", "Ważny do: ", "Valid until: ") + result.document.expiresAt.toLocaleDateString(this.locale(ctx))
            : null,
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
        this.websiteButton(ctx),
      );
    } catch (error) {
      await ctx.reply(this.text(ctx, "Не вдалося додати документ. Перевірте дані й спробуйте ще раз.", "Nie udało się dodać dokumentu. Sprawdź dane i spróbuj ponownie.", "The document could not be added. Check the details and try again."));
    }
  }

  private async answerQuestion(
    ctx: Context,
    user: User,
    text: string,
  ): Promise<void> {
    const state = this.sessions.get(ctx);
    if (state) await this.conversationService.handle(ctx, user, state, text, this.checkpoints.get(ctx));
  }

  private async replyWithVinDecode(ctx: Context, vin: string): Promise<void> {
    if (!this.vinLookupEnabled) {
      await ctx.reply(
        [
          `VIN: ${vin}`,
          "",
          this.text(ctx, "Перевірку у VIN-провайдера вимкнено. Дані автомобіля не перевірено.", "Sprawdzanie u dostawcy VIN jest wyłączone. Dane auta nie zostały zweryfikowane.", "VIN provider lookups are disabled. The vehicle details have not been verified."),
          this.text(ctx, "Додати авто: /addcar VIN", "Dodaj auto: /addcar VIN", "Add a car: /addcar VIN"),
        ].join("\n"),
        this.websiteButton(ctx),
      );

      return;
    }

    const user = await this.getTelegramUser(ctx), state = this.sessions.get(ctx);
    if (!user || !state) return;
    await this.vinService.ensureAccess(user.id);
    delete state.pending;
    const id = randomBytes(8).toString("hex");
    await ctx.reply(`VIN: ${vin}\n\n${vinConsentText(botLanguage(user.language))}`, Markup.inlineKeyboard([
      Markup.button.callback(this.text(ctx, "Перевірити VIN", "Sprawdź VIN", "Check VIN"), `vin-confirm:${id}`),
      Markup.button.callback(this.text(ctx, "Скасувати", "Anuluj", "Cancel"), `vin-cancel:${id}`),
    ]));
    state.pendingVin = { id, vin, expiresAt: Date.now() + 10 * 60 * 1000 };
  }

  private vinResult(ctx: Context, vin: string, result: Awaited<ReturnType<VinService["decodeStandaloneVin"]>>): string {
    const language = botLanguage(this.authenticatedUsers.get(ctx)?.language);
    const fields = [
      [this.text(ctx, "Марка", "Marka", "Make"), result.make],
      [this.text(ctx, "Модель", "Model", "Model"), result.model],
      [this.text(ctx, "Рік", "Rok", "Year"), result.modelYear],
      [this.text(ctx, "Двигун", "Silnik", "Engine"), result.engineCode],
      [this.text(ctx, "Об’єм, см³", "Pojemność, cm³", "Displacement, cm³"), result.displacementCc],
      [this.text(ctx, "Потужність, к.с.", "Moc, KM", "Power, hp"), result.powerHp],
      [this.text(ctx, "Пальне", "Paliwo", "Fuel"), result.fuelType && botFieldValue("fuelType", result.fuelType, language)],
      [this.text(ctx, "Коробка передач", "Skrzynia biegów", "Transmission"), result.transmissionType && botFieldValue("transmissionType", result.transmissionType, language)],
      [this.text(ctx, "Привід", "Napęd", "Drive"), result.driveType && botFieldValue("driveType", result.driveType, language)],
    ];
    return [`VIN: ${vin}`, ...fields.filter(([, value]) => value != null && value !== "").map(([label, value]) => `${label}: ${value}`)].join("\n");
  }

  private parseMileage(
    text: string,
  ): { odometerKm: number; vehicleIndex?: number } | null {
    const cleaned = text.replace(/^(?:пробіг|одометр|mileage)\s*[:=]?\s*/i, "");
    const { text: value, vehicleIndex } = this.extractTrailingVehicleIndex(cleaned);
    const match = value.match(/^(\d+(?:[ \u00a0]\d{3})*)(?:\s*(?:км|km))?$/i);
    if (!match) return null;
    const odometerKm = Number(match[1].replace(/\s+/g, ""));
    if (!Number.isSafeInteger(odometerKm) || odometerKm < 0 || odometerKm > 2147483647) return null;

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
    isFullTank: boolean;
  } | null {
    if (/(?:^|\s)-\d/.test(text)) return null;
    const { text: withoutVehicleIndex, vehicleIndex } =
      this.extractTrailingVehicleIndex(text);

    const volumePattern =
      kind === "fuel"
        ? /(\d+(?:[.,]\d{1,3})?)\s*(?:litres?|liters?|літр(?:и|ів|а)?|l|л)(?!\p{L})/iu
        : /(\d+(?:[.,]\d{1,3})?)\s*(?:kwh|квт\s*[·⋅.]?\s*год)(?!\p{L})/iu;
    const volumeMatch = withoutVehicleIndex.match(volumePattern);

    if (!volumeMatch) return null;

    const remainder = withoutVehicleIndex.replace(volumeMatch[0], " ");
    const moneyMatch = remainder.match(
      /(\d+(?:[.,]\d{1,2})?)\s*([A-Za-z]{3})(?![A-Za-z])/i,
    );
    const odometerMatch = (moneyMatch ? remainder.replace(moneyMatch[0], " ") : remainder).match(
      /(?:^|\s)(\d{4,8})(?:\s*(?:км|km))?(?:\s|$)/i,
    );

    const amount = this.parseNumber(volumeMatch[1]);
    if (!amount) return null;

    return {
      volumeLiters: kind === "fuel" ? amount : undefined,
      energyKwh: kind === "charge" ? amount : undefined,
      isFullTank: kind === "fuel" && /(?:повний\s+бак|pełny\s+bak|full(?:\s+tank)?)/i.test(withoutVehicleIndex)
        && !/(?:не\s*повний|nie\s*pełny|not\s+(?:a\s+)?full)/i.test(withoutVehicleIndex),
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
    if (/(?:^|\s)-\d/.test(text)) return null;
    const { text: withoutVehicleIndex, vehicleIndex } =
      this.extractTrailingVehicleIndex(text);
    const moneyMatch = withoutVehicleIndex.match(
      /(\d+(?:[.,]\d{1,2})?)\s*([A-Za-z]{3})(?![A-Za-z])/i,
    );
    const withoutMoney = moneyMatch ? withoutVehicleIndex.replace(moneyMatch[0], " ") : withoutVehicleIndex;
    const odometerMatch = withoutMoney.match(
      /(?:^|\s)(\d{4,8})(?:\s*(?:км|km))?(?:\s|$)/i,
    );

    const title = (odometerMatch ? withoutMoney.replace(odometerMatch[0], " ") : withoutMoney).trim();

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

    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt.toISOString().slice(0, 10) !== dateMatch![1])) return null;
    if (!["insurance", "registration", "inspection", "service-invoice", "purchase", "warranty", "tax", "fine", "receipt", "manual", "other"].includes(typeCandidate.toLowerCase())) return null;

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
    const state = this.sessions.get(ctx);
    const vehicle = vehicleIndex !== undefined ? this.resolveVehicle(vehicles, vehicleIndex)
      : vehicles.find((v) => v.id === state?.selectedVehicleId && !v.isArchived) ?? this.resolveVehicle(vehicles);

    if (!vehicle) {
      await ctx.reply(this.buildChooseVehicleMessage(vehicles, botLanguage(user.language)), this.websiteButton(ctx));
      return null;
    }

    if (state) state.selectedVehicleId = vehicle.id;
    return vehicle;
  }

  private extractTrailingVehicleIndex(text: string): {
    text: string;
    vehicleIndex?: number;
  } {
    const match = text.trim().match(/^(.*\S)\s+#?([1-9]\d?)$/s);
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

    if (/страх|ubezpiec|insurance|\b(?:oc|ac)\b/.test(text)) return "insurance";
    if (/мийк|myjni|wash|clean/.test(text)) return "wash";
    if (/парку|parking/.test(text)) return "parking";
    if (/штраф|fine|ticket/.test(text)) return "fine";
    if (/шин|opon|tire|tyre/.test(text)) return "tires";
    if (/подат|podat|tax/.test(text)) return "tax";

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

    if (/діагност|diagnost/.test(text)) return "diagnostic";
    if (/огляд|inspection|техогляд|przegląd/.test(text)) return "inspection";
    if (/замін|wymian|replace|масл|олив|olej|oil|filter|фільтр/.test(text)) return "replacement";
    if (/ремонт|napraw|repair|fix/.test(text)) return "repair";
    if (/upgrade|тюнінг|покращ/.test(text)) return "upgrade";

    return "maintenance";
  }

  private buildGarageMessage(vehicles: Vehicle[], language: BotLanguage): string {
    const activeVehicles = vehicles.filter((vehicle) => !vehicle.isArchived);

    if (activeVehicles.length === 0) {
      return [
        botText(language, "У гаражі поки немає автомобілів.", "Garaż jest pusty.", "Your garage is empty."),
        "",
        botText(language, "Додати можна так:", "Dodaj auto w ten sposób:", "Add a car like this:"),
        "/addcar WBA12345678901234 BMW 320d",
      ].join("\n");
    }

    return [
      botText(language, "Ваш гараж:", "Twój garaż:", "Your garage:"),
      "",
      ...activeVehicles.map((vehicle, index) =>
        this.formatVehicle(vehicle, index + 1, language),
      ),
      "",
      botText(language, "Вибрати авто: /vehicle 2. Записати пробіг другого авто: /mileage 123456 2.", "Wybierz auto: /vehicle 2. Zapisz przebieg drugiego auta: /mileage 123456 2.", "Select a car: /vehicle 2. Record mileage for car 2: /mileage 123456 2."),
    ].join("\n");
  }

  private buildChooseVehicleMessage(vehicles: Vehicle[], language: BotLanguage): string {
    const activeVehicles = vehicles.filter((vehicle) => !vehicle.isArchived);

    if (activeVehicles.length === 0) {
      return [
        botText(language, "Спочатку додайте автомобіль.", "Najpierw dodaj auto.", "Add a car first."),
        "",
        botText(language, "Приклад:", "Przykład:", "Example:"),
        "/addcar WBA12345678901234 BMW 320d",
      ].join("\n");
    }

    return [
      botText(language, "Виберіть автомобіль за номером:", "Wybierz auto według numeru:", "Choose a car by number:"),
      "",
      ...activeVehicles.map((vehicle, index) =>
        this.formatVehicle(vehicle, index + 1, language),
      ),
      "",
      botText(language, "Приклади:", "Przykłady:", "Examples:"),
      "/mileage 123456 2",
      "/vehicle 2",
    ].join("\n");
  }

  private formatVehicle(vehicle: Vehicle, index: number, language: BotLanguage): string {
    const vin = vehicle.vin ? `VIN ${vehicle.vin}` : botText(language, "VIN не вказано", "Nie podano VIN", "No VIN provided");
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

  private text(ctx: Context, uk: string, pl: string, en: string): string {
    return botText(botLanguage(this.authenticatedUsers.get(ctx)?.language), uk, pl, en);
  }

  private locale(ctx: Context): string {
    return this.text(ctx, "uk-UA", "pl-PL", "en-GB");
  }

  private websiteButton(ctx: Context) {
    return Markup.inlineKeyboard([
      [Markup.button.webApp(this.text(ctx, "Відкрити CARA", "Otwórz CARA", "Open CARA"), this.webAppUrl)],
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
