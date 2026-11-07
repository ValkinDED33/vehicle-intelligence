import { botText, type BotLanguage } from "../telegram/telegram-conversation.types";
import type { VinAccessStatus } from "../vin-access/vin-access.service";

export interface SavedVinFacts {
  vin: string; provider: string; status: string;
  make?: string | null; model?: string | null; modelYear?: string | number | null;
  engineCode?: string | null; displacementCc?: number | null;
  transmissionType?: string | null;
}

export function answerSavedVinQuestion(message: string, language: BotLanguage, access: VinAccessStatus | { unavailable: boolean }, facts: SavedVinFacts | null): string | null {
  const mentionsVin = /\bvin\b|він[- ]?код|вин[- ]?код/i.test(message);
  if (!mentionsVin) return null;
  const state = "state" in access ? access.state : "unavailable";
  const requestsLookup = /^(?:(?:please|будь ласка|proszę)\s+)?(?:check|decode|fetch|run|перевір|проверь|sprawdź)/i.test(message.trim());
  // An eligible Telegram lookup must still reach the planner and its confirmation flow.
  if (state === "available" && requestsLookup) return null;
  const asksAccess = /free|another|again|price|cost|purchas|\bbuy\b|\bpay\b|безкоштов|бесплат|повтор|ще раз|ещ[её] раз|вартіст|скільки кошту|сколько стоит|плат|kup|cena|koszt|darmow|bezpłat|ponown|kolejn/i.test(message)
    || requestsLookup;
  const asksFacts = /(?:list|which|what).{0,45}(?:saved|recorded|known|make|model)|які.{0,45}дані|що.{0,45}(?:збережено|відомо)|какие.{0,45}данные|jakie.{0,45}dane/i.test(message);
  if (!asksAccess && !asksFacts) return null;
  const requestedVins = message.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) ?? [];
  const savedVin = facts?.vin.toUpperCase();
  if (savedVin && requestedVins.some(vin => vin !== savedVin)) facts = null;
  const parts: string[] = [];
  if (asksFacts && facts) {
    if (facts.status === "no-data") parts.push(botText(language,
      "Збережений результат: джерело не має даних за цим VIN. Це не підтверджує відсутність проблем з автомобілем.",
      "Zapisany wynik: źródło nie ma danych dla tego VIN. Nie oznacza to braku problemów z autem.",
      "Saved result: the source has no data for this VIN. This does not prove the car has no issues."));
    else {
      const transmission = facts.transmissionType === "manual" ? botText(language, "механічна", "manualna", "manual") : facts.transmissionType === "automatic" ? botText(language, "автоматична", "automatyczna", "automatic") : facts.transmissionType;
      const rows = [
        [botText(language, "Марка", "Marka", "Make"), facts.make],
        [botText(language, "Модель", "Model", "Model"), facts.model],
        [botText(language, "Модельний рік", "Rok modelowy", "Model year"), facts.modelYear],
        [botText(language, "Код двигуна", "Kod silnika", "Engine code"), facts.engineCode],
        [botText(language, "Об’єм двигуна", "Pojemność silnika", "Displacement"), facts.displacementCc != null ? `${facts.displacementCc} ${botText(language, "см³", "cm³", "cc")}` : null],
        [botText(language, "Коробка передач", "Skrzynia biegów", "Transmission"), transmission],
      ].filter(([, value]) => value !== undefined && value !== null && value !== "");
      parts.push(botText(language, "Збережені дані джерела", "Zapisane dane źródła", "Saved provider data") + ` (${facts.provider}), VIN ${facts.vin}:\n` + rows.map(([label, value]) => `${label}: ${value}`).join("\n"));
    }
    parts.push(botText(language, "Нову VIN-перевірку не запускав.", "Nie uruchomiono nowego sprawdzenia VIN.", "No new VIN lookup was started."));
  }
  if (asksAccess) {
    parts.push(state === "used" ? botText(language,
      "Єдину безкоштовну VIN-перевірку цього акаунта вже використано. Повторні перевірки закрито; оплата ще не підключена. Безкоштовна спроба не поновлюється. Збережені результати можна переглядати без нового запиту.",
      "Jedyne bezpłatne sprawdzenie VIN na tym koncie zostało już wykorzystane. Kolejne sprawdzenia są zablokowane; płatności nie są jeszcze dostępne. Bezpłatna próba nie odnawia się. Zapisane wyniki można przeglądać bez nowego zapytania.",
      "This account's only free VIN check has already been used. Further checks are locked; payments are not enabled. The free allowance does not renew. Saved results remain available without a new lookup.")
      : state === "available" ? botText(language,
        "Доступна одна безкоштовна перевірка одного VIN в одному джерелі. Відповідь «даних немає» теж зараховується. Запит потребує окремого підтвердження. Оплата повторних перевірок ще не підключена.",
        "Dostępne jest jedno bezpłatne sprawdzenie jednego VIN w jednym źródle. Odpowiedź „brak danych” również się liczy. Zapytanie wymaga osobnego potwierdzenia. Płatności za kolejne sprawdzenia nie są jeszcze dostępne.",
        "One free check of one VIN at one source is available. A no-data result also counts. The request needs separate confirmation. Payments for further checks are not enabled.")
        : state === "in_progress" ? botText(language, "VIN-перевірка вже триває. Дочекайтеся результату.", "Sprawdzenie VIN już trwa. Poczekaj na wynik.", "A VIN check is already in progress. Please wait for its result.")
        : botText(language, "Статус VIN-доступу не підтверджено. Не повторюйте запит до перевірки попереднього результату підтримкою.", "Status dostępu do VIN nie jest potwierdzony. Nie ponawiaj zapytania, dopóki pomoc techniczna nie sprawdzi poprzedniego wyniku.", "VIN access is unconfirmed. Do not repeat the request until support checks the previous result."));
  }
  return parts.length ? parts.join("\n\n") : null;
}
