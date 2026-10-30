import { VEHICLE_DATABASES_SOURCES } from "../external-reports/providers/vehicle-databases/source-catalog";
import { ONE_AUTO_SOURCES } from "../external-reports/services/one-auto-reports.service";
import { botText, type BotLanguage } from "./telegram-conversation.types";

const LABELS: Record<string, [string, string, string]> = {
  "basic-vin-decode": ["Базові дані VIN", "Podstawowe dane VIN", "Basic VIN details"],
  "advanced-vin-decode": ["Розширені дані VIN", "Rozszerzone dane VIN", "Extended VIN details"],
  "europe-vin-decode": ["Європейські дані VIN", "Europejskie dane VIN", "European VIN details"],
  "market-value": ["Ринкова оцінка", "Wycena rynkowa", "Market valuation"],
  "sales-history": ["Історія продажів", "Historia sprzedaży", "Sales history"],
  auction: ["Історія аукціонів", "Historia aukcji", "Auction history"],
  "stolen-check": ["Перевірка на викрадення", "Sprawdzenie kradzieży", "Stolen vehicle check"],
  "title-check": ["Правовий статус", "Status prawny", "Title status"],
  "vehicle-recalls": ["Сервісні кампанії", "Akcje serwisowe", "Recall campaigns"],
  "vehicle-repairs": ["Типові ремонти", "Typowe naprawy", "Common repairs"],
  "repair-estimates": ["Оцінка ремонту", "Wycena naprawy", "Repair estimate"],
  "vehicle-maintenance": ["Регламент обслуговування", "Harmonogram serwisu", "Maintenance schedule"],
  dimensions: ["Розміри автомобіля", "Wymiary auta", "Vehicle dimensions"],
  windshield: ["Підбір лобового скла", "Dobór szyby przedniej", "Windscreen matching"],
  "vin-suggestion": ["Підказки VIN", "Sugestie VIN", "VIN suggestions"],
  "owner-manual": ["Інструкція власника", "Instrukcja obsługi", "Owner's manual"],
  "oneauto-oe-build-sheet-europe-vin": ["Європейська заводська комплектація", "Europejskie wyposażenie fabryczne", "European factory equipment"],
  "oneauto-oe-build-sheet-vin": ["Заводська комплектація", "Wyposażenie fabryczne", "Factory build sheet"],
  "oneauto-oe-service-schedule-vin": ["Заводський регламент ТО", "Fabryczny harmonogram serwisu", "Factory maintenance schedule"],
  "oneauto-recall-check-vin": ["Перевірка сервісних кампаній", "Sprawdzenie akcji serwisowych", "Recall check"],
  "oneauto-recall-report-vin": ["Звіт про сервісні кампанії", "Raport akcji serwisowych", "Recall report"],
  "oneauto-vin-decode-basic-us": ["Базові дані VIN США", "Podstawowe dane VIN USA", "Basic US VIN details"],
  "oneauto-vin-decode-plus-us": ["Розширені дані VIN США", "Rozszerzone dane VIN USA", "Extended US VIN details"],
};

export const TELEGRAM_REPORT_SOURCES = [
  ...VEHICLE_DATABASES_SOURCES.filter(source => source.input === "vin" && source.enabled !== false)
    .map(source => ({ key: source.key, name: source.apiName, provider: "vehicle-databases" as const })),
  ...ONE_AUTO_SOURCES.map(source => ({ key: source.key, name: source.apiName, provider: "oneauto" as const })),
];

export const TELEGRAM_REPORT_KEYS = TELEGRAM_REPORT_SOURCES.map(source => source.key);

export function reportLabel(key: string, language: BotLanguage): string {
  return LABELS[key] ? botText(language, ...LABELS[key]) : key;
}

export const REPORT_ACTION_GUIDE = `request_report: input={sourceKey: one exact key below}. Requests ONE new external report for the selected car's current VIN. The provider may charge money or quota. Never promise a price, free access, a clean history or a completed lookup. The server requires confirmation with a cost warning. If the user wants all reports, ask which report to fetch first. Only propose this for an explicit new lookup, not a question about already saved records.
Allowed report keys: ${TELEGRAM_REPORT_KEYS.join(", ")}.`;
