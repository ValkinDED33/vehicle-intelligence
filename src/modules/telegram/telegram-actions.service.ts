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
import { CreateMaintenanceRuleDto } from "../maintenance/dto/maintenance.dto";
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
};

const INPUT_FIELDS: Record<BotAction["operation"], readonly string[]> = {
  mileage: ["odometerKm", "engineHours", "recordedAt"],
  expense: ["category", "subcategory", "title", "currency", "totalCost", "odometerKm", "occurredAt", "providerName", "description", "documentNumber"],
  energy: ["kind", "energyType", "volumeLiters", "energyKwh", "totalCost", "currency", "odometerKm", "isFullTank", "occurredAt", "providerName"],
  service: ["type", "title", "totalCost", "currency", "odometerKm", "engineHours", "occurredAt", "providerName", "description", "documentNumber"],
  document: ["type", "title", "documentNumber", "issuerName", "issuedAt", "expiresAt", "description"],
  maintenance: ["key", "title", "completionEventType", "intervalKm", "intervalMonths", "intervalEngineHours", "warningKmBefore", "warningDaysBefore", "warningEngineHoursBefore"],
  profile: ["fuelType", "bodyType", "doorCount", "seatCount", "trimLevel", "exteriorColor", "engineCode", "engineFamily", "displacementCc", "aspirationType", "powerKw", "powerHp", "transmissionType", "transmissionCode", "driveType", "fuelTankCapacityLiters", "adBlueTankCapacityLiters", "batteryGrossCapacityKwh", "batteryUsableCapacityKwh"],
  add_vehicle: ["vin", "nickname", "make", "modelYear", "licensePlate", "country"],
  update_vehicle: ["vin", "nickname", "make", "modelYear", "licensePlate", "country"],
  archive_vehicle: ["id"], restore_vehicle: ["id"], delete_document: ["id"], deactivate_maintenance: ["id"],
  request_report: ["sourceKey"],
};

export const ACTION_GUIDE = `Available proposed operations and input fields (omit unknown optional fields):
mileage: odometerKm required integer >=0; engineHours?, recordedAt? ISO date.
expense: category required (maintenance,repair,parts,insurance,inspection,tax,parking,toll,fine,wash,detailing,accessories,tires,roadside,registration,other); title,currency,totalCost required; odometerKm?,occurredAt?,providerName?,description?.
energy: kind fuel|charge, energyType required (petrol,diesel,lpg,cng,electricity,hydrogen or unspecified); volumeLiters for fuel OR energyKwh for charge required; totalCost?,currency?,odometerKm?,isFullTank?,occurredAt?,providerName?. NEVER infer full tank. If not explicitly stated, isFullTank=false. Unknown fuel type=unspecified. Money requires currency.
service: type required maintenance|repair|diagnostic|inspection|replacement|upgrade|other; title required; totalCost?,currency?,odometerKm?,occurredAt?,providerName?,description?. Cost here is informational, NOT automatically a financial expense.
document: type required insurance|registration|inspection|service-invoice|purchase|warranty|tax|fine|receipt|manual|other; title required; documentNumber?,issuerName?,issuedAt?,expiresAt? ISO dates,description?. Creates metadata only, never claims a file upload.
maintenance: key (stable ASCII slug), title, completionEventType required; intervalKm?,intervalMonths?,warningKmBefore?,warningDaysBefore?. Ask the user for an interval; never invent a manufacturer schedule.
profile: only explicitly confirmed technical fields: fuelType?,bodyType?,doorCount?,seatCount?,trimLevel?,exteriorColor?,engineCode?,engineFamily?,displacementCc?,powerKw?,powerHp?,transmissionType?,driveType?,fuelTankCapacityLiters?.
add_vehicle: vin? (17 characters),nickname?,make?,modelYear? (4-digit string),licensePlate?,country? (2-letter code); require at least VIN or a meaningful name.
update_vehicle: vin?,nickname?,make?,modelYear?,licensePlate?,country?.
archive_vehicle / restore_vehicle: input={id: vehicleId}; target must match vehicleId.
delete_document / deactivate_maintenance: input={id: exact record UUID from the provided context}.
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
  ) {}

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
    if (["archive_vehicle", "restore_vehicle"].includes(operation) && input.id !== raw.vehicleId) throw fail();
    return { operation, vehicleId: typeof raw.vehicleId === "string" ? raw.vehicleId : undefined, input };
  }

  async execute(ownerId: string, proposed: BotAction, language: BotLanguage): Promise<string> {
    const { expectedVin, ...candidate } = proposed;
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
    }
    let answer = botText(language, "Збережено. Зміни доступні й на сайті в цьому обліковому записі.", "Zapisano. Zmiany są dostępne również na stronie na tym koncie.", "Saved. The changes are also available on the website in this account.");
    if (action.operation === "service" && data.totalCost !== undefined) answer += "\n" + botText(language,
      "Вартість сервісу довідкова. Для фінансового обліку додайте окрему витрату.",
      "Koszt serwisu jest informacyjny. Do rozliczeń dodaj osobny wydatek.",
      "The service cost is informational. Add a separate expense to include it in spending totals.");
    return answer;
  }
}
