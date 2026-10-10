import {
  Bell,
  Bot,
  CarFront,
  ChartNoAxesCombined,
  ClipboardList,
  FileText,
  Fuel,
  Gauge,
  History,
  House,
  PlugZap,
  Settings,
  Wallet,
  Wrench,
} from "lucide-react";
import type { MaintenanceStatus } from "../api";

export const SECTIONS = [
  { name: "Головна", icon: House },
  { name: "Гараж", icon: CarFront },
  { name: "Профіль авто", icon: ClipboardList },
  { name: "Пробіг", icon: Gauge },
  { name: "Сервіс і ТО", icon: Wrench },
  { name: "Витрати", icon: Wallet },
  { name: "Пальне й енергія", icon: Fuel },
  { name: "Документи", icon: FileText },
  { name: "Історія подій", icon: History },
  { name: "Нагадування", icon: Bell },
  { name: "AI Асистент", icon: Bot },
  { name: "Інтеграції", icon: PlugZap },
  { name: "Звіти", icon: ChartNoAxesCombined },
  { name: "Налаштування", icon: Settings },
];

export const sections = SECTIONS;

export const healthColors = [
  "#00dcae",
  "#2ce59c",
  "#44baff",
  "#6bafff",
  "#aa65ff",
  "#cd6bff",
];

export const donutColors = [
  "#2c72f1",
  "#18c47a",
  "#f5a32b",
  "#9c46ec",
  "#e46bff",
  "#37c6ff",
];

export const CATEGORY_LABELS: Record<string, string> = {
  maintenance: "Обслуговування",
  repair: "Ремонт",
  parts: "Запчастини",
  insurance: "Страхування",
  inspection: "Техогляд",
  tax: "Податок",
  parking: "Паркування",
  toll: "Платні дороги",
  fine: "Штрафи",
  wash: "Мийка",
  detailing: "Детейлінг",
  accessories: "Аксесуари",
  tires: "Шини",
  roadside: "Допомога в дорозі",
  registration: "Реєстрація",
  other: "Інше",
  fuel: "Пальне",
  charge: "Заряджання",
  energy: "Пальне й енергія",
};

export const EVENT_META: Record<string, { title: string; color: string }> = {
  "vehicle.mileage_updated": { title: "Запис пробігу", color: "green" },
  "expense.recorded": { title: "Витрату додано", color: "orange" },
  "service.completed": { title: "Сервісний запис", color: "purple" },
  "energy.refuel": { title: "Заправка", color: "blue" },
  "energy.charge": { title: "Заряджання", color: "green" },
  "external.sale_listing": { title: "Оголошення про продаж", color: "blue" },
  "external.auction_sale": { title: "Продаж на аукціоні", color: "purple" },
  "external.market_valuation": { title: "Ринкова оцінка", color: "green" },
  "external.recall": { title: "Сервісна кампанія", color: "red" },
  "external.vin_decode": { title: "Розшифрування VIN", color: "blue" },
  "external.msrp": { title: "Ціна виробника (MSRP)", color: "green" },
  "external.vin_suggestion": { title: "Запропонований VIN", color: "orange" },
  "external.stolen_check": { title: "Перевірка на викрадення", color: "blue" },
  "external.stolen_alert": { title: "Увага: авто у викраденні!", color: "red" },
  "external.title_check": { title: "Перевірка правового статусу", color: "orange" },
};

export const URGENCY_META: Record<
  MaintenanceStatus["urgency"],
  { tag: string; color: string }
> = {
  stop: { tag: "Терміново", color: "red" },
  check_soon: { tag: "Незабаром", color: "red" },
  attention: { tag: "Увага", color: "purple" },
  normal: { tag: "У нормі", color: "green" },
};

export const MODULE_LABELS: Record<string, string> = {
  mileage: "пробіг",
  expenses: "витрати",
  energy: "пальне",
  "service-records": "сервіс",
  "external-reports": "зовнішній звіт",
};
