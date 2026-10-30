import { useSyncExternalStore } from "react";
import { translations } from "./translations";

export type UiLanguage = "uk" | "pl" | "en";
const caseInsensitive = new Map(Object.keys(translations).map((key) => [key.toLocaleLowerCase("uk"), key]));
const LANGUAGE_KEY = "cara.language";
const LANGUAGE_EVENT = "cara:language";

export function getUiLanguage(): UiLanguage {
  const value = localStorage.getItem(LANGUAGE_KEY);
  return value === "pl" || value === "en" ? value : "uk";
}

export function setUiLanguage(value: string | null | undefined): void {
  const language = value === "pl" || value === "en" ? value : "uk";
  localStorage.setItem(LANGUAGE_KEY, language);
  document.documentElement.lang = language;
  window.dispatchEvent(new Event(LANGUAGE_EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener(LANGUAGE_EVENT, listener);
  return () => window.removeEventListener(LANGUAGE_EVENT, listener);
}

export function useUiLanguage(): UiLanguage {
  return useSyncExternalStore(subscribe, getUiLanguage, () => "uk");
}

export function getUiLocale(): string {
  return getUiLanguage() === "pl" ? "pl-PL" : getUiLanguage() === "en" ? "en-GB" : "uk-UA";
}

export function hasTranslation(source: string): boolean {
  return Object.hasOwn(translations, source) || caseInsensitive.has(source.toLocaleLowerCase("uk"));
}

export function enumLabel(value: string): string {
  const labels: Record<string, string> = {
    petrol: "Бензин", diesel: "Дизель", electricity: "Електроенергія", electric: "Електро", hybrid: "Гібрид",
    fuel: "Пальне", charge: "Заряджання", hydrogen: "Водень", unspecified: "Не вказано",
    maintenance: "Обслуговування", repair: "Ремонт", replacement: "Заміна", diagnostic: "Діагностика", inspection: "Техогляд", upgrade: "Модернізація", other: "Інше",
    manual: "Вручну", web: "Сайт", telegram: "Telegram", integration: "Інтеграція", system: "Система", ai: "AI", "ai-inferred": "Оцінка AI", "manual-confirmed": "Підтверджено власником",
    completed: "Завершено", pending: "Очікує обробки", uploaded: "Завантажено", processing: "Обробляється", failed: "Помилка", error: "Помилка", success: "Успішно", "no-data": "Даних немає", ready: "Готово", draft: "Чернетка",
  };
  return t(labels[value] ?? value);
}

export function t(source: string, values: Record<string, unknown> = {}): string {
  const language = getUiLanguage();
  const key = translations[source] ? source : caseInsensitive.get(source.toLocaleLowerCase("uk"));
  let translated = language === "uk" || !key ? source : translations[key][language === "pl" ? 0 : 1];
  if (language !== "uk" && key && key !== source) {
    if (source === source.toLocaleUpperCase("uk")) translated = translated.toLocaleUpperCase(language);
    else if (source[0] === source[0]?.toLocaleLowerCase("uk")) translated = translated[0]?.toLocaleLowerCase(language) + translated.slice(1);
  }
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
