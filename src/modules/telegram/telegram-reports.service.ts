import { BadRequestException, Injectable } from "@nestjs/common";
import { IsIn } from "class-validator";
import { GarageService } from "../garage/services/garage.service";
import { OneAutoReportsService } from "../external-reports/services/one-auto-reports.service";
import { VehicleDatabasesSourcesService } from "../external-reports/services/vehicle-databases-sources.service";
import { TELEGRAM_REPORT_KEYS, TELEGRAM_REPORT_SOURCES, reportLabel } from "./telegram-report-catalog";
import { botText, type BotLanguage } from "./telegram-conversation.types";

export class RequestTelegramReportDto {
  @IsIn(TELEGRAM_REPORT_KEYS)
  sourceKey!: string;
}

@Injectable()
export class TelegramReportsService {
  constructor(
    private readonly garage: GarageService,
    private readonly vehicleDatabases: VehicleDatabasesSourcesService,
    private readonly oneAuto: OneAutoReportsService,
  ) {}

  async request(ownerId: string, vehicleId: string, sourceKey: string, expectedVin: string | undefined, language: BotLanguage): Promise<string> {
    const source = TELEGRAM_REPORT_SOURCES.find(item => item.key === sourceKey);
    if (!source) throw new BadRequestException("Невідоме джерело звіту");
    const vehicle = await this.garage.getVehicle(ownerId, vehicleId);
    const vin = vehicle.vin?.trim().toUpperCase();
    if (vehicle.isArchived || !vin || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin) || vin !== expectedVin) {
      throw new BadRequestException("VIN змінився або авто недоступне. Підготуйте запит ще раз.");
    }
    const result = source.provider === "oneauto"
      ? await this.oneAuto.fetchSource(ownerId, vehicleId, sourceKey)
      : await this.vehicleDatabases.fetchSource(ownerId, vehicleId, sourceKey);
    const description = `${reportLabel(sourceKey, language)}\nVIN: ${vin}`;
    if (result.report.status === "no-data") return description + "\n" + botText(language,
      "Провайдер не знайшов даних. Результат запиту збережено на сайті; це не підтверджує відсутність проблем.",
      "Dostawca nie znalazł danych. Wynik zapisano na stronie; nie oznacza to braku problemów.",
      "The provider found no data. The request result is saved on the website; this does not prove the car has no issues.");
    if (result.report.status !== "success") return description + "\n" + botText(language,
      "Звіт містить помилку провайдера. Перевірте його статус на сайті.",
      "Raport zawiera błąd dostawcy. Sprawdź jego status na stronie.",
      "The report contains a provider error. Check its status on the website.");
    return description + "\n" + botText(language,
      "Звіт отримано й збережено в цьому обліковому записі. Відкрийте «Звіти» на сайті, щоб перевірити повний результат.",
      "Raport pobrano i zapisano na tym koncie. Otwórz „Raporty” na stronie, aby sprawdzić pełny wynik.",
      "The report was fetched and saved to this account. Open Reports on the website to review the full result.");
  }
}
