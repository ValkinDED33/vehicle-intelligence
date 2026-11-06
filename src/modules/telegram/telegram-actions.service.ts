import { BadRequestException, Injectable } from "@nestjs/common";
import { plainToInstance, type ClassConstructor } from "class-transformer";
import { IsUUID, validate } from "class-validator";
import { CreateDocumentDto } from "../documents/dto/create-document.dto";
import { DocumentsService } from "../documents/services/documents.service";
import { CreateEnergyEntryDto } from "../energy/dto/energy.dto";
import { EnergyService } from "../energy/services/energy.service";
import { CreateExpenseDto } from "../expenses/dto/expenses.dto";
import { ExpensesService } from "../expenses/services/expenses.service";
import { CreateVehicleDto } from "../garage/dto/create-vehicle.dto";
import { UpdateVehicleDto } from "../garage/dto/update-vehicle.dto";
import { GarageService } from "../garage/services/garage.service";
import { CreateMaintenanceRuleDto, UpdateMaintenanceActionDto } from "../maintenance/dto/maintenance.dto";
import { validateMaintenanceRule } from "../maintenance/maintenance-rule-validation";
import { MaintenanceService } from "../maintenance/services/maintenance.service";
import { CreateMileageReadingDto } from "../mileage/dto/mileage.dto";
import { MileageService } from "../mileage/services/mileage.service";
import { CreateServiceRecordDto } from "../service-records/dto/service-records.dto";
import { ServiceRecordsService } from "../service-records/services/service-records.service";
import { CreateVehicleProfileDto } from "../vehicle-profile/dto/create-vehicle-profile.dto";
import { VehicleProfileService } from "../vehicle-profile/services/vehicle-profile.service";
import { ACTION_NAMES, botText, type BotAction, type BotLanguage } from "./telegram-conversation.types";
import { RequestTelegramReportDto, TelegramReportsService } from "./telegram-reports.service";
import { REPORT_ACTION_GUIDE } from "./telegram-report-catalog";
import { CreateReminderDto, ReplaceReminderDto } from "../reminders/reminder.dto";
import { RemindersService } from "../reminders/reminders.service";
import { buildReminderSchedule } from "../reminders/reminder-schedule";

class RecordIdDto {
  @IsUUID()
  id!: string;
}

const DTOS: Record<BotAction["operation"], ClassConstructor<object>> = {
  mileage: CreateMileageReadingDto, expense: CreateExpenseDto, energy: CreateEnergyEntryDto,
  service: CreateServiceRecordDto, document: CreateDocumentDto, maintenance: CreateMaintenanceRuleDto,
  profile: CreateVehicleProfileDto, add_vehicle: CreateVehicleDto, update_vehicle: UpdateVehicleDto,
  archive_vehicle: RecordIdDto, restore_vehicle: RecordIdDto,
  delete_document: RecordIdDto, deactivate_maintenance: RecordIdDto,
  request_report: RequestTelegramReportDto,
  reminder: CreateReminderDto, update_reminder: ReplaceReminderDto,
  cancel_reminder: RecordIdDto, complete_reminder: RecordIdDto,
  update_maintenance: UpdateMaintenanceActionDto,
};

const INPUT_FIELDS: Record<BotAction["operation"], readonly string[]> = {
  mileage: ["odometerKm", "engineHours", "recordedAt"],
  expense: ["category", "subcategory", "title", "currency", "totalCost", "odometerKm", "occurredAt", "providerName", "description", "documentNumber"],
  energy: ["kind", "energyType", "volumeLiters", "energyKwh", "totalCost", "currency", "odometerKm", "isFullTank", "occurredAt", "providerName"],
  service: ["type", "title", "totalCost", "currency", "odometerKm", "engineHours", "occurredAt", "providerName", "description", "documentNumber", "maintenanceKeys", "maintenancePlans"],
  document: ["type", "title", "documentNumber", "issuerName", "issuedAt", "expiresAt", "description", "reminder"],
  maintenance: ["key", "title", "completionEventType", "intervalKm", "intervalMonths", "intervalEngineHours", "warningKmBefore", "warningDaysBefore", "warningEngineHoursBefore", "telegramEnabled", "notifyWhenDue", "reminderOffsets", "remindAt", "timeZone"],
  update_maintenance: ["id", "key", "title", "completionEventType", "intervalKm", "intervalMonths", "intervalEngineHours", "warningKmBefore", "warningDaysBefore", "warningEngineHoursBefore", "telegramEnabled", "notifyWhenDue", "reminderOffsets", "remindAt", "timeZone"],
  profile: ["fuelType", "bodyType", "doorCount", "seatCount", "trimLevel", "exteriorColor", "engineCode", "engineFamily", "displacementCc", "aspirationType", "powerKw", "powerHp", "transmissionType", "transmissionCode", "driveType", "fuelTankCapacityLiters", "adBlueTankCapacityLiters", "batteryGrossCapacityKwh", "batteryUsableCapacityKwh"],
  add_vehicle: ["vin", "nickname", "make", "modelYear", "licensePlate", "country"],
  update_vehicle: ["vin", "nickname", "make", "modelYear", "licensePlate", "country"],
  archive_vehicle: ["id"], restore_vehicle: ["id"], delete_document: ["id"], deactivate_maintenance: ["id"],
  request_report: ["sourceKey"],
  reminder: ["title", "dueDate", "remindAt", "timeZone", "offsets"],
  update_reminder: ["id", "title", "dueDate", "remindAt", "timeZone", "offsets"],
  cancel_reminder: ["id"], complete_reminder: ["id"],
};

export const ACTION_GUIDE = `Available proposed operations and input fields (omit unknown optional fields):
mileage: odometerKm required integer >=0; engineHours?, recordedAt? ISO date.
expense: category required (maintenance,repair,parts,insurance,inspection,tax,parking,toll,fine,wash,detailing,accessories,tires,roadside,registration,other); title,currency,totalCost required; odometerKm?,occurredAt?,providerName?,description?.
energy: kind fuel|charge, energyType required (petrol,diesel,lpg,cng,electricity,hydrogen or unspecified); volumeLiters for fuel OR energyKwh for charge required; totalCost?,currency?,odometerKm?,isFullTank?,occurredAt?,providerName?. NEVER infer full tank. If not explicitly stated, isFullTank=false. Unknown fuel type=unspecified. Money requires currency.
service: type required maintenance|repair|diagnostic|inspection|replacement|upgrade|other; title required; totalCost?,currency?,odometerKm?,occurredAt?,providerName?,description?. Cost here is informational, NOT automatically a financial expense.
service.maintenanceKeys: explicit completed tasks only: engine_oil,engine_oil_filter,air_filter,cabin_filter,fuel_filter,timing_belt,timing_chain,brake_fluid,coolant,transmission_oil,spark_plugs, or an exact custom rule key. Oil does NOT imply an oil filter. "Filters" is ambiguous: ask which. Generic repair must not reset all maintenance rules.
service.maintenancePlans: optional array of complete maintenance-rule inputs for the performed keys, saved atomically with the service. Use ONLY when the user explicitly supplied/confirmed the next interval or explicitly asks to change an existing interval. Ask for missing service odometer for a km-based plan. Preserve existing unchanged intervals. Set telegramEnabled=true only when notifications are requested; never invent manufacturer intervals. completionEventType=maintenance.<key>.completed. A bare "changed oil" saves the fact and asks about a missing interval, never guesses 10000 km/12 months.
document: type required insurance|registration|inspection|service-invoice|purchase|warranty|tax|fine|receipt|manual|other; title required; documentNumber?,issuerName?,issuedAt?,expiresAt? ISO dates,description?. Optional reminder={offsets?,remindAt?,timeZone?} links notifications to expiresAt and saves both atomically; use when requested, never without an expiry date. Creates metadata, never claims a file upload. Insurance/registration/warranty/inspection are supported, but never infer a legal expiry or auto-renewal.
maintenance: key (stable lower-case ASCII underscore slug), title, completionEventType required; intervalKm?,intervalMonths?,warningKmBefore?,warningDaysBefore?,telegramEnabled?,notifyWhenDue?,reminderOffsets?,remindAt?,timeZone?. reminderOffsets uses the same date units as reminder.offsets. Calendar notices, km warnings and one due notice use the actual latest completion of THAT key, whichever criterion is reached first. Missing completion date/mileage stays unknown. update_maintenance: exact rule id plus complete revised fields. Do not create duplicate rules for the same work; update the existing rule.
profile: only explicitly confirmed technical fields: fuelType?,bodyType?,doorCount?,seatCount?,trimLevel?,exteriorColor?,engineCode?,engineFamily?,displacementCc?,powerKw?,powerHp?,transmissionType?,driveType?,fuelTankCapacityLiters?.
add_vehicle: vin? (17 characters),nickname?,make?,modelYear? (4-digit string),licensePlate?,country? (2-letter code); require at least VIN or a meaningful name.
update_vehicle: vin?,nickname?,make?,modelYear?,licensePlate?,country?.
archive_vehicle / restore_vehicle: input={id: vehicleId}; target must match vehicleId.
delete_document / deactivate_maintenance: input={id: exact record UUID from the provided context}.
reminder: title, dueDate (YYYY-MM-DD) required. remindAt? (HH:mm), timeZone? (IANA), offsets? array of {amount:integer>=0,unit:days|weeks|months}, max 10.
This is a dated Telegram notification, NOT a recurring maintenance rule. Calendar months are not 30 days.
For a clear personal upcoming event statement such as "I have inspection on 10\\11-27", propose reminder, unless it is a question, example, quote or hypothetical. Numeric local dates are DAY-MONTH-YEAR: 10\\11-27 = 2027-11-10. Never guess a missing year or ambiguous date.
If omitted, the preview offers notifications one calendar month and one week before, at 09:00 Europe/Warsaw. These are editable defaults, not a manufacturer requirement. Use requested offsets/time/zone exactly; 0 days = on the event date. Never invent extra notices.
update_reminder: exact id from reminders context plus the complete revised reminder fields (preserve unchanged fields).
cancel_reminder / complete_reminder: input={id: exact reminder UUID from context}. Never claim cancellation/completion before confirmation.
Reminders with maintenanceRuleId are generated from maintenance rules, not standalone dated events. Their dueDate may be the generation date; use serviceDueDate and targetOdometerKm for the actual service condition. Do not propose update_reminder or complete_reminder for them: record the actual completed service with the matching maintenanceKeys, or update_maintenance to change the rule. Cancelling a generated reminder disables ALL Telegram notifications for its rule, so explain this scope explicitly before proposing cancellation.
${REPORT_ACTION_GUIDE}
Do not include ownerId,userId,source,confidence,arbitrary URLs,SQL or code. vehicleId must be an exact ID from the owner's garage. add_vehicle needs no vehicleId.`;

@Injectable()
export class TelegramActionsService {
  constructor(
    private readonly garage: GarageService,
    private readonly mileage: MileageService,
    private readonly expenses: ExpensesService,
    private readonly energy: EnergyService,
    private readonly services: ServiceRecordsService,
    private readonly documents: DocumentsService,
    private readonly maintenance: MaintenanceService,
    private readonly profiles: VehicleProfileService,
    private readonly reports: TelegramReportsService,
    private readonly reminders: RemindersService,
  ) {}

  ensureReportAccess(ownerId: string) { return this.reports.ensureAccess(ownerId); }

  async prepare(value: unknown): Promise<BotAction> {
    const fail = () => new BadRequestException("Некоректні дані дії. Уточніть, будь ласка, значення.");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw fail();
    const raw = value as Record<string, unknown>;
    if (Object.keys(raw).some((key) => !["operation", "vehicleId", "input"].includes(key))) throw fail();
    if (!ACTION_NAMES.includes(raw.operation as BotAction["operation"])) throw fail();
    if (!raw.input || typeof raw.input !== "object" || Array.isArray(raw.input)) throw fail();
    const operation = raw.operation as BotAction["operation"];
    const input = Object.fromEntries(Object.entries(raw.input).filter(([, value]) => value != null)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
    if (Object.keys(input).some((key) => !INPUT_FIELDS[operation].includes(key))) throw fail();
    if (!Object.keys(input).length) throw fail();
    if (operation !== "add_vehicle") {
      const ids = plainToInstance(RecordIdDto, { id: raw.vehicleId });
      if ((await validate(ids)).length) throw fail();
    }
    if (Object.values(input).some((value) => value === "")) throw fail();
    for (const key of ["issuedAt", "expiresAt", "recordedAt", "occurredAt"]) {
      if (key in input) {
        if (typeof input[key] !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(input[key] as string)) throw fail();
        const date = new Date(input[key] as string);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== (input[key] as string).slice(0, 10)) throw fail();
      }
    }
    if (input.currency !== undefined && (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency))) throw fail();
    if (input.totalCost !== undefined && input.currency === undefined) throw fail();
    if (input.odometerKm !== undefined && Number(input.odometerKm) > 2147483647) throw fail();
    const dto = plainToInstance(DTOS[operation], input);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true })).length) throw fail();
    if (operation === "expense" && input.totalCost === undefined) throw fail();
    if (operation === "energy") {
      if (input.kind === "fuel" ? !(Number(input.volumeLiters) > 0) || input.energyKwh !== undefined
        : !(Number(input.energyKwh) > 0) || input.volumeLiters !== undefined || input.isFullTank === true) throw fail();
      if (input.isFullTank === undefined) input.isFullTank = false;
    }
    if (operation === "document" && !["insurance", "registration", "inspection", "service-invoice", "purchase", "warranty", "tax", "fine", "receipt", "manual", "other"].includes(String(input.type))) throw fail();
    if (operation === "add_vehicle" && !input.vin && !input.nickname && !input.make) throw fail();
    if (operation === "maintenance" && !input.intervalKm && !input.intervalMonths && !input.intervalEngineHours) throw fail();
    if (operation === "maintenance" || operation === "update_maintenance") validateMaintenanceRule(input as unknown as CreateMaintenanceRuleDto);
    if (operation === "service" && input.maintenancePlans) {
      for (const plan of input.maintenancePlans as CreateMaintenanceRuleDto[]) {
        if (Object.keys(plan).some(key => !INPUT_FIELDS.maintenance.includes(key)) || !(input.maintenanceKeys as string[] | undefined)?.includes(plan.key)) throw fail();
        validateMaintenanceRule(plan);
        if (plan.intervalKm && input.odometerKm === undefined || plan.intervalEngineHours && input.engineHours === undefined) throw fail();
      }
    }
    if (operation === "document" && input.reminder) {
      if (!input.expiresAt) throw fail();
      const schedule = buildReminderSchedule({ ...(input.reminder as object), title: String(input.title), dueDate: String(input.expiresAt).slice(0, 10) });
      input.reminder = { offsets: schedule.offsets, remindAt: schedule.remindAt, timeZone: schedule.timeZone };
    }
    if (operation === "reminder" || operation === "update_reminder") {
      const { scheduledAt, ...normalized } = buildReminderSchedule(input as unknown as CreateReminderDto);
      Object.assign(input, normalized);
    }
    if (["archive_vehicle", "restore_vehicle"].includes(operation) && input.id !== raw.vehicleId) throw fail();
    return { operation, vehicleId: typeof raw.vehicleId === "string" ? raw.vehicleId : undefined, input };
  }

  async execute(ownerId: string, proposed: BotAction, language: BotLanguage): Promise<string> {
    const { expectedVin, expectedReminderRevision, ...candidate } = proposed;
    const action = await this.prepare(candidate);
    const vehicleId = action.vehicleId!;
    // The model never supplies ownership. Domain services enforce it again at execution time.
    if (action.operation !== "add_vehicle") {
      const vehicle = await this.garage.getVehicle(ownerId, vehicleId);
      if (vehicle.isArchived && action.operation !== "restore_vehicle") throw new BadRequestException("Авто в архіві");
    }
    const data = action.input;
    switch (action.operation) {
      case "mileage": {
        const dto = plainToInstance(CreateMileageReadingDto, data);
        await this.mileage.recordReading(ownerId, vehicleId, { ...dto, source: "telegram", confidence: 1, recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : undefined });
        break;
      }
      case "expense": {
        const dto = plainToInstance(CreateExpenseDto, data);
        await this.expenses.createExpense(ownerId, vehicleId, { ...dto, source: "telegram", occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined });
        break;
      }
      case "energy": {
        const dto = plainToInstance(CreateEnergyEntryDto, data);
        await this.energy.createEntry(ownerId, vehicleId, { ...dto, source: "telegram", occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined });
        break;
      }
      case "service": {
        const dto = plainToInstance(CreateServiceRecordDto, data);
        await this.services.createRecord(ownerId, vehicleId, { ...dto, source: "telegram", occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined });
        break;
      }
      case "document":
        await this.documents.createDocument(ownerId, vehicleId, { ...plainToInstance(CreateDocumentDto, data), source: "telegram" });
        break;
      case "maintenance":
        await this.maintenance.createRule(ownerId, vehicleId, { ...plainToInstance(CreateMaintenanceRuleDto, data), source: "manual" });
        break;
      case "update_maintenance": await this.maintenance.updateRule(ownerId, vehicleId, String(data.id), { ...plainToInstance(CreateMaintenanceRuleDto, data), source: "manual" }); break;
      case "profile":
        await this.profiles.createProfileVersion(ownerId, vehicleId, { ...plainToInstance(CreateVehicleProfileDto, data), source: "manual-confirmed" });
        break;
      case "add_vehicle": {
        const vehicles = await this.garage.getVehicles(ownerId, true);
        if (data.vin && vehicles.some((v) => v.vin?.toUpperCase() === String(data.vin).toUpperCase())) {
          return botText(language, "Це авто вже є в гаражі. Повторно його не додавав.", "Ten samochód jest już w garażu. Nie dodano duplikatu.", "This car is already in your garage. No duplicate was added.");
        }
        await this.garage.createVehicle(ownerId, plainToInstance(CreateVehicleDto, data));
        break;
      }
      case "update_vehicle": await this.garage.updateVehicle(ownerId, vehicleId, plainToInstance(UpdateVehicleDto, data)); break;
      case "archive_vehicle": await this.garage.archiveVehicle(ownerId, vehicleId); break;
      case "restore_vehicle": await this.garage.restoreVehicle(ownerId, vehicleId); break;
      case "delete_document": await this.documents.deleteDocument(ownerId, vehicleId, String(data.id)); break;
      case "deactivate_maintenance": await this.maintenance.deactivateRule(ownerId, vehicleId, String(data.id)); break;
      case "request_report": return this.reports.request(ownerId, vehicleId, String(data.sourceKey), expectedVin, language);
      case "reminder": case "update_reminder":
        await this.reminders.save(ownerId, vehicleId, plainToInstance(CreateReminderDto, data), action.operation === "update_reminder" ? String(data.id) : undefined, expectedReminderRevision);
        return botText(language, "Нагадування збережено. Переглянути: /reminders. Час і строки можна змінити в чаті або на сайті.", "Przypomnienie zapisano. Lista: /reminders. Godzinę i terminy możesz zmienić w czacie lub na stronie.", "Reminder saved. View it with /reminders. You can change its time and notice periods in chat or on the website.")
          + (this.reminders.deliveryEnabled ? "" : "\n" + botText(language, "Автоматичне надсилання ще не ввімкнено на сервері.", "Automatyczna wysyłka nie jest jeszcze włączona na serwerze.", "Automatic delivery is not yet enabled on the server."));
      case "cancel_reminder": case "complete_reminder":
        await this.reminders.setStatus(ownerId, vehicleId, String(data.id), action.operation === "cancel_reminder" ? "cancelled" : "completed", expectedReminderRevision);
        return botText(language, "Нагадування закрито. Наступні сповіщення для нього скасовано.", "Przypomnienie zamknięto. Kolejne powiadomienia zostały anulowane.", "Reminder closed. Its remaining notifications have been cancelled.");
    }
    let answer = botText(language, "Збережено. Зміни доступні й на сайті в цьому обліковому записі.", "Zapisano. Zmiany są dostępne również na stronie na tym koncie.", "Saved. The changes are also available on the website in this account.");
    if (action.operation === "service" && data.totalCost !== undefined) answer += "\n" + botText(language,
      "Вартість сервісу довідкова. Для фінансового обліку додайте окрему витрату.",
      "Koszt serwisu jest informacyjny. Do rozliczeń dodaj osobny wydatek.",
      "The service cost is informational. Add a separate expense to include it in spending totals.");
    if (action.operation === "service" && Array.isArray(data.maintenanceKeys) && data.maintenanceKeys.length && !data.maintenancePlans) {
      const rules = await this.maintenance.listRules(ownerId, vehicleId);
      const missing = data.maintenanceKeys.filter(key => !rules.some(rule => rule.key === key));
      if (missing.length) answer += "\n" + botText(language, "Який інтервал установити для наступного обслуговування? Можна вказати пробіг, місяці або обидва критерії.", "Jaki interwał ustawić dla następnego serwisu? Możesz podać kilometry, miesiące lub oba kryteria.", "What interval should I use for the next service? You can specify kilometres, months, or both.");
    }
    if ((action.operation === "document" && data.reminder || ["maintenance", "update_maintenance"].includes(action.operation) && data.telegramEnabled || action.operation === "service" && data.maintenancePlans)
      && !this.reminders.deliveryEnabled) answer += "\n" + botText(language, "Автоматичне надсилання ще не ввімкнено на сервері.", "Automatyczna wysyłka nie jest jeszcze włączona na serwerze.", "Automatic delivery is not yet enabled on the server.");
    return answer;
  }

  getReminder(ownerId: string, vehicleId: string, id: string) { return this.reminders.get(ownerId, vehicleId, id); }
  get reminderDeliveryEnabled() { return this.reminders.deliveryEnabled; }
}
