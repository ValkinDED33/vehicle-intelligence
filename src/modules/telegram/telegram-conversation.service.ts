import { ConflictException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { Markup, type Context } from "telegraf";
import { AssistantConversationService } from "../assistant/assistant-conversation.service";
import { AssistantMemoryService } from "../assistant/assistant-memory.service";
import { GarageService } from "../garage/services/garage.service";
import type { User } from "../identity/schemas/user.schema";
import { TelegramActionsService } from "./telegram-actions.service";
import { botLanguage, botText, interruptedEffectText, type ActionName, type BotLanguage, type ConversationCheckpoint, type ConversationState } from "./telegram-conversation.types";
import { reportLabel } from "./telegram-report-catalog";
import { DateTime } from "luxon";
import { buildReminderSchedule, type ReminderInput } from "../reminders/reminder-schedule";
import { MAINTENANCE_TASKS } from "../maintenance/maintenance-keys";
import { vinConsentText } from "./telegram-vin-text";

export function splitTelegramText(text: string): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > 3800) {
    let end = rest.lastIndexOf("\n", 3800);
    if (end < 1900) end = 3800;
    if (/[\uD800-\uDBFF]/.test(rest[end - 1])) end -= 1;
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

@Injectable()
export class TelegramConversationService {
  private readonly logger = new Logger(TelegramConversationService.name);
  constructor(
    private readonly assistant: AssistantConversationService,
    private readonly garage: GarageService,
    private readonly actions: TelegramActionsService,
    private readonly memory: AssistantMemoryService,
  ) {}

  async handle(ctx: Context, user: User, state: ConversationState, message: string, checkpoint?: ConversationCheckpoint): Promise<void> {
    const language = botLanguage(user.language);
    if (/^(?:\/cancel|скасувати|скасуй|ні|не треба|anuluj|nie|cancel|no|нет|отмена)[.!]?$/i.test(message)) {
      const reference = state.pending?.memory;
      delete state.pending;
      delete state.awaitingVehicleFor;
      const answer = botText(language, "Скасовано.", "Anulowano.", "Cancelled.");
      if (reference) await this.memory.record({ ownerId: user.id, ...reference }, reference.epoch, [{ role: "assistant", content: answer }], "telegram").catch(() => undefined);
      await ctx.reply(answer);
      return;
    }
    if (/^(?:\/confirm|підтверджую|підтвердити|збережи|зберегти|так|potwierdzam|potwierdź|zapisz|tak|confirm|yes|save|ok|ок|добре|да)[.!]?$/i.test(message)) {
      await this.confirm(ctx, user, state, undefined, checkpoint);
      return;
    }
    // A new question/correction invalidates the previous confirmation buttons.
    delete state.pending;
    const vehicles = (await this.garage.getVehicles(user.id)).filter((v) => !v.isArchived);
    if (!vehicles.some((v) => v.id === state.selectedVehicleId)) delete state.selectedVehicleId;
    if (vehicles.length === 1) state.selectedVehicleId = vehicles[0].id;
    const choice = message.match(/^#(\d+)(?:[\s:]+(.*))?$/s)
      ?? (state.awaitingVehicleFor ? message.match(/^(\d+)$/) : null);
    if (choice) {
      const vehicle = vehicles[Number(choice[1]) - 1];
      if (!vehicle) {
        await ctx.reply(botText(language, "Авто з таким номером немає. Відкрийте /garage.", "Nie ma auta z tym numerem. Otwórz /garage.", "There is no car with that number. Open /garage."));
        return;
      }
      state.selectedVehicleId = vehicle.id;
      message = choice[2]?.trim() || state.awaitingVehicleFor || "";
      delete state.awaitingVehicleFor;
      if (!message) {
        await ctx.reply(botText(language, "Авто вибрано: ", "Wybrano auto: ", "Selected car: ") + [vehicle.make, vehicle.model, vehicle.nickname].filter(Boolean).join(" "));
        return;
      }
    }
    await ctx.sendChatAction("typing").catch(() => undefined);
    let turn = await this.assistant.planTurn({
      ownerId: user.id, vehicleId: state.selectedVehicleId, message, language,
    });
    const requestedVehicle = turn.selectedVehicleId ?? (turn.action as { vehicleId?: string } | null)?.vehicleId;
    if (requestedVehicle && requestedVehicle !== state.selectedVehicleId) {
      const owned = await this.garage.getVehicles(user.id, true);
      if (owned.some(vehicle => vehicle.id === requestedVehicle)) {
        state.selectedVehicleId = requestedVehicle;
        turn = await this.assistant.planTurn({ ownerId: user.id, vehicleId: requestedVehicle, message, language });
      }
    }
    const finalVehicle = turn.selectedVehicleId ?? (turn.action as { vehicleId?: string } | null)?.vehicleId;
    if (finalVehicle && finalVehicle !== state.selectedVehicleId) {
      await ctx.reply(botText(language, "Уточніть авто в /garage. Змін не збережено.", "Wybierz auto w /garage. Nie zapisano zmian.", "Choose a car in /garage. No changes were saved."));
      return;
    }
    if (!await this.memory.isCurrent({ ownerId: user.id, ...turn.memoryReference }, turn.memoryReference.epoch)) {
      throw new ConflictException("Assistant memory changed");
    }
    if (!turn.action) {
      if (!state.selectedVehicleId && vehicles.length > 1) state.awaitingVehicleFor = message;
      for (const chunk of splitTelegramText(turn.answer)) await ctx.reply(chunk);
      return;
    }
    const proposed = turn.action as Record<string, unknown>;
    const action = await this.actions.prepare({ ...proposed,
      ...(proposed.vehicleId ? {} : { vehicleId: state.selectedVehicleId }),
    });
    const ownedVehicles = await this.garage.getVehicles(user.id, true);
    const target = ownedVehicles.find((vehicle) => vehicle.id === action.vehicleId);
    if (action.operation !== "add_vehicle" && (!target || (target.isArchived && action.operation !== "restore_vehicle"))) {
      await ctx.reply(botText(language, "Уточніть авто в /garage. Змін не збережено.", "Wybierz auto w /garage. Nie zapisano zmian.", "Choose a car in /garage. No changes were saved."));
      return;
    }
    if (action.operation === "request_report") {
      await this.actions.ensureReportAccess(user.id);
      const vin = target?.vin?.trim().toUpperCase();
      if (!vin || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
        await ctx.reply(botText(language, "Спочатку додайте коректний VIN у профіль авто. Запит до провайдера не запускався.", "Najpierw dodaj prawidłowy VIN do profilu auta. Nie wysłano zapytania do dostawcy.", "Add a valid VIN to the car profile first. No provider request was made."));
        return;
      }
      action.expectedVin = vin;
    }
    const currentReminder = ["update_reminder", "cancel_reminder", "complete_reminder"].includes(action.operation)
      ? await this.actions.getReminder(user.id, action.vehicleId!, String(action.input.id)) : null;
    if (currentReminder) {
      if (currentReminder.status !== "active") {
        await ctx.reply(botText(language, "Це нагадування вже закрито. Оновіть список: /reminders.", "To przypomnienie jest już zamknięte. Odśwież listę: /reminders.", "This reminder is already closed. Refresh the list with /reminders."));
        return;
      }
      action.expectedReminderRevision = currentReminder.revision;
      if(currentReminder.maintenanceRuleId&&["update_reminder","complete_reminder"].includes(action.operation)) {
        await ctx.reply(botText(language,
          "Це нагадування за регламентом ТО. Для виконаних робіт додайте сервісний запис, а для зміни строків — змініть регламент.",
          "To przypomnienie wynika z harmonogramu serwisu. Wykonane prace zapisz jako wpis serwisowy, a terminy zmień w harmonogramie.",
          "This reminder comes from a maintenance rule. Record completed work as a service entry, or edit the rule to change its schedule."));
        return;
      }
    }
    const id = randomBytes(8).toString("hex");
    const targetName = target ? [target.make, target.model, target.nickname, target.licensePlate].filter(Boolean).join(" ") : "";
    const isReport = action.operation === "request_report";
    let warning = isReport ? "\n\n" + vinConsentText(language) : "";
    if(currentReminder?.maintenanceRuleId&&action.operation==='cancel_reminder')warning+='\n\n'+botText(language,
      "Буде вимкнено всі сповіщення цього регламенту ТО, а не лише одне нагадування.",
      "Zostaną wyłączone wszystkie powiadomienia dla tego harmonogramu serwisu, nie tylko to przypomnienie.",
      "All notifications for this maintenance rule will be disabled, not just this reminder.");
    if (["reminder", "update_reminder"].includes(action.operation)) {
      const schedule = buildReminderSchedule(action.input as unknown as ReminderInput);
      warning = "\n\n" + botText(language, "Дати сповіщень у Telegram:", "Terminy powiadomień w Telegramie:", "Telegram notification dates:") + "\n"
        + schedule.scheduledAt.map(date => DateTime.fromJSDate(date, { zone: schedule.timeZone }).toFormat("dd.MM.yyyy HH:mm")).join("\n")
        + `\n${schedule.timeZone}`;
      if (!this.actions.reminderDeliveryEnabled) warning += "\n" + botText(language,
        "Автоматичне надсилання ще не ввімкнено на сервері.",
        "Automatyczna wysyłka nie jest jeszcze włączona na serwerze.",
        "Automatic delivery is not yet enabled on the server.");
    }
    const preview = (isReport ? botText(language, "Перевірте запит звіту:", "Sprawdź zapytanie o raport:", "Review the report request:")
      : botText(language, "Перевірте перед збереженням:", "Sprawdź przed zapisaniem:", "Review before saving:")) +
      `\n${this.operationLabel(action.operation, language)}${targetName ? `\n${targetName}` : ""}\n` +
      (action.expectedVin ? `VIN: ${action.expectedVin}\n` : "") +
      (currentReminder ? `${currentReminder.title} · ${currentReminder.dueDate.split("-").reverse().join(".")}\n` : "") +
      Object.entries(action.input).map(([key, value]) => `${this.fieldLabel(key, language)}: ${botFieldValue(key, value, language)}`).join("\n") + warning;
    const chunks = splitTelegramText(preview);
    for (const chunk of chunks.slice(0, -1)) await ctx.reply(chunk);
    await ctx.reply(chunks[chunks.length - 1], Markup.inlineKeyboard([
      Markup.button.callback(isReport ? botText(language, "Запросити звіт", "Pobierz raport", "Fetch report") : botText(language, "Зберегти", "Zapisz", "Save"), `confirm:${id}`),
      Markup.button.callback(botText(language, "Скасувати", "Anuluj", "Cancel"), `cancel:${id}`),
    ]));
    state.pending = { id, action, expiresAt: Date.now() + 10 * 60 * 1000, memory: turn.memoryReference };
    delete state.awaitingVehicleFor;
  }

  async confirm(ctx: Context, user: User, state: ConversationState, id?: string, checkpoint?: ConversationCheckpoint): Promise<void> {
    const language = botLanguage(user.language);
    const pending = state.pending;
    if (!pending && state.lastEffect && (!id || state.lastEffect.id === id)) {
      await ctx.reply(state.lastEffect.status === "completed"
        ? botText(language, "Цю дію вже виконано. Повторно не запускаю.", "Ta operacja została już wykonana. Nie uruchamiam jej ponownie.", "This action has already been completed. I won't run it again.")
        : interruptedEffectText(language));
      return;
    }
    if (!pending || pending.expiresAt < Date.now() || (id !== undefined && pending.id !== id)) {
      if (pending && pending.expiresAt < Date.now()) delete state.pending;
      await ctx.reply(botText(language, "Це підтвердження вже неактуальне. Опишіть дію ще раз.", "To potwierdzenie jest nieaktualne. Opisz czynność ponownie.", "This confirmation is no longer valid. Describe the action again."));
      return;
    }
    if (!pending.memory || !await this.memory.isCurrent({ ownerId: user.id, ...pending.memory }, pending.memory.epoch)) {
      delete state.pending;
      await ctx.reply(botText(language,
        "Історію цього чату очищено або оновлено. Опишіть дію ще раз; старе підтвердження не виконано.",
        "Historia tego czatu została wyczyszczona lub zaktualizowana. Opisz operację ponownie; stare potwierdzenie nie zostało wykonane.",
        "This chat history was cleared or reset. Describe the action again; the old confirmation was not executed."));
      return;
    }
    if (pending.action.operation !== "add_vehicle") {
      const current = await this.garage.getVehicle(user.id, pending.action.vehicleId!);
      if (current.isArchived && pending.action.operation !== "restore_vehicle"
        || pending.action.operation === "request_report" && current.vin?.trim().toUpperCase() !== pending.action.expectedVin) {
        delete state.pending;
        await ctx.reply(botText(language, "Авто або VIN змінилися. Підготуйте запит ще раз. Дію не запускали.", "Auto lub VIN uległy zmianie. Przygotuj zapytanie ponownie. Operacja nie została uruchomiona.", "The car or VIN has changed. Prepare the request again. The action was not started."));
        return;
      }
    }
    if (!checkpoint) throw new ServiceUnavailableException("Telegram checkpoint is unavailable");
    if (pending.action.expectedReminderRevision !== undefined) {
      const current = await this.actions.getReminder(user.id, pending.action.vehicleId!, String(pending.action.input.id));
      if (current.revision !== pending.action.expectedReminderRevision || current.status !== "active") {
        delete state.pending;
        await ctx.reply(botText(language, "Нагадування змінилося. Перевірте /reminders і підготуйте запит ще раз.", "Przypomnienie uległo zmianie. Sprawdź /reminders i przygotuj prośbę ponownie.", "The reminder has changed. Check /reminders and prepare your request again."));
        return;
      }
    }
    if (["reminder", "update_reminder"].includes(pending.action.operation)) {
      try { buildReminderSchedule(pending.action.input as unknown as ReminderInput); }
      catch {
        delete state.pending;
        await ctx.reply(botText(language, "Строки нагадування вже минули або некоректні. Укажіть нові дату й час.", "Terminy przypomnienia już minęły lub są nieprawidłowe. Podaj nową datę i godzinę.", "The reminder times have passed or are invalid. Specify a new date and time."));
        return;
      }
    }
    delete state.pending;
    state.lastEffect = { id: pending.id, operation: pending.action.operation, status: "started", at: Date.now() };
    // Consume confirmation durably before a domain write or a quota-consuming provider call.
    await checkpoint();
    let answer: string;
    try {
      answer = await this.actions.execute(user.id, pending.action, language);
    } catch (error) {
      state.lastEffect.status = "uncertain";
      await checkpoint().catch(() => undefined);
      throw error;
    }
    state.lastEffect.status = "completed";
    await checkpoint();
    await this.memory.record({ ownerId: user.id, ...pending.memory }, pending.memory.epoch, [{ role: "assistant", content: answer }], "telegram")
      .catch(() => this.logger.warn("Completed Telegram action could not be added to assistant memory"));
    await ctx.reply(answer);
  }

  private operationLabel(operation: ActionName, language: BotLanguage): string {
    const labels: Record<ActionName, [string, string, string]> = {
      mileage: ["Пробіг", "Przebieg", "Mileage"], expense: ["Витрата", "Wydatek", "Expense"],
      energy: ["Заправка / заряджання", "Tankowanie / ładowanie", "Fuel / charging"],
      service: ["Сервісний запис", "Wpis serwisowy", "Service record"], document: ["Документ", "Dokument", "Document"],
      maintenance: ["Правило ТО", "Harmonogram serwisu", "Maintenance rule"], profile: ["Профіль авто", "Profil auta", "Vehicle profile"],
      update_maintenance: ["Змінити правило ТО", "Zmień harmonogram serwisu", "Update maintenance rule"],
      add_vehicle: ["Додати авто", "Dodaj auto", "Add car"], update_vehicle: ["Оновити авто", "Edytuj auto", "Update car"],
      archive_vehicle: ["Архівувати авто", "Archiwizuj auto", "Archive car"], restore_vehicle: ["Відновити авто", "Przywróć auto", "Restore car"],
      delete_document: ["Видалити документ", "Usuń dokument", "Delete document"], deactivate_maintenance: ["Вимкнути правило ТО", "Wyłącz harmonogram", "Deactivate maintenance rule"],
      request_report: ["Новий зовнішній звіт", "Nowy raport zewnętrzny", "New external report"],
      reminder: ["Нове нагадування", "Nowe przypomnienie", "New reminder"],
      update_reminder: ["Змінити нагадування", "Zmień przypomnienie", "Update reminder"],
      cancel_reminder: ["Скасувати нагадування", "Anuluj przypomnienie", "Cancel reminder"],
      complete_reminder: ["Позначити виконаним", "Oznacz jako wykonane", "Mark complete"],
    };
    return botText(language, ...labels[operation]);
  }

  private fieldLabel(key: string, language: BotLanguage): string {
    const labels: Record<string, [string, string, string]> = {
      odometerKm: ["Пробіг, км", "Przebieg, km", "Odometer, km"], totalCost: ["Сума", "Kwota", "Total"],
      currency: ["Валюта", "Waluta", "Currency"], title: ["Назва", "Nazwa", "Title"],
      volumeLiters: ["Літри", "Litry", "Litres"], energyKwh: ["Енергія, кВт·год", "Energia, kWh", "Energy, kWh"],
      isFullTank: ["Повний бак", "Pełny bak", "Full tank"], energyType: ["Пальне / енергія", "Paliwo / energia", "Fuel / energy"],
      expiresAt: ["Діє до", "Ważny do", "Valid until"], issuedAt: ["Дата видачі", "Data wydania", "Issue date"],
      occurredAt: ["Дата", "Data", "Date"], recordedAt: ["Дата показання", "Data odczytu", "Reading date"],
      intervalKm: ["Інтервал, км", "Interwał, km", "Interval, km"], intervalMonths: ["Інтервал, міс.", "Interwał, mies.", "Interval, months"],
      nickname: ["Назва авто", "Nazwa auta", "Car name"], licensePlate: ["Держномер", "Numer rejestracyjny", "Registration"],
      make: ["Марка", "Marka", "Make"], modelYear: ["Рік", "Rok", "Year"], country: ["Країна", "Kraj", "Country"],
      category: ["Категорія", "Kategoria", "Category"], type: ["Тип", "Typ", "Type"], kind: ["Операція", "Rodzaj", "Kind"],
      providerName: ["Виконавець", "Usługodawca", "Provider"], description: ["Опис", "Opis", "Description"],
      fuelType: ["Пальне", "Paliwo", "Fuel"], bodyType: ["Кузов", "Nadwozie", "Body"],
      doorCount: ["Дверей", "Drzwi", "Doors"], seatCount: ["Місць", "Miejsca", "Seats"],
      trimLevel: ["Комплектація", "Wersja wyposażenia", "Trim"], exteriorColor: ["Колір", "Kolor", "Colour"],
      engineCode: ["Код двигуна", "Kod silnika", "Engine code"], engineFamily: ["Двигун", "Silnik", "Engine"],
      displacementCc: ["Об’єм, см³", "Pojemność, cm³", "Displacement, cm³"], powerKw: ["Потужність, кВт", "Moc, kW", "Power, kW"],
      powerHp: ["Потужність, к.с.", "Moc, KM", "Power, hp"], transmissionType: ["Коробка передач", "Skrzynia biegów", "Transmission"],
      driveType: ["Привід", "Napęd", "Drive"], fuelTankCapacityLiters: ["Бак, л", "Zbiornik, l", "Tank, l"],
      documentNumber: ["Номер документа", "Numer dokumentu", "Document number"], issuerName: ["Ким видано", "Wystawca", "Issuer"],
      warningKmBefore: ["Попередження за, км", "Ostrzeżenie, km przed", "Warning, km before"],
      warningDaysBefore: ["Попередження за, днів", "Ostrzeżenie, dni przed", "Warning, days before"],
      id: ["Ідентифікатор запису", "Identyfikator wpisu", "Record ID"], vin: ["VIN", "VIN", "VIN"],
      key: ["Ключ правила", "Klucz harmonogramu", "Rule key"],
      completionEventType: ["Подія виконання", "Zdarzenie wykonania", "Completion event"],
      engineHours: ["Мотогодини", "Motogodziny", "Engine hours"],
      intervalEngineHours: ["Інтервал, мотогодин", "Interwał, motogodziny", "Interval, engine hours"],
      warningEngineHoursBefore: ["Попередження за, мотогодин", "Ostrzeżenie, motogodziny przed", "Warning, engine hours before"],
      subcategory: ["Підкатегорія", "Podkategoria", "Subcategory"],
      aspirationType: ["Наддув", "Doładowanie", "Aspiration"], transmissionCode: ["Код коробки", "Kod skrzyni", "Transmission code"],
      adBlueTankCapacityLiters: ["Бак AdBlue, л", "Zbiornik AdBlue, l", "AdBlue tank, l"],
      batteryGrossCapacityKwh: ["Повна ємність батареї, кВт·год", "Pojemność baterii brutto, kWh", "Gross battery capacity, kWh"],
      batteryUsableCapacityKwh: ["Корисна ємність батареї, кВт·год", "Pojemność użytkowa baterii, kWh", "Usable battery capacity, kWh"],
      sourceKey: ["Джерело звіту", "Źródło raportu", "Report source"],
      dueDate: ["Дата події", "Data wydarzenia", "Event date"],
      remindAt: ["Час надсилання", "Godzina wysyłki", "Notification time"],
      timeZone: ["Часовий пояс", "Strefa czasowa", "Time zone"],
      offsets: ["Нагадати за", "Przypomnij wcześniej", "Notify before"],
      reminderOffsets: ["Нагадати за", "Przypomnij wcześniej", "Notify before"],
      maintenanceKeys: ["Виконані роботи", "Wykonane prace", "Completed work"],
      maintenancePlans: ["Наступне обслуговування", "Następny serwis", "Next maintenance"],
      reminder: ["Сповіщення про закінчення дії", "Powiadomienia o wygaśnięciu", "Expiry notifications"],
      telegramEnabled: ["Сповіщення в Telegram", "Powiadomienia w Telegramie", "Telegram notifications"],
      notifyWhenDue: ["Сповістити при досягненні строку або пробігу", "Powiadom po osiągnięciu terminu lub przebiegu", "Notify when the date or mileage is reached"],
    };
    return labels[key] ? botText(language, ...labels[key]) : key;
  }

}

export function botFieldValue(key: string, value: unknown, language: BotLanguage): string {
    if (value instanceof Date) return value.toLocaleDateString(language === 'uk' ? 'uk-UA' : language === 'pl' ? 'pl-PL' : 'en-GB');
    if (key === "maintenanceKeys" && Array.isArray(value)) return value.map(task=>{
      const label=MAINTENANCE_TASKS[task as keyof typeof MAINTENANCE_TASKS];
      return label?botText(language,label[0],label[1],label[2]):String(task);
    }).join(', ');
    if (key === "maintenancePlans" && Array.isArray(value)) return value.map(plan=>{
      const units: [string,string,string][] = [["км","km","km"],["міс.","mies.","months"],["мотогодин","motogodzin","engine hours"]];
      const intervals=[plan.intervalKm,plan.intervalMonths,plan.intervalEngineHours].map((amount,index)=>amount==null?null:`${amount} ${botText(language,...units[index])}`).filter(Boolean);
      const notifications=plan.telegramEnabled==null?'':`\n${botText(language,'Telegram','Telegram','Telegram')}: ${botFieldValue('telegramEnabled',plan.telegramEnabled,language)}`;
      const schedule=plan.reminderOffsets?`\n${botFieldValue('offsets',plan.reminderOffsets,language)} · ${plan.remindAt??'09:00'} · ${plan.timeZone??'Europe/Warsaw'}`:'';
      const due=plan.notifyWhenDue==null?'':`\n${botText(language,'У строк ТО','W terminie serwisu','When due')}: ${botFieldValue('notifyWhenDue',plan.notifyWhenDue,language)}`;
      const warnings=[['warningKmBefore','km'],['warningDaysBefore','day'],['warningEngineHoursBefore','hour']].flatMap(([field,unit])=>plan[field]==null?[]:[`${botText(language,'Попередження','Ostrzeżenie','Warning')}: ${new Intl.NumberFormat(language==='uk'?'uk-UA':language==='pl'?'pl-PL':'en-GB',{style:'unit',unit:unit==='km'?'kilometer':unit,unitDisplay:'long'}).format(plan[field])}`]);
      return `${plan.title}: ${intervals.join(' / ')}${notifications}${schedule}${due}${warnings.length?'\n'+warnings.join('\n'):''}`;
    }).join('\n\n');
    if(key==='reminder'&&value&&typeof value==='object') {
      const prefs=value as {offsets?:unknown;remindAt?:string;timeZone?:string};
      return `${botFieldValue('offsets',prefs.offsets??[{amount:1,unit:'months'},{amount:1,unit:'weeks'}],language)} · ${prefs.remindAt??'09:00'} · ${prefs.timeZone??'Europe/Warsaw'}`;
    }
    if (key === "dueDate" && typeof value === "string") return value.split("-").reverse().join(".");
    if (["offsets","reminderOffsets"].includes(key) && Array.isArray(value)) return value.map(offset => {
      if (offset.amount === 0) return botText(language, "у день події", "w dniu wydarzenia", "on the event date");
      return new Intl.NumberFormat(language === "uk" ? "uk-UA" : language === "pl" ? "pl-PL" : "en-GB", {
        style: "unit", unit: offset.unit.slice(0, -1), unitDisplay: "long",
      }).format(offset.amount);
    }).join(", ");
    if (key === "sourceKey" && typeof value === "string") return reportLabel(value, language);
    if (typeof value === "boolean") return botText(language, value ? "так" : "ні", value ? "tak" : "nie", value ? "yes" : "no");
    if (key === "type" && value === "manual") return botText(language, "Інструкція", "Instrukcja", "Owner's manual");
    const labels: Record<string, [string, string, string]> = {
      wash: ["Мийка", "Myjnia", "Car wash"], maintenance: ["Обслуговування", "Obsługa", "Maintenance"],
      repair: ["Ремонт", "Naprawa", "Repair"], parts: ["Запчастини", "Części", "Parts"],
      insurance: ["Страхування", "Ubezpieczenie", "Insurance"], inspection: ["Техогляд", "Przegląd", "Inspection"],
      tax: ["Податок", "Podatek", "Tax"], parking: ["Паркування", "Parkowanie", "Parking"],
      toll: ["Платні дороги", "Opłaty drogowe", "Road tolls"], fine: ["Штраф", "Mandat", "Fine"],
      tires: ["Шини", "Opony", "Tyres"], registration: ["Реєстрація", "Rejestracja", "Registration"],
      fuel: ["Пальне", "Paliwo", "Fuel"], charge: ["Заряджання", "Ładowanie", "Charging"],
      petrol: ["Бензин", "Benzyna", "Petrol"], diesel: ["Дизель", "Olej napędowy", "Diesel"],
      electricity: ["Електроенергія", "Energia elektryczna", "Electricity"], unspecified: ["Не вказано", "Nie podano", "Unspecified"],
      replacement: ["Заміна", "Wymiana", "Replacement"], diagnostic: ["Діагностика", "Diagnostyka", "Diagnostics"],
      other: ["Інше", "Inne", "Other"], "service-invoice": ["Рахунок за сервіс", "Faktura za serwis", "Service invoice"],
      manual: ["Механічна", "Manualna", "Manual"], automatic: ["Автоматична", "Automatyczna", "Automatic"],
      detailing: ["Детейлінг", "Detailing", "Detailing"], accessories: ["Аксесуари", "Akcesoria", "Accessories"],
      roadside: ["Допомога в дорозі", "Pomoc drogowa", "Roadside assistance"], upgrade: ["Модернізація", "Modernizacja", "Upgrade"],
      purchase: ["Купівля", "Zakup", "Purchase"], warranty: ["Гарантія", "Gwarancja", "Warranty"], receipt: ["Чек", "Paragon", "Receipt"],
      lpg: ["LPG", "LPG", "LPG"], cng: ["CNG", "CNG", "CNG"], hydrogen: ["Водень", "Wodór", "Hydrogen"],
      electric: ["Електричний", "Elektryczny", "Electric"], hybrid: ["Гібрид", "Hybryda", "Hybrid"], phev: ["Плагін-гібрид", "Hybryda plug-in", "Plug-in hybrid"],
      hatchback: ["Хетчбек", "Hatchback", "Hatchback"], sedan: ["Седан", "Sedan", "Saloon"], wagon: ["Універсал", "Kombi", "Estate"],
      coupe: ["Купе", "Coupé", "Coupé"], suv: ["Позашляховик / кросовер", "SUV", "SUV"], mpv: ["Мінівен", "Minivan", "MPV"],
      van: ["Фургон", "Furgon", "Van"], pickup: ["Пікап", "Pickup", "Pickup"], convertible: ["Кабріолет", "Kabriolet", "Convertible"],
      dct: ["Роботизована (DCT)", "Dwusprzęgłowa (DCT)", "Dual-clutch (DCT)"], cvt: ["Варіатор (CVT)", "Bezstopniowa (CVT)", "CVT"],
      "single-speed": ["Одноступенева", "Jednobiegowa", "Single-speed"],
      fwd: ["Передній", "Przedni", "Front-wheel drive"], rwd: ["Задній", "Tylny", "Rear-wheel drive"],
      awd: ["Повний (AWD)", "Na wszystkie koła (AWD)", "All-wheel drive (AWD)"], "4wd": ["Повний (4WD)", "Na cztery koła (4WD)", "Four-wheel drive (4WD)"],
      "naturally-aspirated": ["Без наддуву", "Wolnossący", "Naturally aspirated"], turbo: ["Турбонаддув", "Turbo", "Turbo"],
      "twin-turbo": ["Подвійний турбонаддув", "Podwójne turbo", "Twin-turbo"], supercharged: ["Механічний наддув", "Kompresor", "Supercharged"],
      none: ["Немає", "Brak", "None"],
    };
    return ["category", "type", "kind", "fuelType", "energyType", "bodyType", "transmissionType", "driveType", "aspirationType"].includes(key) && typeof value === "string" && labels[value] ? botText(language, ...labels[value])
      : typeof value === "object" ? JSON.stringify(value) : String(value);
}
