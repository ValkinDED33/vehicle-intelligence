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
  { name: "Главная", icon: House },
  { name: "Гараж", icon: CarFront },
  { name: "Профиль авто", icon: ClipboardList },
  { name: "Пробег", icon: Gauge },
  { name: "Сервис и ТО", icon: Wrench },
  { name: "Расходы", icon: Wallet },
  { name: "Топливо и энергия", icon: Fuel },
  { name: "Документы", icon: FileText },
  { name: "История событий", icon: History },
  { name: "Напоминания", icon: Bell },
  { name: "AI Ассистент", icon: Bot },
  { name: "Интеграции", icon: PlugZap },
  { name: "Отчёты", icon: ChartNoAxesCombined },
  { name: "Настройки", icon: Settings },
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
  maintenance: "Обслуживание",
  repair: "Ремонт",
  parts: "Запчасти",
  insurance: "Страховка",
  inspection: "Техосмотр",
  tax: "Налог",
  parking: "Парковка",
  toll: "Дороги",
  fine: "Штрафы",
  wash: "Мойка",
  detailing: "Детейлинг",
  accessories: "Аксессуары",
  tires: "Шины",
  roadside: "Помощь на дороге",
  registration: "Регистрация",
  other: "Прочее",
  fuel: "Топливо",
  charge: "Зарядка",
  energy: "Топливо и энергия",
};

export const EVENT_META: Record<string, { title: string; color: string }> = {
  "vehicle.mileage_updated": { title: "Запись пробега", color: "green" },
  "expense.recorded": { title: "Расход добавлен", color: "orange" },
  "service.completed": { title: "Сервисная запись", color: "purple" },
  "energy.refuel": { title: "Заправка", color: "blue" },
  "energy.charge": { title: "Зарядка", color: "green" },
  "external.sale_listing": { title: "Объявление о продаже", color: "blue" },
  "external.auction_sale": { title: "Продажа на аукционе", color: "purple" },
  "external.market_valuation": { title: "Рыночная оценка", color: "green" },
  "external.recall": { title: "Отзывная кампания", color: "red" },
  "external.vin_decode": { title: "Расшифровка VIN", color: "blue" },
  "external.msrp": { title: "Цена производителя (MSRP)", color: "green" },
  "external.vin_suggestion": { title: "Предложенный VIN", color: "orange" },
  "external.stolen_check": { title: "Проверка на угон", color: "blue" },
  "external.stolen_alert": { title: "Внимание: угон!", color: "red" },
  "external.title_check": { title: "Проверка титула", color: "orange" },
};

export const URGENCY_META: Record<
  MaintenanceStatus["urgency"],
  { tag: string; color: string }
> = {
  stop: { tag: "Срочно", color: "red" },
  check_soon: { tag: "Скоро", color: "red" },
  attention: { tag: "Внимание", color: "purple" },
  normal: { tag: "В норме", color: "green" },
};

export const MODULE_LABELS: Record<string, string> = {
  mileage: "пробег",
  expenses: "расходы",
  energy: "топливо",
  "service-records": "сервис",
  "external-reports": "внешний отчёт",
};

